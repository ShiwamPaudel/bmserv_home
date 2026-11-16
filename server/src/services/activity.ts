import type { Conn } from "../db/client";
import { activityLog } from "../db/schema";
import { newId } from "../lib/ids";

export async function logActivity(
  conn: Conn,
  entry: { userId: string | null; action: string; subjectType: string; subjectId: string; summary: string },
): Promise<void> {
  await conn.insert(activityLog).values({ id: newId(), ...entry, createdAt: Date.now() });
}
