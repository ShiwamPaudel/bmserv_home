import { z } from "zod";
import { adDate, text } from "./common";

/** Reports: the date range (Nepal dates, AD). */
export const reportRangeSchema = z.object({ from: adDate(), to: adDate() });

/** A problem reported from a label (QR) by hospital staff or the team. */
export const reportSchema = z.object({
  qrCode: z.string().trim().regex(/^[A-Za-z0-9]{6,20}$/),
  problem: text(2000),
});
export type ReportInput = z.infer<typeof reportSchema>;

/** A browser's Web Push subscription (PushSubscription.toJSON()). */
export const pushSubscriptionSchema = z.object({
  endpoint: z.url().max(1000),
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(8).max(100) }),
});
export type PushSubscriptionInput = z.infer<typeof pushSubscriptionSchema>;

export const pushEndpointSchema = z.object({ endpoint: z.url().max(1000) });
