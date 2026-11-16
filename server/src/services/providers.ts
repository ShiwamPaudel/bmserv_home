import { and, asc, desc, eq, ne, sql } from "drizzle-orm";
import { t } from "@bmserv/shared/terms";
import { getDb } from "../db/client";
import { emailLog, equipment, providerContacts, serviceEngineers, serviceProviders, user } from "../db/schema";
import { conflict, notFound } from "../lib/errors";
import { newId } from "../lib/ids";
import type { Actor } from "../lib/http";
import { logActivity } from "./activity";
import { equipmentRows, withAway } from "./equipmentRows";
import { ref } from "../lib/sqlRef";

const nameKey = (n: string) => n.trim().replace(/\s+/g, " ").toLowerCase();

type ProviderInput = {
  name: string;
  address: string | null;
  companyPhone: string | null;
  companyEmail: string | null;
  notes: string | null;
};

export async function listProviders() {
  return getDb()
    .select({
      id: serviceProviders.id,
      name: serviceProviders.name,
      isActive: serviceProviders.isActive,
      companyPhone: serviceProviders.companyPhone,
      equipmentCount: sql<number>`(select count(*) from equipment e where e.service_provider_id = ${ref(serviceProviders.id)})`,
      engineerCount: sql<number>`(select count(*) from service_engineers s where s.provider_id = ${ref(serviceProviders.id)} and s.is_active = 1)`,
      emailCount: sql<number>`(select count(*) from provider_contacts p where p.provider_id = ${ref(serviceProviders.id)} and p.kind = 'email' and p.is_active = 1)`,
    })
    .from(serviceProviders)
    .orderBy(desc(serviceProviders.isActive), asc(serviceProviders.name));
}

async function assertNameFree(name: string, exceptId?: string) {
  const r = await getDb()
    .select({ id: serviceProviders.id })
    .from(serviceProviders)
    .where(and(eq(serviceProviders.nameKey, nameKey(name)), exceptId ? ne(serviceProviders.id, exceptId) : undefined));
  if (r[0]) throw conflict(t.providers.nameTaken, { name: t.providers.nameTaken });
}

export async function createProvider(
  actor: Actor,
  input: ProviderInput & {
    contacts?: { kind: "phone" | "email"; value: string; label: string | null }[];
    engineer?: { name: string; phone: string; email: string };
  },
) {
  await assertNameFree(input.name);
  const id = newId();
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx.insert(serviceProviders).values({
      id,
      name: input.name,
      nameKey: nameKey(input.name),
      address: input.address,
      companyPhone: input.companyPhone,
      companyEmail: input.companyEmail,
      notes: input.notes,
    });
    for (const c of input.contacts ?? []) {
      await tx.insert(providerContacts).values({ id: newId(), providerId: id, ...c });
    }
    if (input.engineer) {
      await tx.insert(serviceEngineers).values({ id: newId(), providerId: id, ...input.engineer, createdBy: actor.id });
    }
    await logActivity(tx, {
      userId: actor.id,
      action: "provider.added",
      subjectType: "service_provider",
      subjectId: id,
      summary: `Added service provider ${input.name}`,
    });
  });
  return { id };
}

export async function updateProvider(actor: Actor, id: string, input: Partial<ProviderInput> & { isActive?: boolean | undefined }) {
  const db = getDb();
  const found = await db.select().from(serviceProviders).where(eq(serviceProviders.id, id));
  if (!found[0]) throw notFound();
  if (input.name) await assertNameFree(input.name, id);
  const patch: Partial<typeof serviceProviders.$inferInsert> = {};
  for (const k of ["address", "companyPhone", "companyEmail", "notes", "isActive"] as const) {
    if (input[k] !== undefined) (patch as Record<string, unknown>)[k] = input[k];
  }
  if (input.name) {
    patch.name = input.name;
    patch.nameKey = nameKey(input.name);
  }
  await db.update(serviceProviders).set(patch).where(eq(serviceProviders.id, id));
  await logActivity(db, {
    userId: actor.id,
    action: "provider.updated",
    subjectType: "service_provider",
    subjectId: id,
    summary: `Changed service provider ${input.name ?? found[0].name}`,
  });
  return { id };
}

export async function getProvider(id: string) {
  const db = getDb();
  const found = await db.select().from(serviceProviders).where(eq(serviceProviders.id, id));
  if (!found[0]) throw notFound();
  const [contacts, engineers, equipmentList, emails] = await Promise.all([
    db
      .select()
      .from(providerContacts)
      .where(and(eq(providerContacts.providerId, id), eq(providerContacts.isActive, true)))
      .orderBy(asc(providerContacts.kind), asc(providerContacts.createdAt)),
    db
      .select()
      .from(serviceEngineers)
      .where(eq(serviceEngineers.providerId, id))
      .orderBy(desc(serviceEngineers.isActive), asc(serviceEngineers.name)),
    equipmentRows(db).where(eq(equipment.serviceProviderId, id)).orderBy(asc(sql`type_name`), asc(equipment.serialNumber)),
    db
      .select({
        id: emailLog.id,
        kind: emailLog.kind,
        subject: emailLog.subject,
        toAddresses: emailLog.toAddresses,
        status: emailLog.status,
        error: emailLog.error,
        createdAt: emailLog.createdAt,
        relatedType: emailLog.relatedType,
        relatedId: emailLog.relatedId,
        byName: user.name,
      })
      .from(emailLog)
      .leftJoin(user, eq(user.id, emailLog.createdBy))
      .where(eq(emailLog.providerId, id))
      .orderBy(desc(emailLog.createdAt))
      .limit(100),
  ]);
  return { provider: found[0], contacts, engineers, equipment: withAway(equipmentList), emails };
}

export async function addContact(
  actor: Actor,
  providerId: string,
  input: { kind: "phone" | "email"; value: string; label: string | null },
) {
  const db = getDb();
  const found = await db.select({ id: serviceProviders.id }).from(serviceProviders).where(eq(serviceProviders.id, providerId));
  if (!found[0]) throw notFound();
  const id = newId();
  await db.insert(providerContacts).values({ id, providerId, ...input });
  await logActivity(db, {
    userId: actor.id,
    action: "provider.contactAdded",
    subjectType: "service_provider",
    subjectId: providerId,
    summary: `Added ${input.kind} ${input.value}`,
  });
  return { id };
}

export async function updateContact(
  actor: Actor,
  id: string,
  input: { value?: string | undefined; label?: string | null | undefined; isActive?: boolean | undefined },
) {
  const db = getDb();
  const found = await db.select().from(providerContacts).where(eq(providerContacts.id, id));
  if (!found[0]) throw notFound();
  await db
    .update(providerContacts)
    .set({
      ...(input.value !== undefined
        ? { value: found[0].kind === "email" ? input.value.toLowerCase() : input.value }
        : {}),
      ...(input.label !== undefined ? { label: input.label } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    })
    .where(eq(providerContacts.id, id));
  await logActivity(db, {
    userId: actor.id,
    action: "provider.contactUpdated",
    subjectType: "service_provider",
    subjectId: found[0].providerId,
    summary: input.isActive === false ? `Removed ${found[0].value}` : `Changed ${found[0].value}`,
  });
  return { id };
}

type EngineerInput = { name: string; phone: string; email: string | null; notes: string | null };

export async function addServiceEngineer(actor: Actor, providerId: string, input: EngineerInput) {
  const db = getDb();
  const found = await db.select({ id: serviceProviders.id }).from(serviceProviders).where(eq(serviceProviders.id, providerId));
  if (!found[0]) throw notFound();
  const id = newId();
  await db.insert(serviceEngineers).values({ id, providerId, ...input, createdBy: actor.id });
  await logActivity(db, {
    userId: actor.id,
    action: "serviceEngineer.added",
    subjectType: "service_provider",
    subjectId: providerId,
    summary: `Added service engineer ${input.name}`,
  });
  const row = await db.select().from(serviceEngineers).where(eq(serviceEngineers.id, id));
  return row[0];
}

export async function updateServiceEngineer(
  actor: Actor,
  id: string,
  input: Partial<EngineerInput> & { isActive?: boolean | undefined },
) {
  const db = getDb();
  const found = await db.select().from(serviceEngineers).where(eq(serviceEngineers.id, id));
  if (!found[0]) throw notFound();
  const patch: Partial<typeof serviceEngineers.$inferInsert> = { updatedAt: Date.now() };
  for (const k of ["name", "phone", "email", "notes", "isActive"] as const) {
    if (input[k] !== undefined) (patch as Record<string, unknown>)[k] = input[k];
  }
  await db.update(serviceEngineers).set(patch).where(eq(serviceEngineers.id, id));
  await logActivity(db, {
    userId: actor.id,
    action: "serviceEngineer.updated",
    subjectType: "service_provider",
    subjectId: found[0].providerId,
    summary: `Changed service engineer ${input.name ?? found[0].name}`,
  });
  return { id };
}
