// Who receives emails (ARCHITECTURE.md section 4, "Breakdown recipients"; PRD 6 "Recipients").
import { and, asc, eq, inArray, isNotNull } from "drizzle-orm";
import type { RecipientSource } from "@bmserv/shared/enums";
import type { Conn } from "../db/client";
import { equipmentServiceEngineers, providerContacts, serviceEngineers } from "../db/schema";

export type Recipient = { source: RecipientSource; sourceId: string | null; email: string; name: string | null };

/** Active service department emails of the provider. */
export async function departmentEmails(conn: Conn, providerId: string): Promise<Recipient[]> {
  const rows = await conn
    .select({ id: providerContacts.id, value: providerContacts.value, label: providerContacts.label })
    .from(providerContacts)
    .where(and(eq(providerContacts.providerId, providerId), eq(providerContacts.kind, "email"), eq(providerContacts.isActive, true)))
    .orderBy(asc(providerContacts.createdAt));
  return rows.map((r) => ({ source: "contact", sourceId: r.id, email: r.value.toLowerCase(), name: r.label }));
}

/** Emails of the equipment's active designated service engineers. */
export async function designatedEmails(conn: Conn, equipmentIds: string[]): Promise<(Recipient & { equipmentId: string })[]> {
  if (!equipmentIds.length) return [];
  const rows = await conn
    .select({
      equipmentId: equipmentServiceEngineers.equipmentId,
      id: serviceEngineers.id,
      name: serviceEngineers.name,
      email: serviceEngineers.email,
    })
    .from(equipmentServiceEngineers)
    .innerJoin(serviceEngineers, eq(serviceEngineers.id, equipmentServiceEngineers.serviceEngineerId))
    .where(
      and(
        inArray(equipmentServiceEngineers.equipmentId, equipmentIds),
        eq(serviceEngineers.isActive, true),
        isNotNull(serviceEngineers.email),
      ),
    );
  return rows
    .filter((r) => r.email)
    .map((r) => ({
      equipmentId: r.equipmentId,
      source: "service_engineer" as const,
      sourceId: r.id,
      email: (r.email as string).toLowerCase(),
      name: r.name,
    }));
}

/** Default recipients on "Ask service provider for help". */
export async function defaultBreakdownRecipients(conn: Conn, equipmentId: string, providerId: string): Promise<Recipient[]> {
  const [dept, eng] = await Promise.all([departmentEmails(conn, providerId), designatedEmails(conn, [equipmentId])]);
  return dedupe([...dept, ...eng.map(({ equipmentId: _e, ...r }) => r)]);
}

export function dedupe<T extends { email: string }>(list: T[]): T[] {
  const seen = new Set<string>();
  return list.filter((r) => {
    const key = r.email.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
