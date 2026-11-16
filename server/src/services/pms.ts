import { createHash } from "node:crypto";
import { and, asc, desc, eq, gt, gte, inArray, isNull, lt, lte, ne, sql } from "drizzle-orm";
import { addDays, formatDate, nepalTime, todayNepal } from "@bmserv/shared/dates";
import { coverageLastDay } from "@bmserv/shared/pms";
import { t } from "@bmserv/shared/terms";
import { getDb, type Conn } from "../db/client";
import { coverage, equipment, pmsVisits, serviceProviders, user } from "../db/schema";
import { dedupe, departmentEmails, designatedEmails } from "../emails/recipients";
import { sendEmail, type SendOutcome } from "../emails/send";
import { pmsDue, type PmsEmailItem } from "../emails/templates";
import { badRequest, notFound } from "../lib/errors";
import type { Actor } from "../lib/http";
import { equipmentRows, withAway, type EquipmentRow } from "./equipmentRows";
import { getSettings } from "./settings";
import { ref } from "../lib/sqlRef";

const total = sql<number>`(select count(*) from pms_visits x where x.coverage_id = ${ref(pmsVisits.coverageId)})`;
const coverageCurrentOn = (day: string) =>
  sql`(${coverage.startsOn} <= ${day} and ${day} <= min(${coverage.endsOn}, coalesce(${coverage.endedEarlyOn}, ${coverage.endsOn})))`;

const visitColumns = {
  id: pmsVisits.id,
  equipmentId: pmsVisits.equipmentId,
  coverageId: pmsVisits.coverageId,
  number: pmsVisits.number,
  total,
  dueOn: pmsVisits.dueOn,
  status: pmsVisits.status,
  reminderSentAt: pmsVisits.reminderSentAt,
  doneOn: pmsVisits.doneOn,
  serviceEngineerName: pmsVisits.serviceEngineerName,
  remarks: pmsVisits.remarks,
  fromEarlierRecords: pmsVisits.fromEarlierRecords,
  coverageType: coverage.type,
  coverageEndsOn: coverage.endsOn,
  coverageEndedEarlyOn: coverage.endedEarlyOn,
  coverageProviderId: coverage.serviceProviderId,
  markedByName: user.name,
};

async function attachEquipment<T extends { equipmentId: string }>(conn: Conn, visits: T[]) {
  const ids = [...new Set(visits.map((v) => v.equipmentId))];
  const rows = ids.length ? withAway(await equipmentRows(conn).where(inArray(equipment.id, ids))) : [];
  const byId = new Map(rows.map((r) => [r.id, r]));
  return visits
    .filter((v) => byId.has(v.equipmentId))
    .map((v) => ({ ...v, equipment: byId.get(v.equipmentId) as EquipmentRow }));
}

export type PmsFilter = "due" | "soon" | "upcoming" | "overdue" | "done";
/** How far ahead "Upcoming" looks. */
const UPCOMING_DAYS = 365;

/**
 * PMS list. due: every scheduled visit from today; soon: within the "PMS due soon" window (Settings);
 * upcoming: after that window, up to a year ahead; overdue; done. Only under current coverage, not out of service.
 */
export async function listPms(filter: PmsFilter, opts: { providerId?: string | undefined; equipmentId?: string | undefined } = {}) {
  const db = getDb();
  const today = todayNepal();
  const base = db
    .select(visitColumns)
    .from(pmsVisits)
    .leftJoin(coverage, eq(coverage.id, pmsVisits.coverageId))
    .leftJoin(user, eq(user.id, pmsVisits.markedBy))
    .innerJoin(equipment, eq(equipment.id, pmsVisits.equipmentId));
  const scoped = and(
    opts.providerId ? eq(equipment.serviceProviderId, opts.providerId) : undefined,
    opts.equipmentId ? eq(pmsVisits.equipmentId, opts.equipmentId) : undefined,
  );
  const soonEnd = addDays(today, (await getSettings()).pmsSoonDays);
  const window =
    filter === "due"
      ? gte(pmsVisits.dueOn, today)
      : filter === "soon"
        ? and(gte(pmsVisits.dueOn, today), lte(pmsVisits.dueOn, soonEnd))
        : filter === "upcoming"
          ? and(gt(pmsVisits.dueOn, soonEnd), lte(pmsVisits.dueOn, addDays(today, UPCOMING_DAYS)))
          : lt(pmsVisits.dueOn, today);
  let rows;
  if (filter === "done") {
    rows = await base.where(and(eq(pmsVisits.status, "done"), scoped)).orderBy(desc(pmsVisits.doneOn)).limit(200);
  } else {
    rows = await base
      .where(
        and(
          eq(pmsVisits.status, "scheduled"),
          ne(equipment.status, "out_of_service"),
          coverageCurrentOn(today),
          window,
          scoped,
        ),
      )
      .orderBy(asc(pmsVisits.dueOn))
      .limit(filter === "upcoming" ? 600 : 300);
  }
  return attachEquipment(db, rows);
}

async function findVisit(id: string) {
  const r = await getDb()
    .select(visitColumns)
    .from(pmsVisits)
    .leftJoin(coverage, eq(coverage.id, pmsVisits.coverageId))
    .leftJoin(user, eq(user.id, pmsVisits.markedBy))
    .where(eq(pmsVisits.id, id));
  if (!r[0]) throw notFound();
  return r[0];
}

/** Lead/Admin can change one PMS date, within the coverage. */
export async function changePmsDate(actor: Actor, id: string, dueOn: string) {
  const v = await findVisit(id);
  if (v.status !== "scheduled" || !v.coverageId) throw badRequest("Only a PMS that is not done yet can be moved.");
  const c = (await getDb().select().from(coverage).where(eq(coverage.id, v.coverageId)))[0];
  if (!c || dueOn < c.startsOn || dueOn > coverageLastDay(c.endsOn, c.endedEarlyOn)) {
    throw badRequest("Choose a date within the coverage.", { dueOn: "Choose a date within the coverage." });
  }
  // A new date gets its own reminder.
  await getDb().update(pmsVisits).set({ dueOn, reminderSentAt: null, markedBy: actor.id }).where(eq(pmsVisits.id, id));
  return { id };
}

export async function markPmsDone(
  actor: Actor,
  id: string,
  input: { doneOn: string; serviceEngineerName: string | null; remarks: string | null },
) {
  const v = await findVisit(id);
  if (v.status === "done") throw badRequest("This PMS is already marked as done.");
  if (input.doneOn > todayNepal()) throw badRequest("The date done cannot be in the future.", { doneOn: t.fields.date });
  await getDb()
    .update(pmsVisits)
    .set({ status: "done", doneOn: input.doneOn, serviceEngineerName: input.serviceEngineerName, remarks: input.remarks, markedBy: actor.id })
    .where(eq(pmsVisits.id, id));
  return { id };
}

type ReminderVisit = {
  id: string;
  equipmentId: string;
  number: number | null;
  total: number;
  dueOn: string;
  coverageType: "warranty" | "amc" | "cmc";
  lastDay: string;
  providerId: string;
};

async function sendPmsGroup(
  visits: ReminderVisit[],
  opts: { dedupeKey: string; createdBy: string | null },
): Promise<SendOutcome & { recipients: number }> {
  const db = getDb();
  const first = visits[0];
  if (!first) return { status: "failed", logId: null, recipients: 0 };
  const s = await getSettings();
  const provider = (await db.select().from(serviceProviders).where(eq(serviceProviders.id, first.providerId)))[0];
  if (!provider) throw notFound();
  const rows = await attachEquipment(db, visits);
  const recipients = dedupe([
    ...(await departmentEmails(db, first.providerId)),
    ...(await designatedEmails(db, visits.map((v) => v.equipmentId))),
  ]);
  if (!recipients.length) {
    return { status: "failed", logId: null, recipients: 0, error: t.pms.noRecipients(provider.name) };
  }
  const items: PmsEmailItem[] = rows.map((v) => ({
    typeName: v.equipment.typeName,
    manufacturer: v.equipment.manufacturer,
    model: v.equipment.model,
    serial: v.equipment.serialNumber,
    currentDepartment: v.equipment.currentDepartmentName,
    number: v.number,
    total: v.total,
    coverageText: `${t.coverageType[v.coverageType]} until ${formatDate(v.lastDay, s.dateDisplay)}`,
    dueOn: v.dueOn,
  }));
  const email = pmsDue({
    dateMode: s.dateDisplay,
    hospital: s.hospitalName,
    providerName: provider.name,
    dueOn: first.dueOn,
    items,
    departmentName: s.departmentName,
    departmentPhone: s.departmentPhone,
  });
  const out = await sendEmail({
    kind: "pms_reminder",
    dedupeKey: opts.dedupeKey,
    to: recipients.map((r) => r.email),
    ...email,
    relatedType: "pms_visit",
    relatedId: visits.length === 1 ? first.id : visits.map((v) => v.id).join(","),
    providerId: first.providerId,
    createdBy: opts.createdBy,
  });
  if (out.status === "sent") {
    await db.update(pmsVisits).set({ reminderSentAt: Date.now() }).where(inArray(pmsVisits.id, visits.map((v) => v.id)));
  }
  return { ...out, recipients: recipients.length };
}

const reminderColumns = {
  id: pmsVisits.id,
  equipmentId: pmsVisits.equipmentId,
  number: pmsVisits.number,
  total,
  dueOn: pmsVisits.dueOn,
  coverageType: coverage.type,
  endsOn: coverage.endsOn,
  endedEarlyOn: coverage.endedEarlyOn,
  providerId: coverage.serviceProviderId,
};

/** "Send reminder again": any team member, at most once an hour per PMS. */
export async function remindPms(actor: Actor, id: string) {
  const db = getDb();
  const r = await db
    .select(reminderColumns)
    .from(pmsVisits)
    .innerJoin(coverage, eq(coverage.id, pmsVisits.coverageId))
    .where(and(eq(pmsVisits.id, id), eq(pmsVisits.status, "scheduled")));
  const v = r[0];
  if (!v) throw badRequest("Reminders can only be sent for a PMS that is not done yet.");
  const hour = Math.floor(Date.now() / 3_600_000);
  const out = await sendPmsGroup([{ ...v, lastDay: coverageLastDay(v.endsOn, v.endedEarlyOn) }], {
    dedupeKey: `pms:${id}:manual:${hour}`,
    createdBy: actor.id,
  });
  if (out.status === "duplicate") throw badRequest("A reminder was sent less than an hour ago. Try again later.");
  if (out.status === "failed" && out.recipients === 0) throw badRequest(out.error ?? t.app.somethingWrong);
  return out;
}

/** Tick: reminders N days ahead, grouped per provider and due date, once each. */
export async function sendDuePmsReminders(now = Date.now()) {
  const db = getDb();
  const s = await getSettings();
  const today = todayNepal(now);
  if (nepalTime(now) < s.dailyEmailTime) return { groups: 0, sent: 0 };
  const until = addDays(today, s.pmsReminderDays);
  const rows = await db
    .select(reminderColumns)
    .from(pmsVisits)
    .innerJoin(coverage, eq(coverage.id, pmsVisits.coverageId))
    .innerJoin(equipment, eq(equipment.id, pmsVisits.equipmentId))
    .where(
      and(
        eq(pmsVisits.status, "scheduled"),
        isNull(pmsVisits.reminderSentAt),
        gte(pmsVisits.dueOn, today),
        lte(pmsVisits.dueOn, until),
        ne(equipment.status, "out_of_service"),
        coverageCurrentOn(today),
      ),
    );
  const groups = new Map<string, ReminderVisit[]>();
  for (const v of rows) {
    const key = `${v.providerId}|${v.dueOn}`;
    const list = groups.get(key) ?? [];
    list.push({ ...v, lastDay: coverageLastDay(v.endsOn, v.endedEarlyOn) });
    groups.set(key, list);
  }
  let sent = 0;
  for (const [key, visits] of groups) {
    const ids = visits.map((v) => v.id).sort().join(",");
    const hash = createHash("sha1").update(ids).digest("hex").slice(0, 12);
    const [providerId, dueOn] = key.split("|");
    const out = await sendPmsGroup(visits, { dedupeKey: `pms:${dueOn}:${providerId}:${hash}:reminder`, createdBy: null });
    if (out.status === "sent") sent++;
  }
  return { groups: groups.size, sent };
}
