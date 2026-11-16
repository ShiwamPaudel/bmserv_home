import { and, asc, desc, eq, gt, inArray, isNull, lte, max, or, sql } from "drizzle-orm";
import { daysBetween, durationParts, formatDate, nepalDateOf, nepalTime, todayNepal } from "@bmserv/shared/dates";
import { teamRoles, type BreakdownStatus } from "@bmserv/shared/enums";
import { breakdownNumber } from "@bmserv/shared/keys";
import { can } from "@bmserv/shared/permissions";
import type { CloseInput, PauseInput, RecipientInput } from "@bmserv/shared/schemas/breakdowns";
import { t } from "@bmserv/shared/terms";
import { getDb, type Conn } from "../db/client";
import {
  activityLog,
  breakdownNotes,
  breakdownPauses,
  breakdownRecipients,
  breakdowns,
  emailLog,
  equipment,
  equipmentServiceEngineers,
  providerContacts,
  serviceEngineers,
  serviceProviders,
  user,
} from "../db/schema";
import { dedupe, defaultBreakdownRecipients } from "../emails/recipients";
import { sendEmail, type SendOutcome } from "../emails/send";
import {
  breakdownClosed,
  breakdownDaily,
  breakdownRequest,
  type BreakdownEmailData,
  type Rendered,
} from "../emails/templates";
import { badRequest, forbidden, notFound } from "../lib/errors";
import { newId } from "../lib/ids";
import type { Actor } from "../lib/http";
import { logActivity } from "./activity";
import { coverageAndPms, refreshStatus } from "./equipment";
import { equipmentRows, withAway, type EquipmentRow } from "./equipmentRows";
import { getSettings } from "./settings";
import { ref } from "../lib/sqlRef";
import { notifyClosed, notifyNewBreakdown } from "./notify";

const HOUR = 3_600_000;
const unresolved: BreakdownStatus[] = ["open", "with_provider"];

async function findBreakdown(conn: Conn, id: string) {
  const r = await conn.select().from(breakdowns).where(eq(breakdowns.id, id));
  if (!r[0]) throw notFound();
  return r[0];
}

async function currentPause(conn: Conn, breakdownId: string) {
  const r = await conn
    .select()
    .from(breakdownPauses)
    .where(and(eq(breakdownPauses.breakdownId, breakdownId), isNull(breakdownPauses.resumedAt)))
    .orderBy(desc(breakdownPauses.pausedAt))
    .limit(1);
  return r[0] ?? null;
}

// ---------- List ----------

export type BreakdownFilters = {
  status?: string | undefined;
  mine?: boolean | undefined;
  paused?: boolean | undefined;
  equipmentId?: string | undefined;
};

export async function listBreakdowns(actor: Actor, f: BreakdownFilters) {
  const db = getDb();
  const status = f.status === "open" || f.status === "with_provider" ? [f.status] : f.status === "fixed" ? ["fixed", "not_repairable"] : null;
  const pausedSql = sql`exists (select 1 from breakdown_pauses p where p.breakdown_id = ${ref(breakdowns.id)} and p.resumed_at is null)`;
  const rows = await db
    .select({
      id: breakdowns.id,
      number: breakdowns.number,
      status: breakdowns.status,
      problem: breakdowns.problem,
      reportedAt: breakdowns.reportedAt,
      closedAt: breakdowns.closedAt,
      equipmentId: breakdowns.equipmentId,
      assignedTo: breakdowns.assignedTo,
      assignedName: user.name,
      lastEmailAt: breakdowns.lastEmailAt,
      pausedAt: sql<number | null>`(select p.paused_at from breakdown_pauses p where p.breakdown_id = ${ref(breakdowns.id)} and p.resumed_at is null order by p.paused_at desc limit 1)`,
      pauseReason: sql<string | null>`(select p.reason from breakdown_pauses p where p.breakdown_id = ${ref(breakdowns.id)} and p.resumed_at is null order by p.paused_at desc limit 1)`,
    })
    .from(breakdowns)
    .innerJoin(user, eq(user.id, breakdowns.assignedTo))
    .where(
      and(
        status ? inArray(breakdowns.status, status as BreakdownStatus[]) : undefined,
        f.mine ? eq(breakdowns.assignedTo, actor.id) : undefined,
        f.paused ? and(eq(breakdowns.status, "with_provider"), pausedSql) : undefined,
        f.equipmentId ? eq(breakdowns.equipmentId, f.equipmentId) : undefined,
      ),
    )
    .orderBy(status && status.includes("fixed") ? desc(breakdowns.closedAt) : desc(breakdowns.reportedAt))
    .limit(300);
  const ids = [...new Set(rows.map((r) => r.equipmentId))];
  const eqRows = ids.length ? withAway(await equipmentRows(db).where(inArray(equipment.id, ids))) : [];
  const byId = new Map(eqRows.map((r) => [r.id, r]));
  return rows.map((r) => ({ ...r, numberText: breakdownNumber(r.number), equipment: byId.get(r.equipmentId) as EquipmentRow }));
}

// ---------- Record ----------

export async function recordBreakdown(
  actor: Actor,
  input: { equipmentId: string; problem: string; reportedByName: string; reportedAt: number },
  opts: { assignedTo?: string; fromStaff?: boolean } = {},
) {
  const db = getDb();
  const eqRow = (await db.select().from(equipment).where(eq(equipment.id, input.equipmentId)))[0];
  if (!eqRow) throw notFound();
  if (eqRow.status === "out_of_service") throw badRequest(t.breakdowns.outOfServiceNo);
  if (input.reportedAt > Date.now() + 5 * 60_000) throw badRequest(t.fields.date, { reportedAt: t.fields.date });
  const id = newId();
  const number = await db.transaction(async (tx) => {
    const last = await tx.select({ n: max(breakdowns.number) }).from(breakdowns);
    const n = (last[0]?.n ?? 0) + 1;
    await tx.insert(breakdowns).values({
      id,
      number: n,
      equipmentId: eqRow.id,
      departmentId: eqRow.currentDepartmentId,
      reportedAt: input.reportedAt,
      reportedByName: input.reportedByName,
      problem: input.problem,
      status: "open",
      recordedBy: actor.id,
      assignedTo: opts.assignedTo ?? actor.id,
      providerId: eqRow.serviceProviderId,
    });
    await refreshStatus(tx, eqRow.id);
    return n;
  });
  await notifyNewBreakdown(id, actor, { fromStaff: !!opts.fromStaff });
  return { id, number, numberText: breakdownNumber(number) };
}

export async function addNote(actor: Actor, id: string, note: string) {
  const db = getDb();
  await findBreakdown(db, id);
  const noteId = newId();
  await db.insert(breakdownNotes).values({ id: noteId, breakdownId: id, note, createdBy: actor.id, createdAt: Date.now() });
  return { id: noteId };
}

export async function assignBreakdown(actor: Actor, id: string, userId: string) {
  const db = getDb();
  const b = await findBreakdown(db, id);
  if (!unresolved.includes(b.status)) throw badRequest("This breakdown is closed.");
  const u = (await db.select({ name: user.name, banned: user.banned }).from(user).where(eq(user.id, userId)))[0];
  if (!u || u.banned) throw badRequest(t.fields.choose, { userId: t.fields.choose });
  await db.transaction(async (tx) => {
    await tx.update(breakdowns).set({ assignedTo: userId }).where(eq(breakdowns.id, id));
    await logActivity(tx, { userId: actor.id, action: "breakdown.assigned", subjectType: "breakdown", subjectId: id, summary: u.name });
  });
  return { id };
}

// ---------- Email content ----------

async function emailData(conn: Conn, b: typeof breakdowns.$inferSelect): Promise<{ data: BreakdownEmailData; providerId: string }> {
  const s = await getSettings();
  const eqRow = withAway(await equipmentRows(conn).where(eq(equipment.id, b.equipmentId)))[0];
  if (!eqRow) throw notFound();
  const providerId = b.providerId ?? eqRow.providerId;
  const provider = (await conn.select({ name: serviceProviders.name }).from(serviceProviders).where(eq(serviceProviders.id, providerId)))[0];
  const responsible = (await conn.select({ name: user.name, phone: user.phone }).from(user).where(eq(user.id, b.assignedTo)))[0];
  const cov = await coverageAndPms(conn, b.equipmentId);
  const coverageText = cov.current
    ? t.coverage.under(t.coverageType[cov.current.type], formatDate(cov.coverages.find((c) => c.isCurrent)?.lastDay ?? cov.current.endsOn, s.dateDisplay))
    : t.coverage.none;
  const notes = await conn
    .select({ note: breakdownNotes.note, createdAt: breakdownNotes.createdAt, name: user.name })
    .from(breakdownNotes)
    .innerJoin(user, eq(user.id, breakdownNotes.createdBy))
    .where(eq(breakdownNotes.breakdownId, b.id))
    .orderBy(asc(breakdownNotes.createdAt));
  const notesText = notes
    .slice(-5)
    .map((n) => `${formatDate(nepalDateOf(n.createdAt), s.dateDisplay)}, ${n.name}: ${n.note}`)
    .join("\n");
  return {
    providerId,
    data: {
      dateMode: s.dateDisplay,
      hospital: s.hospitalName,
      providerName: provider?.name ?? "",
      typeName: eqRow.typeName,
      manufacturer: eqRow.manufacturer,
      model: eqRow.model,
      serial: eqRow.serialNumber,
      currentDepartment: eqRow.currentDepartmentName,
      installedOn: eqRow.installedOn,
      coverageText,
      bdNumber: breakdownNumber(b.number),
      reportedAt: b.reportedAt,
      problem: b.problem,
      notesText,
      responsibleName: responsible?.name ?? "",
      responsiblePhone: responsible?.phone ?? "",
      departmentName: s.departmentName,
      departmentPhone: s.departmentPhone,
    },
  };
}

async function notesSince(conn: Conn, breakdownId: string, since: number | null): Promise<string> {
  const mode = (await getSettings()).dateDisplay;
  const notes = await conn
    .select({ note: breakdownNotes.note, createdAt: breakdownNotes.createdAt, name: user.name })
    .from(breakdownNotes)
    .innerJoin(user, eq(user.id, breakdownNotes.createdBy))
    .where(and(eq(breakdownNotes.breakdownId, breakdownId), since ? gt(breakdownNotes.createdAt, since) : undefined))
    .orderBy(asc(breakdownNotes.createdAt));
  return notes.map((n) => `${formatDate(nepalDateOf(n.createdAt), mode)}, ${n.name}: ${n.note}`).join("\n");
}

/** Days down, counted in Nepal dates; at least 1. */
export function daysDown(reportedAt: number, today: string): number {
  return Math.max(1, daysBetween(nepalDateOf(reportedAt), today));
}

async function activeRecipients(conn: Conn, breakdownId: string) {
  return conn
    .select()
    .from(breakdownRecipients)
    .where(and(eq(breakdownRecipients.breakdownId, breakdownId), eq(breakdownRecipients.isActive, true)))
    .orderBy(asc(breakdownRecipients.createdAt));
}

async function renderDaily(conn: Conn, b: typeof breakdowns.$inferSelect, today: string) {
  const { data, providerId } = await emailData(conn, b);
  const updateText = await notesSince(conn, b.id, b.lastEmailAt);
  return { email: breakdownDaily({ ...data, days: daysDown(b.reportedAt, today), updateText }), providerId };
}

// ---------- Ask service provider for help ----------

/** Recipients BMServ suggests, other engineers of that provider, and a preview of the first email. */
export async function recipientOptions(id: string) {
  const db = getDb();
  const b = await findBreakdown(db, id);
  const eqRow = (await db.select().from(equipment).where(eq(equipment.id, b.equipmentId)))[0];
  if (!eqRow) throw notFound();
  const providerId = b.providerId ?? eqRow.serviceProviderId;
  const provider = (await db.select().from(serviceProviders).where(eq(serviceProviders.id, providerId)))[0];
  const defaults = await defaultBreakdownRecipients(db, b.equipmentId, providerId);
  const engineers = await db
    .select({ id: serviceEngineers.id, name: serviceEngineers.name, email: serviceEngineers.email, phone: serviceEngineers.phone })
    .from(serviceEngineers)
    .where(and(eq(serviceEngineers.providerId, providerId), eq(serviceEngineers.isActive, true)))
    .orderBy(asc(serviceEngineers.name));
  const saved = await activeRecipients(db, id);
  const { data } = await emailData(db, b);
  return {
    provider: { id: providerId, name: provider?.name ?? "" },
    defaults,
    saved,
    engineers,
    preview: breakdownRequest(data),
  };
}

async function saveRecipients(tx: Conn, actor: Actor, breakdownId: string, list: RecipientInput[]) {
  await tx
    .update(breakdownRecipients)
    .set({ isActive: false })
    .where(and(eq(breakdownRecipients.breakdownId, breakdownId), eq(breakdownRecipients.isActive, true)));
  for (const r of dedupe(list)) {
    await tx.insert(breakdownRecipients).values({
      id: newId(),
      breakdownId,
      source: r.source,
      sourceId: r.sourceId,
      email: r.email,
      name: r.name,
      isActive: true,
      addedBy: actor.id,
    });
  }
}

export async function askProvider(actor: Actor, id: string, recipients: RecipientInput[]) {
  const db = getDb();
  const b = await findBreakdown(db, id);
  if (b.status !== "open") throw badRequest("This breakdown is already with the service provider or closed.");
  if (!dedupe(recipients).length) {
    const eqRow = (await db.select().from(equipment).where(eq(equipment.id, b.equipmentId)))[0];
    const p = (await db.select({ name: serviceProviders.name }).from(serviceProviders).where(eq(serviceProviders.id, eqRow?.serviceProviderId ?? "")))[0];
    throw badRequest(t.breakdowns.noRecipients(p?.name ?? "The service provider"));
  }
  const eqRow = (await db.select().from(equipment).where(eq(equipment.id, b.equipmentId)))[0];
  if (!eqRow) throw notFound();
  const now = Date.now();
  const today = todayNepal(now);
  await db.transaction(async (tx) => {
    await saveRecipients(tx, actor, id, recipients);
    await tx
      .update(breakdowns)
      .set({ status: "with_provider", providerId: eqRow.serviceProviderId, sentToProviderAt: now, lastEmailOn: today, lastEmailAt: now })
      .where(eq(breakdowns.id, id));
    await logActivity(tx, { userId: actor.id, action: "breakdown.asked", subjectType: "breakdown", subjectId: id, summary: t.breakdowns.event.asked });
  });
  const fresh = await findBreakdown(db, id);
  const { data, providerId } = await emailData(db, fresh);
  const email = breakdownRequest(data);
  const to = (await activeRecipients(db, id)).map((r) => r.email);
  return sendEmail({
    kind: "breakdown_request",
    dedupeKey: `breakdown:${id}:request`,
    to,
    ...email,
    relatedType: "breakdown",
    relatedId: id,
    providerId,
    createdBy: actor.id,
  });
}

export async function updateRecipients(actor: Actor, id: string, recipients: RecipientInput[]) {
  const db = getDb();
  const b = await findBreakdown(db, id);
  if (!unresolved.includes(b.status)) throw badRequest("This breakdown is closed.");
  if (b.status === "with_provider" && !dedupe(recipients).length) {
    throw badRequest("Keep at least one recipient while the breakdown is with the service provider.");
  }
  await db.transaction(async (tx) => {
    await saveRecipients(tx, actor, id, recipients);
    await logActivity(tx, { userId: actor.id, action: "breakdown.recipients", subjectType: "breakdown", subjectId: id, summary: t.breakdowns.event.recipients });
  });
  return { id };
}

// ---------- Daily emails ----------

/** "Send now": once an hour at most; counts as that day's daily email. */
export async function sendNow(actor: Actor, id: string, now = Date.now()) {
  const db = getDb();
  const b = await findBreakdown(db, id);
  if (b.status !== "with_provider") throw badRequest("Ask the service provider for help first.");
  if (b.lastEmailAt && now - b.lastEmailAt < HOUR) throw badRequest(t.breakdowns.sendNowTooSoon);
  const today = todayNepal(now);
  const to = (await activeRecipients(db, id)).map((r) => r.email);
  if (!to.length) throw badRequest("Add at least one recipient first.");
  const { email, providerId } = await renderDaily(db, b, today);
  const out = await sendEmail({
    kind: "breakdown_daily",
    dedupeKey: `breakdown:${id}:manual:${Math.floor(now / HOUR)}`,
    to,
    ...email,
    relatedType: "breakdown",
    relatedId: id,
    providerId,
    createdBy: actor.id,
  });
  if (out.status === "duplicate") throw badRequest(t.breakdowns.sendNowTooSoon);
  if (out.status === "sent") await db.update(breakdowns).set({ lastEmailOn: today, lastEmailAt: now }).where(eq(breakdowns.id, id));
  return out;
}

/**
 * Daily emails are due when: with service provider, not paused, not yet emailed today (Nepal),
 * Nepal time is at or after the daily email time, and the first request was more than 12 hours ago.
 */
export function isDailyEmailDue(
  b: { status: BreakdownStatus; lastEmailOn: string | null; sentToProviderAt: number | null },
  ctx: { paused: boolean; now: number; dailyEmailTime: string },
): boolean {
  if (b.status !== "with_provider" || ctx.paused || !b.sentToProviderAt) return false;
  const today = todayNepal(ctx.now);
  if (b.lastEmailOn && b.lastEmailOn >= today) return false;
  if (nepalTime(ctx.now) < ctx.dailyEmailTime) return false;
  return ctx.now - b.sentToProviderAt > 12 * HOUR;
}

export async function sendDueDailyEmails(now = Date.now()) {
  const db = getDb();
  const s = await getSettings();
  const today = todayNepal(now);
  const candidates = await db
    .select()
    .from(breakdowns)
    .where(and(eq(breakdowns.status, "with_provider"), or(isNull(breakdowns.lastEmailOn), sql`${breakdowns.lastEmailOn} < ${today}`)));
  let sent = 0;
  let failed = 0;
  for (const b of candidates) {
    const paused = !!(await currentPause(db, b.id));
    if (!isDailyEmailDue(b, { paused, now, dailyEmailTime: s.dailyEmailTime })) continue;
    const to = (await activeRecipients(db, b.id)).map((r) => r.email);
    if (!to.length) continue;
    const { email, providerId } = await renderDaily(db, b, today);
    const out: SendOutcome = await sendEmail({
      kind: "breakdown_daily",
      dedupeKey: `breakdown:${b.id}:day:${today}`,
      to,
      ...email,
      relatedType: "breakdown",
      relatedId: b.id,
      providerId,
      createdBy: null,
    });
    if (out.status === "sent" || out.status === "duplicate") {
      await db.update(breakdowns).set({ lastEmailOn: today, lastEmailAt: now }).where(eq(breakdowns.id, b.id));
      if (out.status === "sent") sent++;
    } else failed++;
  }
  return { sent, failed };
}

// ---------- Pause / resume ----------

export async function pauseDailyEmails(actor: Actor, id: string, input: PauseInput) {
  const db = getDb();
  const b = await findBreakdown(db, id);
  if (b.status !== "with_provider") throw badRequest("Daily emails only go out while the breakdown is with the service provider.");
  if (await currentPause(db, id)) throw badRequest("Daily emails are already paused.");
  if (input.resumeOn && input.resumeOn <= todayNepal()) {
    throw badRequest("Choose a resume date after today.", { resumeOn: "Choose a date after today." });
  }
  await db.insert(breakdownPauses).values({
    id: newId(),
    breakdownId: id,
    reason: input.reason,
    note: input.note,
    pausedAt: Date.now(),
    pausedBy: actor.id,
    resumeOn: input.resumeOn,
  });
  return { id };
}

export async function resumeDailyEmails(actor: Actor | null, id: string) {
  const db = getDb();
  const p = await currentPause(db, id);
  if (!p) throw badRequest("Daily emails are not paused.");
  await db.update(breakdownPauses).set({ resumedAt: Date.now(), resumedBy: actor?.id ?? null }).where(eq(breakdownPauses.id, p.id));
  return { id };
}

/** Tick: pauses whose resume date has come restart by themselves. */
export async function autoResume(now = Date.now()) {
  const today = todayNepal(now);
  const db = getDb();
  const due = await db
    .select({ id: breakdownPauses.id })
    .from(breakdownPauses)
    .where(and(isNull(breakdownPauses.resumedAt), lte(breakdownPauses.resumeOn, today)));
  if (due.length) {
    await db.update(breakdownPauses).set({ resumedAt: now, resumedBy: null }).where(inArray(breakdownPauses.id, due.map((d) => d.id)));
  }
  return due.length;
}

// ---------- Close ----------

export async function closeBreakdown(actor: Actor, id: string, input: CloseInput) {
  const db = getDb();
  const b = await findBreakdown(db, id);
  if (!unresolved.includes(b.status)) throw badRequest("This breakdown is already closed.");
  if (input.outcome === "not_repairable" && !can(actor.role, "breakdown.notRepairable")) throw forbidden();
  const now = Date.now();
  const wasWithProvider = b.status === "with_provider";

  await db.transaction(async (tx) => {
    if (input.outcome === "fixed") {
      await tx
        .update(breakdowns)
        .set({
          status: "fixed",
          closedAt: now,
          closedBy: actor.id,
          fixedBy: input.fixedBy,
          serviceEngineerName: input.fixedBy === "service_provider" ? input.serviceEngineerName : null,
          workDone: input.workDone,
          partsReplaced: input.partsReplaced,
        })
        .where(eq(breakdowns.id, id));
      await refreshStatus(tx, b.equipmentId);
    } else {
      await tx
        .update(breakdowns)
        .set({ status: "not_repairable", closedAt: now, closedBy: actor.id, workDone: input.reason })
        .where(eq(breakdowns.id, id));
      await tx.update(equipment).set({ status: "out_of_service", updatedAt: now }).where(eq(equipment.id, b.equipmentId));
      await logActivity(tx, { userId: actor.id, action: "equipment.outOfService", subjectType: "equipment", subjectId: b.equipmentId, summary: t.history.outOfService });
    }
    // An open pause ends with the breakdown.
    await tx
      .update(breakdownPauses)
      .set({ resumedAt: now, resumedBy: actor.id })
      .where(and(eq(breakdownPauses.breakdownId, id), isNull(breakdownPauses.resumedAt)));
  });

  await notifyClosed(id, actor.id);
  let email: SendOutcome | null = null;
  if (input.outcome === "fixed" && wasWithProvider) {
    const fresh = await findBreakdown(db, id);
    const { data, providerId } = await emailData(db, fresh);
    const d = durationParts(fresh.reportedAt, now);
    const fixedByName =
      input.fixedBy === "service_provider" ? input.serviceEngineerName || data.providerName : `our team (${actor.name})`;
    const rendered: Rendered = breakdownClosed({
      ...data,
      closedAt: now,
      fixedByName,
      downtime: `${d.days} ${d.days === 1 ? "day" : "days"} ${d.hours} ${d.hours === 1 ? "hour" : "hours"}`,
    });
    const to = (await activeRecipients(db, id)).map((r) => r.email);
    email = await sendEmail({
      kind: "breakdown_closed",
      dedupeKey: `breakdown:${id}:closed`,
      to,
      ...rendered,
      relatedType: "breakdown",
      relatedId: id,
      providerId,
      createdBy: actor.id,
    });
  }
  return { id, email };
}

// ---------- Detail ----------

/** Phone numbers for the WhatsApp buttons: the provider's service desk and engineers, and our team. */
async function phoneContacts(conn: Conn, b: typeof breakdowns.$inferSelect, providerId: string) {
  const [desk, designated, providerEngineers, team] = await Promise.all([
    conn
      .select({ id: providerContacts.id, phone: providerContacts.value, label: providerContacts.label })
      .from(providerContacts)
      .where(and(eq(providerContacts.providerId, providerId), eq(providerContacts.kind, "phone"), eq(providerContacts.isActive, true)))
      .orderBy(asc(providerContacts.createdAt)),
    conn
      .select({ id: serviceEngineers.id })
      .from(equipmentServiceEngineers)
      .innerJoin(serviceEngineers, eq(serviceEngineers.id, equipmentServiceEngineers.serviceEngineerId))
      .where(eq(equipmentServiceEngineers.equipmentId, b.equipmentId)),
    conn
      .select({ id: serviceEngineers.id, name: serviceEngineers.name, phone: serviceEngineers.phone })
      .from(serviceEngineers)
      .where(and(eq(serviceEngineers.providerId, providerId), eq(serviceEngineers.isActive, true)))
      .orderBy(asc(serviceEngineers.name)),
    conn
      .select({ id: user.id, name: user.name, phone: user.phone, role: user.role })
      .from(user)
      .where(and(inArray(user.role, [...teamRoles]), eq(user.banned, false)))
      .orderBy(asc(user.name)),
  ]);
  const mine = new Set(designated.map((d) => d.id));
  return {
    serviceDesk: desk.map((d) => ({ name: d.label ?? "", phone: d.phone })),
    serviceEngineers: providerEngineers
      .filter((e) => e.phone)
      .map((e) => ({ name: e.name, phone: e.phone as string, designated: mine.has(e.id) }))
      .sort((x, y) => Number(y.designated) - Number(x.designated)),
    team: team
      .filter((u) => u.phone)
      .map((u) => ({ id: u.id, name: u.name, phone: u.phone, role: u.role }))
      .sort((x, y) => Number(y.id === b.assignedTo) - Number(x.id === b.assignedTo)),
  };
}

export async function getBreakdown(id: string) {
  const db = getDb();
  const b = await findBreakdown(db, id);
  const eqRow = withAway(await equipmentRows(db).where(eq(equipment.id, b.equipmentId)))[0];
  if (!eqRow) throw notFound();
  const [people, notes, pauses, recipients, emails, assignments, cov] = await Promise.all([
    db.select({ id: user.id, name: user.name, phone: user.phone }).from(user).where(inArray(user.id, [b.assignedTo, b.recordedBy, ...(b.closedBy ? [b.closedBy] : [])])),
    db
      .select({ id: breakdownNotes.id, note: breakdownNotes.note, createdAt: breakdownNotes.createdAt, byName: user.name })
      .from(breakdownNotes)
      .innerJoin(user, eq(user.id, breakdownNotes.createdBy))
      .where(eq(breakdownNotes.breakdownId, id))
      .orderBy(desc(breakdownNotes.createdAt)),
    db
      .select({
        id: breakdownPauses.id,
        reason: breakdownPauses.reason,
        note: breakdownPauses.note,
        pausedAt: breakdownPauses.pausedAt,
        resumeOn: breakdownPauses.resumeOn,
        resumedAt: breakdownPauses.resumedAt,
        resumedBy: breakdownPauses.resumedBy,
        pausedByName: user.name,
      })
      .from(breakdownPauses)
      .innerJoin(user, eq(user.id, breakdownPauses.pausedBy))
      .where(eq(breakdownPauses.breakdownId, id))
      .orderBy(desc(breakdownPauses.pausedAt)),
    activeRecipients(db, id),
    db
      .select({
        id: emailLog.id,
        kind: emailLog.kind,
        subject: emailLog.subject,
        toAddresses: emailLog.toAddresses,
        ccAddresses: emailLog.ccAddresses,
        status: emailLog.status,
        error: emailLog.error,
        createdAt: emailLog.createdAt,
        byName: user.name,
      })
      .from(emailLog)
      .leftJoin(user, eq(user.id, emailLog.createdBy))
      .where(and(eq(emailLog.relatedType, "breakdown"), eq(emailLog.relatedId, id)))
      .orderBy(desc(emailLog.createdAt)),
    db
      .select({ summary: activityLog.summary, createdAt: activityLog.createdAt, action: activityLog.action, byName: user.name })
      .from(activityLog)
      .leftJoin(user, eq(user.id, activityLog.userId))
      .where(and(eq(activityLog.subjectType, "breakdown"), eq(activityLog.subjectId, id)))
      .orderBy(desc(activityLog.createdAt)),
    coverageAndPms(db, b.equipmentId),
  ]);
  const name = (uid: string | null) => people.find((p) => p.id === uid)?.name ?? null;
  const resumedByNames = await Promise.all(
    pauses.map(async (p) => (p.resumedBy ? ((await db.select({ name: user.name }).from(user).where(eq(user.id, p.resumedBy)))[0]?.name ?? null) : null)),
  );
  const providerName =
    (await db.select({ name: serviceProviders.name }).from(serviceProviders).where(eq(serviceProviders.id, b.providerId ?? eqRow.providerId)))[0]?.name ?? "";
  return {
    phoneContacts: { providerName, ...(await phoneContacts(db, b, b.providerId ?? eqRow.providerId)) },
    breakdown: {
      ...b,
      numberText: breakdownNumber(b.number),
      assignedName: name(b.assignedTo),
      assignedPhone: people.find((p) => p.id === b.assignedTo)?.phone ?? null,
      recordedName: name(b.recordedBy),
      closedName: name(b.closedBy),
    },
    equipment: eqRow,
    coverage: cov.current ? { type: cov.current.type, lastDay: cov.coverages.find((c) => c.isCurrent)?.lastDay ?? cov.current.endsOn } : null,
    currentPause: pauses.find((p) => p.resumedAt === null) ?? null,
    pauses: pauses.map((p, i) => ({ ...p, resumedByName: resumedByNames[i] ?? null })),
    notes,
    recipients,
    emails,
    assignments,
  };
}
