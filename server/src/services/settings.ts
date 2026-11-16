import { and, eq, inArray } from "drizzle-orm";
import { teamRoles } from "@bmserv/shared/enums";
import type { SettingsUpdate } from "@bmserv/shared/schemas/settings";
import { t } from "@bmserv/shared/terms";
import { getDb } from "../db/client";
import { settings, user } from "../db/schema";
import { badRequest, notFound } from "../lib/errors";
import type { Actor } from "../lib/http";
import { logActivity } from "./activity";

export type Settings = typeof settings.$inferSelect;

export async function getSettings(): Promise<Settings> {
  const rows = await getDb().select().from(settings).where(eq(settings.id, 1));
  if (!rows[0]) throw notFound("Hospital settings are missing. Run npm run db:seed.");
  return rows[0];
}

/** Settings are saved one tab at a time; only the fields sent change. */
export async function updateSettings(actor: Actor, input: SettingsUpdate): Promise<Settings> {
  const db = getDb();
  if (input.staffReportAssigneeId) {
    const ok = await db
      .select({ id: user.id })
      .from(user)
      .where(and(eq(user.id, input.staffReportAssigneeId), inArray(user.role, [...teamRoles]), eq(user.banned, false)));
    if (!ok[0]) throw badRequest(t.fields.choose, { staffReportAssigneeId: t.fields.choose });
  }
  const patch: Partial<typeof settings.$inferInsert> = {};
  for (const [k, v] of Object.entries(input)) {
    if (v !== undefined) (patch as Record<string, unknown>)[k] = v;
  }
  if (input.emailCc) patch.emailCc = [...new Set(input.emailCc)];
  await db.transaction(async (tx) => {
    await tx
      .update(settings)
      .set({ ...patch, updatedAt: Date.now() })
      .where(eq(settings.id, 1));
    await logActivity(tx, {
      userId: actor.id,
      action: "settings.updated",
      subjectType: "settings",
      subjectId: "1",
      summary: "Hospital settings changed",
    });
  });
  return getSettings();
}
