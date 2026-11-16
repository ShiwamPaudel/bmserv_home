import { and, eq } from "drizzle-orm";
import { Resend } from "resend";
import type { EmailKind } from "@bmserv/shared/enums";
import { env } from "../env";
import { getDb } from "../db/client";
import { emailLog, settings } from "../db/schema";
import { newId } from "../lib/ids";

export type OutgoingEmail = {
  to: string[];
  cc?: string[];
  replyTo?: string;
  subject: string;
  text: string;
  html: string;
};

export type DeliveryResult = { ok: true; id: string } | { ok: false; error: string };
export type Transport = (email: OutgoingEmail) => Promise<DeliveryResult>;

let resend: Resend | null = null;

const resendTransport: Transport = async (email) => {
  resend ??= new Resend(env().RESEND_API_KEY);
  const { data, error } = await resend.emails.send({
    from: env().MAIL_FROM,
    to: email.to,
    ...(email.cc && email.cc.length ? { cc: email.cc } : {}),
    ...(email.replyTo ? { replyTo: email.replyTo } : {}),
    subject: email.subject,
    text: email.text,
    html: email.html,
  });
  if (error || !data) return { ok: false, error: error?.message ?? "No response from Resend" };
  return { ok: true, id: data.id };
};

let transport: Transport = resendTransport;

/** Tests replace the transport so nothing reaches Resend. */
export function setTransportForTests(t: Transport | null): void {
  transport = t ?? resendTransport;
}

/**
 * Applies EMAIL_REDIRECT_TO: while set, everything goes only to that address and the body starts
 * with who it would have gone to. Never bypass this.
 */
export function applyRedirect(email: OutgoingEmail): OutgoingEmail {
  const redirect = env().EMAIL_REDIRECT_TO;
  if (!redirect) return email;
  const wouldHave = [...email.to, ...(email.cc ?? []).map((c) => `${c} (copy)`)].join(", ");
  const note = `Test copy. Would have gone to: ${wouldHave}`;
  return {
    to: [redirect],
    subject: email.subject,
    text: `${note}\n\n${email.text}`,
    html: `<p style="background:#FFF0D2;color:#8A4B00;padding:8px">${escapeHtml(note)}</p>${email.html}`,
    ...(email.replyTo ? { replyTo: email.replyTo } : {}),
  };
}

/** The only place that hands an email to Resend. Callers use sendEmail() below (logged, deduped). */
export async function deliver(email: OutgoingEmail): Promise<DeliveryResult> {
  try {
    return await transport(applyRedirect(email));
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Sending failed" };
  }
}

export type SendInput = {
  kind: EmailKind;
  dedupeKey: string;
  to: string[];
  subject: string;
  text: string;
  html: string;
  relatedType: string | null;
  relatedId: string | null;
  providerId: string | null;
  createdBy: string | null;
  /** Emails to our own team: no copy to the service-provider CC list. */
  internal?: boolean;
};

export type SendOutcome = { status: "sent" | "failed" | "duplicate"; logId: string | null; error?: string };

/**
 * Logs first with a unique dedupe key: a clash means it was already sent, so nothing goes out.
 * A failed send may be retried with the same key. CC and Reply-To come from hospital settings.
 */
export async function sendEmail(input: SendInput): Promise<SendOutcome> {
  const db = getDb();
  const s = (await db.select().from(settings).where(eq(settings.id, 1)))[0];
  const cc = input.internal ? [] : (s?.emailCc ?? []);
  const to = [...new Set(input.to.map((a) => a.toLowerCase()))];
  if (!to.length) return { status: "failed", logId: null, error: "No recipients" };

  const id = newId();
  const inserted = await db
    .insert(emailLog)
    .values({
      id,
      kind: input.kind,
      dedupeKey: input.dedupeKey,
      toAddresses: to.join(", "),
      ccAddresses: cc.length ? cc.join(", ") : null,
      subject: input.subject,
      bodyText: input.text,
      status: "sending",
      relatedType: input.relatedType,
      relatedId: input.relatedId,
      providerId: input.providerId,
      createdBy: input.createdBy,
      createdAt: Date.now(),
    })
    .onConflictDoNothing({ target: emailLog.dedupeKey })
    .returning({ id: emailLog.id });

  let logId = inserted[0]?.id ?? null;
  if (!logId) {
    // Already there. Retry only if the earlier attempt failed (claimed atomically).
    const retried = await db
      .update(emailLog)
      .set({ status: "sending", error: null, toAddresses: to.join(", "), subject: input.subject, bodyText: input.text })
      .where(and(eq(emailLog.dedupeKey, input.dedupeKey), eq(emailLog.status, "failed")))
      .returning({ id: emailLog.id });
    logId = retried[0]?.id ?? null;
    if (!logId) return { status: "duplicate", logId: null };
  }

  const result = await deliver({
    to,
    cc,
    ...(s?.departmentEmail ? { replyTo: s.departmentEmail } : {}),
    subject: input.subject,
    text: input.text,
    html: input.html,
  });
  if (result.ok) {
    await db.update(emailLog).set({ status: "sent", resendId: result.id, error: null }).where(eq(emailLog.id, logId));
    return { status: "sent", logId };
  }
  await db.update(emailLog).set({ status: "failed", error: result.error.slice(0, 500) }).where(eq(emailLog.id, logId));
  return { status: "failed", logId, error: result.error };
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
}
