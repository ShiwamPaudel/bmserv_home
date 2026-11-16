// Service history: assembled on request, newest first. No history table (ARCHITECTURE.md section 4).
import { and, asc, eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { durationParts } from "@bmserv/shared/dates";
import { breakdownNumber } from "@bmserv/shared/keys";
import { coverageLastDay } from "@bmserv/shared/pms";
import { t } from "@bmserv/shared/terms";
import { getDb } from "../db/client";
import {
  activityLog,
  breakdownNotes,
  breakdownPauses,
  breakdowns,
  coverage,
  departments,
  emailLog,
  equipment,
  files,
  moves,
  pmsVisits,
  user,
} from "../db/schema";
import { notFound } from "../lib/errors";

export type HistoryEntry = {
  /** Sort key: UTC ms, or Nepal midnight for date-only events. */
  at: number;
  /** Either a date (YYYY-MM-DD) or a moment (ms) to display. */
  date: string | null;
  moment: number | null;
  title: string;
  by: string | null;
  details: string[];
  link: string | null;
};

const NEPAL_OFFSET_MS = (5 * 60 + 45) * 60_000;
const dateAt = (d: string) => Date.parse(`${d}T00:00:00Z`) - NEPAL_OFFSET_MS;

export async function equipmentHistory(equipmentId: string, today: string): Promise<HistoryEntry[]> {
  const db = getDb();
  const eqRow = (await db.select().from(equipment).where(eq(equipment.id, equipmentId)))[0];
  if (!eqRow) throw notFound();
  const fromDept = alias(departments, "from_dept");
  const toDept = alias(departments, "to_dept");
  const returner = alias(user, "returner");

  const [bds, visits, mv, covers, acts, docs, creator] = await Promise.all([
    db.select().from(breakdowns).where(eq(breakdowns.equipmentId, equipmentId)),
    db
      .select({
        id: pmsVisits.id,
        number: pmsVisits.number,
        status: pmsVisits.status,
        dueOn: pmsVisits.dueOn,
        doneOn: pmsVisits.doneOn,
        serviceEngineerName: pmsVisits.serviceEngineerName,
        remarks: pmsVisits.remarks,
        fromEarlierRecords: pmsVisits.fromEarlierRecords,
        coverageId: pmsVisits.coverageId,
        markedByName: user.name,
      })
      .from(pmsVisits)
      .leftJoin(user, eq(user.id, pmsVisits.markedBy))
      .where(and(eq(pmsVisits.equipmentId, equipmentId), inArray(pmsVisits.status, ["done", "skipped"]))),
    db
      .select({
        id: moves.id,
        type: moves.type,
        reason: moves.reason,
        movedAt: moves.movedAt,
        returnedAt: moves.returnedAt,
        fromName: fromDept.name,
        toName: toDept.name,
        byName: user.name,
        returnedByName: returner.name,
      })
      .from(moves)
      .innerJoin(fromDept, eq(fromDept.id, moves.fromDepartmentId))
      .innerJoin(toDept, eq(toDept.id, moves.toDepartmentId))
      .innerJoin(user, eq(user.id, moves.movedBy))
      .leftJoin(returner, eq(returner.id, moves.returnedBy))
      .where(eq(moves.equipmentId, equipmentId))
      .orderBy(asc(moves.movedAt)),
    db.select({ c: coverage, byName: user.name }).from(coverage).leftJoin(user, eq(user.id, coverage.createdBy)).where(eq(coverage.equipmentId, equipmentId)),
    db
      .select({ action: activityLog.action, createdAt: activityLog.createdAt, byName: user.name })
      .from(activityLog)
      .leftJoin(user, eq(user.id, activityLog.userId))
      .where(
        and(
          eq(activityLog.subjectType, "equipment"),
          eq(activityLog.subjectId, equipmentId),
          inArray(activityLog.action, ["label.printed", "equipment.outOfService", "equipment.backInService"]),
        ),
      ),
    db
      .select({ kind: files.kind, title: files.title, createdAt: files.createdAt, byName: user.name })
      .from(files)
      .innerJoin(user, eq(user.id, files.uploadedBy))
      .where(and(eq(files.ownerType, "equipment"), eq(files.ownerId, equipmentId), eq(files.status, "ready"))),
    eqRow.createdBy ? db.select({ name: user.name }).from(user).where(eq(user.id, eqRow.createdBy)) : Promise.resolve([]),
  ]);

  const out: HistoryEntry[] = [];
  out.push({ at: dateAt(eqRow.installedOn), date: eqRow.installedOn, moment: null, title: t.history.installed, by: null, details: [], link: null });
  out.push({ at: eqRow.createdAt, date: null, moment: eqRow.createdAt, title: t.history.added, by: creator[0]?.name ?? null, details: [], link: null });

  // Breakdowns, with notes, pauses, emails and outcome as details.
  const bdIds = bds.map((b) => b.id);
  const [notes, pauses, emails, people] = bdIds.length
    ? await Promise.all([
        db
          .select({ breakdownId: breakdownNotes.breakdownId, note: breakdownNotes.note, createdAt: breakdownNotes.createdAt, byName: user.name })
          .from(breakdownNotes)
          .innerJoin(user, eq(user.id, breakdownNotes.createdBy))
          .where(inArray(breakdownNotes.breakdownId, bdIds))
          .orderBy(asc(breakdownNotes.createdAt)),
        db.select().from(breakdownPauses).where(inArray(breakdownPauses.breakdownId, bdIds)).orderBy(asc(breakdownPauses.pausedAt)),
        db
          .select({ relatedId: emailLog.relatedId, subject: emailLog.subject, status: emailLog.status, createdAt: emailLog.createdAt })
          .from(emailLog)
          .where(and(eq(emailLog.relatedType, "breakdown"), inArray(emailLog.relatedId, bdIds)))
          .orderBy(asc(emailLog.createdAt)),
        db.select({ id: user.id, name: user.name }).from(user),
      ])
    : [[], [], [], []];
  const nameOf = (id: string | null) => (id ? (people.find((p) => p.id === id)?.name ?? null) : null);
  for (const b of bds) {
    const details: string[] = [`${t.breakdowns.problem}: ${b.problem}`, `${t.breakdowns.reportedBy}: ${b.reportedByName}`];
    for (const n of notes.filter((x) => x.breakdownId === b.id)) details.push(`${t.breakdowns.event.note} (${n.byName}): ${n.note}`);
    for (const p of pauses.filter((x) => x.breakdownId === b.id)) {
      details.push(`${t.breakdowns.event.paused} (${nameOf(p.pausedBy)}): ${t.pauseReason[p.reason]}${p.note ? `, ${p.note}` : ""}`);
      if (p.resumedAt) details.push(p.resumedBy ? `${t.breakdowns.event.resumed} (${nameOf(p.resumedBy)})` : t.breakdowns.event.autoResumed);
    }
    const sentCount = emails.filter((e) => e.relatedId === b.id && e.status === "sent").length;
    if (sentCount) details.push(`${t.breakdowns.emailsSent}: ${sentCount}`);
    if (b.closedAt) {
      const d = durationParts(b.reportedAt, b.closedAt);
      details.push(
        b.status === "fixed"
          ? `${t.fixedBy[b.fixedBy ?? "in_house"]}${b.serviceEngineerName ? ` (${b.serviceEngineerName})` : ""}: ${b.workDone ?? ""}`
          : `${t.status.breakdown.not_repairable}: ${b.workDone ?? ""}`,
      );
      if (b.partsReplaced) details.push(`${t.breakdowns.partsReplaced}: ${b.partsReplaced}`);
      details.push(t.dates.wasDownFor(d.days, d.hours));
    }
    out.push({
      at: b.reportedAt,
      date: null,
      moment: b.reportedAt,
      title: `${t.history.breakdown(breakdownNumber(b.number))}: ${t.status.breakdown[b.status]}`,
      by: nameOf(b.recordedBy),
      details,
      link: `/breakdowns/${b.id}`,
    });
  }

  // PMS
  const totals = new Map<string, number>();
  const allVisits = await db.select({ coverageId: pmsVisits.coverageId }).from(pmsVisits).where(eq(pmsVisits.equipmentId, equipmentId));
  for (const v of allVisits) if (v.coverageId) totals.set(v.coverageId, (totals.get(v.coverageId) ?? 0) + 1);
  for (const v of visits) {
    const label = v.number && v.coverageId ? t.pms.numberOf(v.number, totals.get(v.coverageId) ?? 0) : "PMS";
    if (v.status === "done" && v.doneOn) {
      const details = [v.serviceEngineerName ? `${t.pms.serviceEngineer}: ${v.serviceEngineerName}` : "", v.remarks ? `${t.pms.remarks}: ${v.remarks}` : ""].filter(Boolean);
      out.push({
        at: dateAt(v.doneOn),
        date: v.doneOn,
        moment: null,
        title: v.fromEarlierRecords ? t.history.pmsEarlier : t.history.pmsDone(label),
        by: v.markedByName,
        details,
        link: null,
      });
    } else if (v.status === "skipped") {
      out.push({ at: dateAt(v.dueOn), date: v.dueOn, moment: null, title: t.history.pmsSkipped(label), by: null, details: [], link: null });
    }
  }

  // Moves
  for (const m of mv) {
    out.push({
      at: m.movedAt,
      date: null,
      moment: m.movedAt,
      title: m.type === "temporary" ? t.history.movedTemporary(m.fromName, m.toName) : t.history.movedPermanent(m.fromName, m.toName),
      by: m.byName,
      details: [`${t.moves.reason}: ${m.reason}`],
      link: null,
    });
    if (m.returnedAt) {
      out.push({ at: m.returnedAt, date: null, moment: m.returnedAt, title: t.history.returned(m.fromName), by: m.returnedByName, details: [], link: null });
    }
  }

  // Coverage start and end
  for (const { c, byName } of covers) {
    const type = t.coverageType[c.type];
    out.push({ at: dateAt(c.startsOn), date: c.startsOn, moment: null, title: t.history.coverageStart(type), by: byName, details: c.contractNo ? [`${t.coverage.contractNo}: ${c.contractNo}`] : [], link: null });
    const last = coverageLastDay(c.endsOn, c.endedEarlyOn);
    if (last < today) out.push({ at: dateAt(last) + 1, date: last, moment: null, title: t.history.coverageEnd(type), by: null, details: [], link: null });
  }

  for (const a of acts) {
    const title = a.action === "label.printed" ? t.history.labelPrinted : a.action === "equipment.outOfService" ? t.history.outOfService : t.history.backInService;
    out.push({ at: a.createdAt, date: null, moment: a.createdAt, title, by: a.byName, details: [], link: null });
  }
  for (const d of docs) {
    out.push({ at: d.createdAt, date: null, moment: d.createdAt, title: t.history.documentAdded(t.fileKind[d.kind], d.title), by: d.byName, details: [], link: null });
  }

  return out.sort((a, b) => b.at - a.at);
}
