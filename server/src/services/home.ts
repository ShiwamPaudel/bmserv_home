// Home: what needs attention, in PRD F13 order.
import { and, asc, count, eq, gte, inArray, isNull, lt, lte, sql } from "drizzle-orm";
import { addDays, lastMonths, monthOf, nepalDateOf, todayNepal } from "@bmserv/shared/dates";
import type { CoverageType, DateDisplay, EquipmentStatus } from "@bmserv/shared/enums";
import { coverageLastDay, isCoverageCurrent } from "@bmserv/shared/pms";
import { getDb } from "../db/client";
import { breakdowns, coverage, departments, equipment, equipmentModels, moves, pmsVisits } from "../db/schema";
import type { Actor } from "../lib/http";
import { listBreakdowns } from "./breakdowns";
import { equipmentRows, withAway } from "./equipmentRows";
import { listPms } from "./pms";
import { getSettings } from "./settings";
import { ref } from "../lib/sqlRef";

export async function home(actor: Actor, now = Date.now()) {
  const db = getDb();
  const today = todayNepal(now);
  const s = await getSettings();
  const [open, withProvider, overdue, due] = await Promise.all([
    listBreakdowns(actor, { status: "open" }),
    listBreakdowns(actor, { status: "with_provider" }),
    listPms("overdue"),
    listPms("due"),
  ]);
  const down = [...open, ...withProvider].sort((a, b) => {
    if (actor.role === "engineer") {
      const am = a.assignedTo === actor.id ? 0 : 1;
      const bm = b.assignedTo === actor.id ? 0 : 1;
      if (am !== bm) return am - bm;
    }
    return a.reportedAt - b.reportedAt;
  });
  const pausedLong = withProvider.filter((b) => b.pausedAt !== null && now - b.pausedAt > s.pausedWarnDays * 86_400_000);
  const soon = addDays(today, s.pmsSoonDays);
  const thisWeek = due.filter((v) => v.dueOn <= soon);

  // Equipment past its expected return date (latest open temporary move).
  const lateMoves = await db
    .select({ equipmentId: moves.equipmentId, expectedReturnOn: moves.expectedReturnOn, movedAt: moves.movedAt, id: moves.id })
    .from(moves)
    .where(
      and(
        eq(moves.type, "temporary"),
        isNull(moves.returnedAt),
        lt(moves.expectedReturnOn, today),
        sql`${moves.movedAt} = (select max(m2.moved_at) from moves m2 where m2.equipment_id = ${ref(moves.equipmentId)})`,
      ),
    )
    .orderBy(asc(moves.expectedReturnOn));
  const lateIds = lateMoves.map((m) => m.equipmentId);
  const lateRows = lateIds.length ? withAway(await equipmentRows(db).where(inArray(equipment.id, lateIds))) : [];
  const toReturn = lateMoves
    .map((m) => ({ ...m, equipment: lateRows.find((r) => r.id === m.equipmentId) }))
    .filter((m) => m.equipment && m.equipment.away);

  // Coverage ending in the next 30 days.
  const until = addDays(today, s.coverageWarnDays);
  const covers = await db
    .select()
    .from(coverage)
    .where(and(lte(coverage.startsOn, today), gte(coverage.endsOn, today)))
    .orderBy(asc(coverage.endsOn));
  const ending = covers
    .filter((c) => isCoverageCurrent(c, today))
    .map((c) => ({ ...c, lastDay: coverageLastDay(c.endsOn, c.endedEarlyOn) }))
    .filter((c) => c.lastDay <= until);
  const endingRows = ending.length ? withAway(await equipmentRows(db).where(inArray(equipment.id, ending.map((c) => c.equipmentId)))) : [];

  return {
    today,
    pmsSoonDays: s.pmsSoonDays,
    stats: await dashboardStats(today, now, s.dateDisplay, overdue.length, due.filter((v) => v.dueOn <= addDays(today, 30)).length),
    down,
    pausedLong,
    pmsOverdue: overdue,
    pmsThisWeek: thisWeek,
    toReturn,
    coverageEnding: ending
      .map((c) => ({ id: c.id, type: c.type, lastDay: c.lastDay, equipment: endingRows.find((r) => r.id === c.equipmentId) }))
      .filter((c) => c.equipment),
  };
}

// ---------- Dashboard numbers (charts on Home) ----------

const DAY = 86_400_000;

async function dashboardStats(today: string, now: number, mode: DateDisplay, pmsOverdue: number, pmsDue30: number) {
  const db = getDb();
  const [statusRows, deptRows, coverRows, recent, closed, pmsRows] = await Promise.all([
    db.select({ status: equipment.status, n: count() }).from(equipment).groupBy(equipment.status),
    db
      .select({ id: departments.id, name: departments.name, shortName: departments.shortName, status: equipment.status, n: count() })
      .from(equipment)
      .innerJoin(departments, eq(departments.id, equipment.currentDepartmentId))
      .groupBy(departments.id, equipment.status),
    db
      .select({ equipmentId: coverage.equipmentId, type: coverage.type, startsOn: coverage.startsOn, endsOn: coverage.endsOn, endedEarlyOn: coverage.endedEarlyOn })
      .from(coverage)
      .where(and(lte(coverage.startsOn, today), gte(coverage.endsOn, today))),
    db
      .select({ reportedAt: breakdowns.reportedAt, typeName: equipmentModels.typeName, manufacturer: equipmentModels.manufacturer, model: equipmentModels.model, modelId: equipmentModels.id })
      .from(breakdowns)
      .innerJoin(equipment, eq(equipment.id, breakdowns.equipmentId))
      .innerJoin(equipmentModels, eq(equipmentModels.id, equipment.modelId))
      .where(gte(breakdowns.reportedAt, now - 366 * DAY)),
    db
      .select({ reportedAt: breakdowns.reportedAt, closedAt: breakdowns.closedAt })
      .from(breakdowns)
      .where(and(eq(breakdowns.status, "fixed"), gte(breakdowns.closedAt, now - 90 * DAY))),
    db
      .select({ status: pmsVisits.status, n: count() })
      .from(pmsVisits)
      .where(and(gte(pmsVisits.dueOn, addDays(today, -90)), lte(pmsVisits.dueOn, today)))
      .groupBy(pmsVisits.status),
  ]);

  const byStatus = { working: 0, breakdown: 0, out_of_service: 0 } as Record<EquipmentStatus, number>;
  for (const r of statusRows) byStatus[r.status] = r.n;
  const total = byStatus.working + byStatus.breakdown + byStatus.out_of_service;

  const depts = new Map<string, { id: string; name: string; total: number; down: number }>();
  for (const r of deptRows) {
    const d = depts.get(r.id) ?? { id: r.id, name: r.shortName || r.name, total: 0, down: 0 };
    d.total += r.n;
    if (r.status === "breakdown") d.down += r.n;
    depts.set(r.id, d);
  }

  const coveredBy = new Map<string, CoverageType>();
  for (const c of coverRows) if (isCoverageCurrent(c, today)) coveredBy.set(c.equipmentId, c.type);
  const mix = { warranty: 0, amc: 0, cmc: 0 } as Record<CoverageType, number>;
  for (const type of coveredBy.values()) mix[type] += 1;

  const months = lastMonths(today, 6, mode);
  const perMonth = new Map(months.map((m) => [m.key, 0]));
  for (const b of recent) {
    const k = monthOf(nepalDateOf(b.reportedAt), mode).key;
    if (perMonth.has(k)) perMonth.set(k, (perMonth.get(k) ?? 0) + 1);
  }

  const models = new Map<string, { label: string; n: number }>();
  for (const b of recent) {
    const m = models.get(b.modelId) ?? { label: `${b.typeName} ${b.manufacturer} ${b.model}`, n: 0 };
    m.n += 1;
    models.set(b.modelId, m);
  }

  const repairs = closed.filter((c) => c.closedAt !== null).map((c) => (c.closedAt as number) - c.reportedAt);
  const avgRepairMs = repairs.length ? Math.round(repairs.reduce((a, b) => a + b, 0) / repairs.length) : null;

  const pms = { done: 0, skipped: 0, scheduled: 0 };
  for (const r of pmsRows) pms[r.status] = r.n;

  return {
    total,
    byStatus,
    covered: coveredBy.size,
    coverageMix: mix,
    byDepartment: [...depts.values()].sort((a, b) => b.total - a.total),
    breakdownsByMonth: months.map((m) => ({ ...m, n: perMonth.get(m.key) ?? 0 })),
    topModels: [...models.values()].sort((a, b) => b.n - a.n).slice(0, 5),
    avgRepairMs,
    repairsCounted: repairs.length,
    pms90: { done: pms.done, skipped: pms.skipped, overdue: pmsOverdue },
    pmsDue30,
  };
}
