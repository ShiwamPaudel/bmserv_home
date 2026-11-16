// Reporting a problem from a label: what hospital staff (and the team) see after scanning a QR code.
import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import { teamRoles, type BreakdownStatus } from "@bmserv/shared/enums";
import { breakdownNumber } from "@bmserv/shared/keys";
import type { ReportInput } from "@bmserv/shared/schemas/report";
import { t } from "@bmserv/shared/terms";
import { env } from "../env";
import { getDb } from "../db/client";
import { breakdownNotes, breakdowns, equipment, user } from "../db/schema";
import { AppError, badRequest, notFound } from "../lib/errors";
import { newId } from "../lib/ids";
import type { Actor } from "../lib/http";
import { recordBreakdown } from "./breakdowns";
import { equipmentRows, withAway } from "./equipmentRows";
import { notifyNewBreakdown } from "./notify";
import { getSettings } from "./settings";

const unresolved: BreakdownStatus[] = ["open", "with_provider"];

async function assertAllowed(actor: Actor) {
  const s = await getSettings();
  if (actor.role === "staff" && !s.staffReports) throw new AppError(403, "forbidden", t.report.off);
  return s;
}

async function byQr(qrCode: string) {
  const e = withAway(await equipmentRows(getDb()).where(eq(equipment.qrCode, qrCode)))[0];
  if (!e) throw notFound(t.scan.notFound);
  return e;
}

async function openBreakdown(equipmentId: string) {
  const r = await getDb()
    .select({ id: breakdowns.id, number: breakdowns.number, status: breakdowns.status, reportedAt: breakdowns.reportedAt })
    .from(breakdowns)
    .where(and(eq(breakdowns.equipmentId, equipmentId), inArray(breakdowns.status, unresolved)))
    .orderBy(desc(breakdowns.reportedAt))
    .limit(1);
  return r[0] ?? null;
}

/** Team members with a phone, responsible person first: for the WhatsApp buttons. */
async function teamContacts(firstId: string | null) {
  const rows = await getDb()
    .select({ id: user.id, name: user.name, phone: user.phone, role: user.role })
    .from(user)
    .where(and(inArray(user.role, [...teamRoles]), eq(user.banned, false), ne(user.phone, "")))
    .orderBy(asc(user.name));
  const rank = (r: (typeof rows)[number]) => (r.id === firstId ? 0 : r.role === "lead" ? 1 : r.role === "engineer" ? 2 : 3);
  return rows.sort((a, b) => rank(a) - rank(b)).slice(0, 8);
}

/** Who is responsible for a problem reported by staff: the setting, else the first active Lead, else Admin. */
async function staffAssignee(settingId: string | null): Promise<string | null> {
  const db = getDb();
  if (settingId) {
    const ok = await db
      .select({ id: user.id })
      .from(user)
      .where(and(eq(user.id, settingId), inArray(user.role, [...teamRoles]), eq(user.banned, false)));
    if (ok[0]) return settingId;
  }
  for (const role of ["lead", "admin"] as const) {
    const r = await db.select({ id: user.id }).from(user).where(and(eq(user.role, role), eq(user.banned, false))).orderBy(asc(user.createdAt)).limit(1);
    if (r[0]) return r[0].id;
  }
  return null;
}

export async function reportInfo(actor: Actor, qrCode: string) {
  const s = await assertAllowed(actor);
  const e = await byQr(qrCode);
  const open = await openBreakdown(e.id);
  return {
    equipment: {
      id: e.id,
      qrCode: e.qrCode,
      typeName: e.typeName,
      manufacturer: e.manufacturer,
      model: e.model,
      serialNumber: e.serialNumber,
      hospitalTag: e.hospitalTag,
      currentDepartmentName: e.currentDepartmentName,
      status: e.status,
      photoFileId: e.modelPhotoFileId,
    },
    open: open ? { numberText: breakdownNumber(open.number), status: open.status, reportedAt: open.reportedAt } : null,
    departmentPhone: s.departmentPhone,
  };
}

export async function reportProblem(actor: Actor, input: ReportInput) {
  const s = await assertAllowed(actor);
  const e = await byQr(input.qrCode);
  if (e.status === "out_of_service") throw badRequest(t.report.outOfService);
  const fromStaff = actor.role === "staff";
  const open = await openBreakdown(e.id);
  let id: string;
  let numberText: string;
  let again = false;
  if (open) {
    // Same equipment already reported: add this as a note instead of a second breakdown.
    id = open.id;
    numberText = breakdownNumber(open.number);
    again = true;
    const note = t.report.teamNote(actor.name, input.problem);
    await getDb().insert(breakdownNotes).values({ id: newId(), breakdownId: id, note, createdBy: actor.id, createdAt: Date.now() });
    await notifyNewBreakdown(id, actor, { fromStaff, again: input.problem });
  } else {
    const assignedTo = fromStaff ? await staffAssignee(s.staffReportAssigneeId) : actor.id;
    if (!assignedTo) throw badRequest(t.app.somethingWrong);
    const r = await recordBreakdown(
      actor,
      { equipmentId: e.id, problem: input.problem, reportedByName: actor.name, reportedAt: Date.now() },
      { assignedTo, fromStaff },
    );
    id = r.id;
    numberText = r.numberText;
  }
  const responsible = (await getDb().select({ assignedTo: breakdowns.assignedTo }).from(breakdowns).where(eq(breakdowns.id, id)))[0];
  const contacts = s.whatsappButtons ? await teamContacts(responsible?.assignedTo ?? null) : [];
  return {
    id,
    numberText,
    again,
    whatsapp: {
      text: t.whatsapp.reportToTeam({
        bd: numberText,
        equipment: `${e.typeName} ${e.model}, S.N. ${e.serialNumber}`,
        department: e.currentDepartmentName,
        problem: input.problem,
        by: actor.name,
        link: `${env().APP_URL}/breakdowns/${id}`,
      }),
      contacts: contacts.map((c) => ({ name: c.name, phone: c.phone, role: c.role })),
    },
    countryCode: s.countryCode,
  };
}

/** What someone reported, newest first, with what happened to it. */
export async function myReports(actor: Actor) {
  const db = getDb();
  const rows = await db
    .select({
      id: breakdowns.id,
      number: breakdowns.number,
      status: breakdowns.status,
      problem: breakdowns.problem,
      reportedAt: breakdowns.reportedAt,
      closedAt: breakdowns.closedAt,
      equipmentId: breakdowns.equipmentId,
      assignedName: user.name,
    })
    .from(breakdowns)
    .innerJoin(user, eq(user.id, breakdowns.assignedTo))
    .where(eq(breakdowns.recordedBy, actor.id))
    .orderBy(desc(breakdowns.reportedAt))
    .limit(50);
  const ids = [...new Set(rows.map((r) => r.equipmentId))];
  const eqRows = ids.length ? withAway(await equipmentRows(db).where(inArray(equipment.id, ids))) : [];
  const byId = new Map(eqRows.map((e) => [e.id, e]));
  return rows.map((r) => {
    const e = byId.get(r.equipmentId);
    return {
      ...r,
      numberText: breakdownNumber(r.number),
      equipment: e
        ? {
            typeName: e.typeName,
            manufacturer: e.manufacturer,
            model: e.model,
            serialNumber: e.serialNumber,
            currentDepartmentName: e.currentDepartmentName,
            photoFileId: e.modelPhotoFileId,
          }
        : null,
    };
  });
}
