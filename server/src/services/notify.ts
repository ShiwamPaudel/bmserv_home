// Who hears about a breakdown, besides the service provider emails: push notifications to the team and
// to the person who reported it, and an email to the team when hospital staff report from a label.
import { and, eq, inArray, isNotNull, ne } from "drizzle-orm";
import { teamRoles } from "@bmserv/shared/enums";
import { breakdownNumber } from "@bmserv/shared/keys";
import { t } from "@bmserv/shared/terms";
import { env } from "../env";
import { getDb } from "../db/client";
import { breakdownNotes, breakdowns, equipment, user } from "../db/schema";
import { sendEmail } from "../emails/send";
import { breakdownReported } from "../emails/templates";
import { equipmentRows, withAway } from "./equipmentRows";
import { sendPush, teamUserIds } from "./push";
import { getSettings } from "./settings";

async function load(breakdownId: string) {
  const db = getDb();
  const b = (await db.select().from(breakdowns).where(eq(breakdowns.id, breakdownId)))[0];
  if (!b) return null;
  const e = withAway(await equipmentRows(db).where(eq(equipment.id, b.equipmentId)))[0];
  if (!e) return null;
  return { b, e, label: `${e.typeName} ${e.model}`, bd: breakdownNumber(b.number) };
}

/** Emails of active team members (Admin, Lead, Engineer). */
export async function teamEmails(): Promise<string[]> {
  const rows = await getDb()
    .select({ email: user.email })
    .from(user)
    .where(and(inArray(user.role, [...teamRoles]), eq(user.banned, false), isNotNull(user.email), ne(user.email, "")));
  return rows.map((r) => r.email);
}

/** A new breakdown, or the same problem reported again. Never throws. */
export async function notifyNewBreakdown(
  breakdownId: string,
  by: { id: string; name: string; phone: string },
  opts: { fromStaff: boolean; again?: string | null },
): Promise<void> {
  try {
    const s = await getSettings();
    const d = await load(breakdownId);
    if (!d) return;
    if (s.pushOnBreakdown) {
      await sendPush(await teamUserIds(by.id), {
        title: opts.again ? t.notifications.reportedAgainTitle(d.bd) : t.notifications.newBreakdownTitle(d.bd),
        body: t.notifications.newBreakdownBody(d.label, d.e.currentDepartmentName, opts.again ?? d.b.problem).slice(0, 240),
        url: `/breakdowns/${breakdownId}`,
        tag: `breakdown-${breakdownId}`,
      });
    }
    if (opts.fromStaff && !opts.again && s.emailTeamOnReport) {
      const responsible = (await getDb().select({ name: user.name }).from(user).where(eq(user.id, d.b.assignedTo)))[0];
      const rendered = breakdownReported({
        dateMode: s.dateDisplay,
        hospital: s.hospitalName,
        bdNumber: d.bd,
        typeName: d.e.typeName,
        manufacturer: d.e.manufacturer,
        model: d.e.model,
        serial: d.e.serialNumber,
        department: d.e.currentDepartmentName,
        problem: d.b.problem,
        reportedByName: by.name,
        reportedByPhone: by.phone,
        reportedAt: d.b.reportedAt,
        responsibleName: responsible?.name ?? "",
        link: `${env().APP_URL}/breakdowns/${breakdownId}`,
      });
      await sendEmail({
        kind: "breakdown_reported",
        dedupeKey: `breakdown:${breakdownId}:reported`,
        to: await teamEmails(),
        ...rendered,
        relatedType: "breakdown",
        relatedId: breakdownId,
        providerId: null,
        createdBy: by.id,
        internal: true,
      });
    }
  } catch (err) {
    console.error("Breakdown notification failed:", err instanceof Error ? err.message : err);
  }
}

/** Closed: tell the person who reported it (if it was not them who closed it). Never throws. */
export async function notifyClosed(breakdownId: string, closedById: string): Promise<void> {
  try {
    const s = await getSettings();
    if (!s.pushOnFixed) return;
    const d = await load(breakdownId);
    if (!d) return;
    // The person who recorded it, and hospital staff whose report was added to it as a note.
    const db = getDb();
    const recorder = await db.select({ id: user.id, role: user.role }).from(user).where(eq(user.id, d.b.recordedBy));
    const staffNoted = await db
      .selectDistinct({ id: user.id, role: user.role })
      .from(breakdownNotes)
      .innerJoin(user, eq(user.id, breakdownNotes.createdBy))
      .where(and(eq(breakdownNotes.breakdownId, breakdownId), eq(user.role, "staff")));
    const people = new Map([...recorder, ...staffNoted].filter((p) => p.id !== closedById).map((p) => [p.id, p.role]));
    const fixed = d.b.status === "fixed";
    const message = {
      title: fixed ? t.notifications.fixedTitle(d.bd) : t.notifications.notRepairableTitle(d.bd),
      body: fixed ? t.notifications.fixedBody(d.label, d.e.currentDepartmentName) : t.notifications.notRepairableBody(d.label),
      tag: `breakdown-${breakdownId}`,
    };
    const staffIds = [...people].filter(([, role]) => role === "staff").map(([id]) => id);
    const teamIds = [...people].filter(([, role]) => role !== "staff").map(([id]) => id);
    if (staffIds.length) await sendPush(staffIds, { ...message, url: "/my-reports" });
    if (teamIds.length) await sendPush(teamIds, { ...message, url: `/breakdowns/${breakdownId}` });
  } catch (err) {
    console.error("Breakdown notification failed:", err instanceof Error ? err.message : err);
  }
}
