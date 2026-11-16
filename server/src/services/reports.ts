// Reports: what happened in the Biomedical Department between two dates, for management reports and
// monthly, quarterly or annual meetings. Everything is computed here from the records; the web draws it
// and exports it (PDF through the browser, PowerPoint in the browser).
import { and, eq, gte, inArray, isNull, lte, or } from "drizzle-orm";
import { addDays, daysBetween, monthOf, todayNepal } from "@bmserv/shared/dates";
import type { CoverageType } from "@bmserv/shared/enums";
import { breakdownNumber } from "@bmserv/shared/keys";
import { coverageLastDay } from "@bmserv/shared/pms";
import { getDb } from "../db/client";
import { breakdowns, coverage, departments, emailLog, moves, pmsVisits, serviceProviders, user } from "../db/schema";
import { badRequest } from "../lib/errors";
import { equipmentRows, withAway } from "./equipmentRows";
import { getSettings } from "./settings";

const DAY = 86_400_000;
/** Longest range one report covers. */
const MAX_DAYS = 3 * 366;

/** Start of a Nepal date (00:00 Asia/Kathmandu) in UTC ms. */
const startMs = (ad: string) => Date.parse(`${ad}T00:00:00+05:45`);

const round1 = (n: number) => Math.round(n * 10) / 10;
const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 1000) / 10 : null);
const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};
const countBy = <T>(xs: T[], key: (x: T) => string) => {
  const m = new Map<string, number>();
  for (const x of xs) m.set(key(x), (m.get(key(x)) ?? 0) + 1);
  return [...m].map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
};

export async function buildReport(from: string, to: string, now = Date.now()) {
  if (to < from) throw badRequest("The end date is before the start date.", { to: "The end date is before the start date." });
  const days = daysBetween(from, to) + 1;
  if (days > MAX_DAYS) throw badRequest("Choose at most 3 years.", { to: "Choose at most 3 years." });

  const db = getDb();
  const s = await getSettings();
  const today = todayNepal(now);
  const fromMs = startMs(from);
  const toMs = startMs(addDays(to, 1)) - 1;
  const clipEnd = Math.min(toMs, now);
  /** The day "now" stands for in this report: the end of the range, or today if the range is still running. */
  const asOf = to < today ? to : today;

  // ---- Months in the range (Nepali or English months, as in Settings) ----
  const months: { key: string; label: string }[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const m = monthOf(d, s.dateDisplay);
    if (months[months.length - 1]?.key !== m.key) months.push(m);
  }
  const years = new Set(months.map((m) => m.key.slice(0, 4)));
  for (const m of months) if (years.size > 1) m.label = `${m.label} ${m.key.slice(0, 4)}`;
  const monthKey = (ad: string) => monthOf(ad, s.dateDisplay).key;
  const nepalDate = (ms: number) => new Date(ms + (5 * 60 + 45) * 60_000).toISOString().slice(0, 10);

  // ---- Equipment ----
  const allEquipment = withAway(await equipmentRows(db));
  const inRegister = allEquipment.filter((e) => e.installedOn <= to);
  const added = allEquipment.filter((e) => e.installedOn >= from && e.installedOn <= to);
  const byId = new Map(allEquipment.map((e) => [e.id, e]));
  const label = (id: string) => {
    const e = byId.get(id);
    return e ? `${e.typeName}, ${e.manufacturer} ${e.model}` : "";
  };

  // ---- Breakdowns touching the range ----
  const bdRows = await db
    .select({
      id: breakdowns.id,
      number: breakdowns.number,
      equipmentId: breakdowns.equipmentId,
      reportedAt: breakdowns.reportedAt,
      closedAt: breakdowns.closedAt,
      status: breakdowns.status,
      fixedBy: breakdowns.fixedBy,
      providerId: breakdowns.providerId,
      departmentName: departments.name,
      recordedByRole: user.role,
    })
    .from(breakdowns)
    .innerJoin(departments, eq(departments.id, breakdowns.departmentId))
    .innerJoin(user, eq(user.id, breakdowns.recordedBy))
    .where(and(lte(breakdowns.reportedAt, toMs), or(isNull(breakdowns.closedAt), gte(breakdowns.closedAt, fromMs))));
  const reported = bdRows.filter((b) => b.reportedAt >= fromMs);
  const closed = bdRows.filter((b) => b.closedAt !== null && b.closedAt >= fromMs && b.closedAt <= toMs);
  const fixed = closed.filter((b) => b.status === "fixed");
  const openAtEnd = bdRows.filter((b) => b.closedAt === null || b.closedAt > clipEnd);
  const fixHours = fixed.map((b) => ((b.closedAt as number) - b.reportedAt) / 3_600_000);

  // Uptime: equipment time lost to breakdowns inside the range, against all equipment time in the range.
  let downMs = 0;
  for (const b of bdRows) {
    const a = Math.max(b.reportedAt, fromMs);
    const z = Math.min(b.closedAt ?? clipEnd, clipEnd);
    if (z > a) downMs += z - a;
  }
  let totalMs = 0;
  for (const e of inRegister) {
    const a = Math.max(startMs(e.installedOn), fromMs);
    if (clipEnd > a) totalMs += clipEnd - a;
  }

  const providerNames = new Map(
    (await db.select({ id: serviceProviders.id, name: serviceProviders.name }).from(serviceProviders)).map((p) => [p.id, p.name]),
  );
  const providerOf = (b: (typeof bdRows)[number]) =>
    providerNames.get(b.providerId ?? byId.get(b.equipmentId)?.providerId ?? "") ?? "";
  const byProvider = [...new Set(reported.map(providerOf).concat(closed.map(providerOf)))]
    .filter(Boolean)
    .map((name) => {
      const mine = fixed.filter((b) => providerOf(b) === name);
      const hours = mine.map((b) => ((b.closedAt as number) - b.reportedAt) / 3_600_000);
      return {
        name,
        reported: reported.filter((b) => providerOf(b) === name).length,
        fixed: mine.length,
        medianFixHours: hours.length ? round1(median(hours) as number) : null,
      };
    })
    .sort((a, b) => b.reported - a.reported || a.name.localeCompare(b.name));

  const repeat = countBy(reported, (b) => b.equipmentId)
    .filter((r) => r.n >= 2)
    .slice(0, 10)
    .map((r) => {
      const e = byId.get(r.name);
      return { label: label(r.name), serialNumber: e?.serialNumber ?? "", department: e?.currentDepartmentName ?? "", n: r.n };
    });

  const longestOpen = openAtEnd
    .map((b) => ({
      numberText: breakdownNumber(b.number),
      label: label(b.equipmentId),
      serialNumber: byId.get(b.equipmentId)?.serialNumber ?? "",
      department: b.departmentName,
      days: Math.floor((clipEnd - b.reportedAt) / DAY),
    }))
    .sort((a, b) => b.days - a.days)
    .slice(0, 8);

  // ---- PMS ----
  const visits = await db
    .select({ id: pmsVisits.id, equipmentId: pmsVisits.equipmentId, dueOn: pmsVisits.dueOn, doneOn: pmsVisits.doneOn, status: pmsVisits.status, number: pmsVisits.number })
    .from(pmsVisits)
    .where(or(and(gte(pmsVisits.dueOn, from), lte(pmsVisits.dueOn, to)), and(gte(pmsVisits.doneOn, from), lte(pmsVisits.doneOn, to))));
  const scheduledVisits = visits.filter((v) => v.number !== null && v.dueOn !== null && v.dueOn >= from && v.dueOn <= to);
  const dueSoFar = scheduledVisits.filter((v) => (v.dueOn as string) <= asOf);
  const doneOfDue = dueSoFar.filter((v) => v.status === "done");
  const onTime = doneOfDue.filter((v) => v.doneOn && v.doneOn <= (v.dueOn as string));
  const missed = dueSoFar.filter((v) => v.status === "skipped" || (v.status === "scheduled" && (v.dueOn as string) < today));
  const doneInRange = visits.filter((v) => v.status === "done" && v.doneOn && v.doneOn >= from && v.doneOn <= to);
  const pmsByProvider = [...new Set(dueSoFar.map((v) => byId.get(v.equipmentId)?.providerName ?? ""))]
    .filter(Boolean)
    .map((name) => {
      const mine = dueSoFar.filter((v) => byId.get(v.equipmentId)?.providerName === name);
      const done = mine.filter((v) => v.status === "done").length;
      return { name, due: mine.length, done, compliance: pct(done, mine.length) };
    })
    .sort((a, b) => b.due - a.due);

  // ---- Coverage on the report's day ----
  const covers = await db.select().from(coverage);
  const coverOn = (equipmentId: string, day: string): CoverageType | null => {
    const c = covers
      .filter((x) => x.equipmentId === equipmentId && x.startsOn <= day && day <= coverageLastDay(x.endsOn, x.endedEarlyOn))
      .sort((a, b) => (a.startsOn < b.startsOn ? 1 : -1))[0];
    return c?.type ?? null;
  };
  const mix = { warranty: 0, amc: 0, cmc: 0, none: 0 };
  for (const e of inRegister) mix[coverOn(e.id, asOf) ?? "none"]++;
  const covered = inRegister.length - mix.none;
  const endedInRange = covers.filter((c) => {
    const last = coverageLastDay(c.endsOn, c.endedEarlyOn);
    return last >= from && last <= to && byId.has(c.equipmentId);
  });
  const startedInRange = covers.filter((c) => c.startsOn >= from && c.startsOn <= to && byId.has(c.equipmentId));
  const horizon = addDays(asOf, 90);
  const endingNext = covers
    .map((c) => ({ ...c, last: coverageLastDay(c.endsOn, c.endedEarlyOn) }))
    .filter((c) => c.startsOn <= asOf && c.last >= asOf && c.last <= horizon && byId.has(c.equipmentId))
    .sort((a, b) => (a.last < b.last ? -1 : 1))
    .slice(0, 15)
    .map((c) => {
      const e = byId.get(c.equipmentId)!;
      return { type: c.type, lastDay: c.last, label: label(c.equipmentId), serialNumber: e.serialNumber, department: e.currentDepartmentName, provider: e.providerName };
    });

  // ---- Moves and emails ----
  const moveRows = await db.select({ type: moves.type }).from(moves).where(and(gte(moves.movedAt, fromMs), lte(moves.movedAt, toMs)));
  const emails = await db
    .select({ kind: emailLog.kind, status: emailLog.status })
    .from(emailLog)
    .where(and(gte(emailLog.createdAt, fromMs), lte(emailLog.createdAt, toMs), inArray(emailLog.kind, ["breakdown_request", "breakdown_daily", "breakdown_closed", "pms_reminder"])));

  // ---- Per month ----
  const perMonth = months.map((m) => ({
    key: m.key,
    label: m.label,
    reported: reported.filter((b) => monthKey(nepalDate(b.reportedAt)) === m.key).length,
    fixed: fixed.filter((b) => monthKey(nepalDate(b.closedAt as number)) === m.key).length,
    pmsDue: dueSoFar.filter((v) => monthKey(v.dueOn as string) === m.key).length,
    pmsDone: doneOfDue.filter((v) => monthKey(v.dueOn as string) === m.key).length,
  }));

  const statusNow = { working: 0, breakdown: 0, out_of_service: 0 };
  for (const e of inRegister) statusNow[e.status]++;

  return {
    period: { from, to, days, asOf, months: months.length, running: to >= today },
    generatedAt: now,
    hospital: { name: s.hospitalName, departmentName: s.departmentName, logoFileId: s.logoFileId, dateDisplay: s.dateDisplay },
    equipment: {
      total: inRegister.length,
      added: added.length,
      addedList: added
        .sort((a, b) => (a.installedOn < b.installedOn ? -1 : 1))
        .slice(0, 15)
        .map((e) => ({ label: `${e.typeName}, ${e.manufacturer} ${e.model}`, serialNumber: e.serialNumber, department: e.homeDepartmentName, installedOn: e.installedOn })),
      statusNow,
      byDepartment: countBy(inRegister, (e) => e.homeDepartmentName).slice(0, 12),
      byType: countBy(inRegister, (e) => e.typeName).slice(0, 10),
    },
    breakdowns: {
      reported: reported.length,
      fromStaff: reported.filter((b) => b.recordedByRole === "staff").length,
      closed: closed.length,
      fixed: fixed.length,
      notRepairable: closed.filter((b) => b.status === "not_repairable").length,
      fixedInHouse: fixed.filter((b) => b.fixedBy === "in_house").length,
      fixedByProvider: fixed.filter((b) => b.fixedBy === "service_provider").length,
      openAtEnd: openAtEnd.length,
      medianFixHours: fixHours.length ? round1(median(fixHours) as number) : null,
      averageFixHours: fixHours.length ? round1(fixHours.reduce((a, b) => a + b, 0) / fixHours.length) : null,
      uptimePct: totalMs ? Math.round((1 - downMs / totalMs) * 1000) / 10 : null,
      downtimeDays: round1(downMs / DAY),
      byDepartment: countBy(reported, (b) => b.departmentName).slice(0, 10),
      byType: countBy(reported, (b) => byId.get(b.equipmentId)?.typeName ?? "").filter((r) => r.name).slice(0, 10),
      byProvider,
      repeat,
      longestOpen,
    },
    pms: {
      due: dueSoFar.length,
      dueLater: scheduledVisits.length - dueSoFar.length,
      done: doneOfDue.length,
      onTime: onTime.length,
      late: doneOfDue.length - onTime.length,
      missed: missed.length,
      compliancePct: pct(doneOfDue.length, dueSoFar.length),
      doneInRange: doneInRange.length,
      byProvider: pmsByProvider,
    },
    coverage: {
      mix,
      covered,
      coveredPct: pct(covered, inRegister.length),
      started: startedInRange.length,
      ended: endedInRange.length,
      endingNext,
    },
    activity: {
      moves: moveRows.length,
      temporaryMoves: moveRows.filter((m) => m.type === "temporary").length,
      permanentMoves: moveRows.filter((m) => m.type === "permanent").length,
      emailsSent: emails.filter((e) => e.status === "sent").length,
      emailsFailed: emails.filter((e) => e.status === "failed").length,
      pmsReminders: emails.filter((e) => e.kind === "pms_reminder" && e.status === "sent").length,
    },
    perMonth,
  };
}

export type Report = Awaited<ReturnType<typeof buildReport>>;
