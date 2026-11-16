// Web Push (PWA notifications) with VAPID. The only caller of web-push. Never throws to the caller:
// a notification that cannot be delivered must not stop a breakdown from being saved.
import { and, eq, inArray } from "drizzle-orm";
import webpush from "web-push";
import { teamRoles } from "@bmserv/shared/enums";
import type { PushSubscriptionInput } from "@bmserv/shared/schemas/report";
import { env } from "../env";
import { getDb } from "../db/client";
import { pushSubscriptions, user } from "../db/schema";
import { newId } from "../lib/ids";
import type { Actor } from "../lib/http";

export type PushPayload = { title: string; body: string; url: string; tag?: string };
type Target = { endpoint: string; keys: { p256dh: string; auth: string } };
/** Resolves with the HTTP status; 404/410 mean the browser dropped the subscription. */
export type PushTransport = (target: Target, payload: string) => Promise<number>;

let testTransport: PushTransport | null = null;
export const sentForTests: { userId: string; payload: PushPayload }[] = [];

/** For tests only: replace delivery and record what would be sent. */
export function setPushTransportForTests(t: PushTransport | null): void {
  testTransport = t;
}

export function pushPublicKey(): string | null {
  const e = env();
  return e.VAPID_PUBLIC_KEY && e.VAPID_PRIVATE_KEY ? e.VAPID_PUBLIC_KEY : null;
}

let configured = false;
function realTransport(): PushTransport | null {
  const e = env();
  if (!e.VAPID_PUBLIC_KEY || !e.VAPID_PRIVATE_KEY) return null;
  if (!configured) {
    webpush.setVapidDetails(e.VAPID_SUBJECT ?? "mailto:biomedical@example.com", e.VAPID_PUBLIC_KEY, e.VAPID_PRIVATE_KEY);
    configured = true;
  }
  return async (target, payload) => {
    try {
      const r = await webpush.sendNotification(target, payload, { TTL: 24 * 3600, urgency: "high", timeout: 8000 });
      return r.statusCode;
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      return typeof status === "number" ? status : 0;
    }
  };
}

export async function saveSubscription(actor: Actor, sub: PushSubscriptionInput, userAgent: string | null) {
  const db = getDb();
  // One row per browser: if this browser was signed in as someone else before, it moves to this person.
  await db
    .insert(pushSubscriptions)
    .values({ id: newId(), userId: actor.id, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, userAgent: userAgent?.slice(0, 300) ?? null })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: { userId: actor.id, p256dh: sub.keys.p256dh, auth: sub.keys.auth, userAgent: userAgent?.slice(0, 300) ?? null },
    });
  return { ok: true };
}

export async function removeSubscription(actor: Actor, endpoint: string) {
  await getDb()
    .delete(pushSubscriptions)
    .where(and(eq(pushSubscriptions.endpoint, endpoint), eq(pushSubscriptions.userId, actor.id)));
  return { ok: true };
}

export async function subscriptionCount(userId: string): Promise<number> {
  const rows = await getDb().select({ id: pushSubscriptions.id }).from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
  return rows.length;
}

/** Active Admins, Leads and Engineers, except `exceptId`. */
export async function teamUserIds(exceptId?: string | null): Promise<string[]> {
  const rows = await getDb()
    .select({ id: user.id })
    .from(user)
    .where(and(inArray(user.role, [...teamRoles]), eq(user.banned, false)));
  return rows.map((r) => r.id).filter((id) => id !== exceptId);
}

/** Sends to every device of these people. Returns how many devices accepted it. */
export async function sendPush(userIds: string[], payload: PushPayload): Promise<number> {
  if (!userIds.length) return 0;
  const transport = testTransport ?? realTransport();
  if (!transport) return 0;
  try {
    const db = getDb();
    const subs = await db
      .select()
      .from(pushSubscriptions)
      .innerJoin(user, eq(user.id, pushSubscriptions.userId))
      .where(and(inArray(pushSubscriptions.userId, [...new Set(userIds)]), eq(user.banned, false)));
    if (testTransport) for (const s of subs) sentForTests.push({ userId: s.push_subscriptions.userId, payload });
    const body = JSON.stringify(payload);
    const results = await Promise.all(
      subs.map(async ({ push_subscriptions: s }) => {
        const status = await transport({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body);
        if (status === 404 || status === 410) {
          // The browser dropped it (uninstalled, permission removed): machine data, safe to delete.
          await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, s.id));
          return false;
        }
        if (status >= 200 && status < 300) {
          await db.update(pushSubscriptions).set({ lastSentAt: Date.now() }).where(eq(pushSubscriptions.id, s.id));
          return true;
        }
        return false;
      }),
    );
    return results.filter(Boolean).length;
  } catch (err) {
    console.error("Push failed:", err instanceof Error ? err.message : err);
    return 0;
  }
}
