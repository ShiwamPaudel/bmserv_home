import { and, asc, count, desc, eq, inArray, isNull, ne, sql, type SQL } from "drizzle-orm";
import { manualKinds, type EquipmentStatus, type FileKind } from "@bmserv/shared/enums";
import { serialKey, tagKey } from "@bmserv/shared/keys";
import { can } from "@bmserv/shared/permissions";
import type { EquipmentInput, EquipmentUpdate, EquipmentCreate } from "@bmserv/shared/schemas/equipment";
import { insertCoverage } from "./coverage";
import { addDays, todayNepal } from "@bmserv/shared/dates";
import { coverageLastDay, isCoverageCurrent } from "@bmserv/shared/pms";
import { t } from "@bmserv/shared/terms";
import { getDb, type Conn } from "../db/client";
import {
  breakdowns,
  coverage,
  departments,
  equipment,
  equipmentModels,
  equipmentServiceEngineers,
  files,
  moves,
  pmsVisits,
  serviceEngineers,
  serviceProviders,
  providerContacts,
  user,
} from "../db/schema";
import { badRequest, conflict, forbidden, notFound } from "../lib/errors";
import { newId, newQrCode } from "../lib/ids";
import type { Actor } from "../lib/http";
import { logActivity } from "./activity";
import { coverageEndingBy, equipmentRows, hasCurrentCoverage, hasCurrentCoverageOfType, textSearch, withAway } from "./equipmentRows";
import { getSettings } from "./settings";

export type EquipmentFilters = {
  q?: string | undefined;
  departmentId?: string | undefined;
  status?: string | undefined;
  coverage?: string | undefined;
  providerId?: string | undefined;
  /** Days ahead that count as "ending soon" (Settings). */
  coverageWarnDays?: number | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
};

function filterWhere(f: EquipmentFilters, today: string): SQL | undefined {
  const parts: (SQL | undefined)[] = [];
  if (f.q) parts.push(textSearch(f.q));
  if (f.departmentId) parts.push(eq(equipment.currentDepartmentId, f.departmentId));
  if (f.status === "working" || f.status === "breakdown" || f.status === "out_of_service")
    parts.push(eq(equipment.status, f.status));
  if (f.status === "away") parts.push(ne(equipment.currentDepartmentId, equipment.homeDepartmentId));
  if (f.status === "label") parts.push(eq(equipment.labelOutdated, true));
  if (f.coverage === "under") parts.push(hasCurrentCoverage(today));
  if (f.coverage === "none") parts.push(sql`not ${hasCurrentCoverage(today)}`);
  if (f.coverage === "warranty" || f.coverage === "amc" || f.coverage === "cmc") parts.push(hasCurrentCoverageOfType(today, f.coverage));
  if (f.coverage === "ending") parts.push(coverageEndingBy(today, addDays(today, f.coverageWarnDays ?? 30)));
  if (f.providerId) parts.push(eq(equipment.serviceProviderId, f.providerId));
  return parts.length ? and(...parts) : undefined;
}

export async function listEquipment(filters: EquipmentFilters) {
  const db = getDb();
  const today = todayNepal();
  const coverageWarnDays = (await getSettings()).coverageWarnDays;
  const f = { ...filters, coverageWarnDays };
  const where = filterWhere(f, today);
  const limit = Math.min(f.limit ?? 100, 500);
  const [rows, total] = await Promise.all([
    equipmentRows(db)
      .where(where)
      .orderBy(asc(equipmentModels.typeName), asc(equipmentModels.manufacturer), asc(equipment.serialNumber))
      .limit(limit)
      .offset(f.offset ?? 0),
    db
      .select({ n: count() })
      .from(equipment)
      .innerJoin(equipmentModels, eq(equipmentModels.id, equipment.modelId))
      .where(where),
  ]);
  return { rows: withAway(rows), total: total[0]?.n ?? 0, today, coverageWarnDays };
}

async function assertSerialFree(conn: Conn, serial: string, exceptId?: string) {
  const r = await conn
    .select({ id: equipment.id })
    .from(equipment)
    .where(and(eq(equipment.serialKey, serialKey(serial)), exceptId ? ne(equipment.id, exceptId) : undefined));
  if (r[0]) throw conflict(t.equipment.serialDuplicate, { serialNumber: t.equipment.serialDuplicate }, { equipmentId: r[0].id });
}

async function assertTagFree(conn: Conn, tag: string | null, exceptId?: string) {
  if (!tag) return;
  const r = await conn
    .select({ id: equipment.id })
    .from(equipment)
    .where(and(eq(equipment.hospitalTagKey, tagKey(tag)), exceptId ? ne(equipment.id, exceptId) : undefined));
  if (r[0]) throw conflict(t.equipment.tagDuplicate, { hospitalTag: t.equipment.tagDuplicate }, { equipmentId: r[0].id });
}

async function assertRefs(conn: Conn, refs: { modelId?: string; providerId?: string; departmentId?: string }) {
  if (refs.modelId) {
    const r = await conn.select({ id: equipmentModels.id }).from(equipmentModels).where(eq(equipmentModels.id, refs.modelId));
    if (!r[0]) throw badRequest(t.fields.choose, { modelId: t.fields.choose });
  }
  if (refs.providerId) {
    const r = await conn.select({ id: serviceProviders.id }).from(serviceProviders).where(eq(serviceProviders.id, refs.providerId));
    if (!r[0]) throw badRequest(t.fields.choose, { serviceProviderId: t.fields.choose });
  }
  if (refs.departmentId) {
    const r = await conn
      .select({ id: departments.id })
      .from(departments)
      .where(and(eq(departments.id, refs.departmentId), eq(departments.isActive, true)));
    if (!r[0]) throw badRequest(t.fields.choose, { homeDepartmentId: t.fields.choose });
  }
}

/** Designated service engineers must be active engineers of the equipment's service provider. */
async function validEngineerIds(conn: Conn, providerId: string, ids: string[]): Promise<string[]> {
  if (!ids.length) return [];
  const r = await conn
    .select({ id: serviceEngineers.id })
    .from(serviceEngineers)
    .where(and(inArray(serviceEngineers.id, ids), eq(serviceEngineers.providerId, providerId), eq(serviceEngineers.isActive, true)));
  return r.map((x) => x.id);
}

/** Inserts one equipment inside a transaction. Shared by the form and the CSV import. */
export async function insertEquipment(tx: Conn, actor: Actor, input: EquipmentInput): Promise<string> {
  const id = newId();
  const now = Date.now();
  await tx.insert(equipment).values({
    id,
    qrCode: newQrCode(),
    modelId: input.modelId,
    serialNumber: input.serialNumber,
    serialKey: serialKey(input.serialNumber),
    hospitalTag: input.hospitalTag,
    hospitalTagKey: input.hospitalTag ? tagKey(input.hospitalTag) : null,
    serviceProviderId: input.serviceProviderId,
    homeDepartmentId: input.homeDepartmentId,
    currentDepartmentId: input.homeDepartmentId,
    installedOn: input.installedOn,
    notes: input.notes,
    createdBy: actor.id,
    createdAt: now,
    updatedAt: now,
  });
  const engineerIds = await validEngineerIds(tx, input.serviceProviderId, input.serviceEngineerIds);
  for (const seId of engineerIds) {
    await tx.insert(equipmentServiceEngineers).values({ equipmentId: id, serviceEngineerId: seId, addedBy: actor.id });
  }
  if (input.lastPmsDoneOn) {
    await tx.insert(pmsVisits).values({
      id: newId(),
      equipmentId: id,
      coverageId: null,
      number: null,
      dueOn: input.lastPmsDoneOn,
      status: "done",
      doneOn: input.lastPmsDoneOn,
      markedBy: actor.id,
      fromEarlierRecords: true,
    });
  }
  return id;
}

/** New equipment, with its warranty when given (same transaction). */
export async function createEquipment(actor: Actor, input: EquipmentInput & { warranty?: EquipmentCreate["warranty"] }) {
  const db = getDb();
  await assertSerialFree(db, input.serialNumber);
  await assertTagFree(db, input.hospitalTag);
  await assertRefs(db, { modelId: input.modelId, providerId: input.serviceProviderId, departmentId: input.homeDepartmentId });
  const id = await db.transaction(async (tx) => {
    const newEqId = await insertEquipment(tx, actor, input);
    await logActivity(tx, {
      userId: actor.id,
      action: "equipment.added",
      subjectType: "equipment",
      subjectId: newEqId,
      summary: `Added equipment S.N. ${input.serialNumber}`,
    });
    if (input.warranty) {
      await insertCoverage(tx, actor, newEqId, {
        type: "warranty",
        serviceProviderId: input.serviceProviderId,
        ...input.warranty,
        contractNo: null,
        notes: null,
      });
    }
    return newEqId;
  });
  return { id };
}

/** Recomputes status from unresolved breakdowns; never overrides Out of service. */
export async function refreshStatus(tx: Conn, equipmentId: string): Promise<EquipmentStatus> {
  const eqRow = await tx.select({ status: equipment.status }).from(equipment).where(eq(equipment.id, equipmentId));
  if (!eqRow[0]) throw notFound();
  if (eqRow[0].status === "out_of_service") return "out_of_service";
  const open = await tx
    .select({ n: count() })
    .from(breakdowns)
    .where(and(eq(breakdowns.equipmentId, equipmentId), inArray(breakdowns.status, ["open", "with_provider"])));
  const next: EquipmentStatus = (open[0]?.n ?? 0) > 0 ? "breakdown" : "working";
  if (next !== eqRow[0].status) {
    await tx.update(equipment).set({ status: next, updatedAt: Date.now() }).where(eq(equipment.id, equipmentId));
  }
  return next;
}

export async function updateEquipment(actor: Actor, id: string, input: EquipmentUpdate) {
  const db = getDb();
  const found = await db.select().from(equipment).where(eq(equipment.id, id));
  const current = found[0];
  if (!current) throw notFound();

  const { outOfService, ...fields } = input;
  const editsFields = Object.values(fields).some((v) => v !== undefined);
  if (editsFields && !can(actor.role, "equipment.edit")) throw forbidden();
  if (outOfService !== undefined && !can(actor.role, "equipment.outOfService")) throw forbidden();

  if (fields.serialNumber) await assertSerialFree(db, fields.serialNumber, id);
  if (fields.hospitalTag !== undefined) await assertTagFree(db, fields.hospitalTag, id);
  await assertRefs(db, {
    ...(fields.modelId ? { modelId: fields.modelId } : {}),
    ...(fields.serviceProviderId ? { providerId: fields.serviceProviderId } : {}),
    ...(fields.homeDepartmentId && fields.homeDepartmentId !== current.homeDepartmentId
      ? { departmentId: fields.homeDepartmentId }
      : {}),
  });

  await db.transaction(async (tx) => {
    const patch: Partial<typeof equipment.$inferInsert> = { updatedAt: Date.now() };
    if (fields.modelId) patch.modelId = fields.modelId;
    if (fields.serialNumber) {
      patch.serialNumber = fields.serialNumber;
      patch.serialKey = serialKey(fields.serialNumber);
    }
    if (fields.hospitalTag !== undefined) {
      patch.hospitalTag = fields.hospitalTag;
      patch.hospitalTagKey = fields.hospitalTag ? tagKey(fields.hospitalTag) : null;
    }
    if (fields.serviceProviderId) patch.serviceProviderId = fields.serviceProviderId;
    if (fields.installedOn) patch.installedOn = fields.installedOn;
    if (fields.notes !== undefined) patch.notes = fields.notes;
    // Correcting the home department while the equipment is at home keeps it there.
    if (fields.homeDepartmentId && fields.homeDepartmentId !== current.homeDepartmentId) {
      patch.homeDepartmentId = fields.homeDepartmentId;
      if (current.currentDepartmentId === current.homeDepartmentId) patch.currentDepartmentId = fields.homeDepartmentId;
      patch.labelOutdated = true;
    }
    if (fields.modelId && fields.modelId !== current.modelId) patch.labelOutdated = true;
    if (fields.serialNumber && serialKey(fields.serialNumber) !== current.serialKey) patch.labelOutdated = true;
    await tx.update(equipment).set(patch).where(eq(equipment.id, id));

    if (fields.serviceProviderId && fields.serviceProviderId !== current.serviceProviderId) {
      // Designated service engineers belong to the old provider; drop them.
      await tx.delete(equipmentServiceEngineers).where(eq(equipmentServiceEngineers.equipmentId, id));
    }

    if (outOfService === true && current.status !== "out_of_service") {
      await tx.update(equipment).set({ status: "out_of_service" }).where(eq(equipment.id, id));
      await logActivity(tx, { userId: actor.id, action: "equipment.outOfService", subjectType: "equipment", subjectId: id, summary: t.history.outOfService });
    }
    if (outOfService === false && current.status === "out_of_service") {
      await tx.update(equipment).set({ status: "working" }).where(eq(equipment.id, id));
      await refreshStatus(tx, id);
      await logActivity(tx, { userId: actor.id, action: "equipment.backInService", subjectType: "equipment", subjectId: id, summary: t.history.backInService });
    }
    if (editsFields) {
      await logActivity(tx, { userId: actor.id, action: "equipment.updated", subjectType: "equipment", subjectId: id, summary: "Equipment details changed" });
    }
  });
  return { id };
}

export async function setDesignatedEngineers(actor: Actor, id: string, ids: string[]) {
  const db = getDb();
  const found = await db.select().from(equipment).where(eq(equipment.id, id));
  if (!found[0]) throw notFound();
  const valid = await validEngineerIds(db, found[0].serviceProviderId, [...new Set(ids)]);
  await db.transaction(async (tx) => {
    await tx.delete(equipmentServiceEngineers).where(eq(equipmentServiceEngineers.equipmentId, id));
    for (const seId of valid) {
      await tx.insert(equipmentServiceEngineers).values({ equipmentId: id, serviceEngineerId: seId, addedBy: actor.id });
    }
    await logActivity(tx, {
      userId: actor.id,
      action: "equipment.designated",
      subjectType: "equipment",
      subjectId: id,
      summary: "Designated service engineers changed",
    });
  });
  return { id };
}

export async function equipmentIdByQr(code: string) {
  const r = await getDb().select({ id: equipment.id }).from(equipment).where(eq(equipment.qrCode, code));
  if (!r[0]) throw notFound(t.scan.notFound);
  return r[0];
}

export async function markLabelsPrinted(actor: Actor, ids: string[]) {
  const db = getDb();
  const unique = [...new Set(ids)];
  await db.transaction(async (tx) => {
    await tx.update(equipment).set({ labelOutdated: false }).where(inArray(equipment.id, unique));
    for (const id of unique) {
      await logActivity(tx, { userId: actor.id, action: "label.printed", subjectType: "equipment", subjectId: id, summary: t.history.labelPrinted });
    }
  });
  return { count: unique.length };
}

/** Rows for the label sheet. */
export async function labelRows(ids: string[]) {
  if (!ids.length) return [];
  const rows = await equipmentRows(getDb()).where(inArray(equipment.id, ids));
  const order = new Map(ids.map((id, i) => [id, i]));
  return withAway(rows).sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

/** Current coverage, last PMS and next PMS for one equipment. Queried, never stored. */
export async function coverageAndPms(conn: Conn, equipmentId: string, today = todayNepal()) {
  const covers = await conn
    .select({
      id: coverage.id,
      type: coverage.type,
      serviceProviderId: coverage.serviceProviderId,
      providerName: serviceProviders.name,
      startsOn: coverage.startsOn,
      endsOn: coverage.endsOn,
      endedEarlyOn: coverage.endedEarlyOn,
      pmsEvery: coverage.pmsEvery,
      pmsUnit: coverage.pmsUnit,
      contractNo: coverage.contractNo,
      notes: coverage.notes,
      createdAt: coverage.createdAt,
    })
    .from(coverage)
    .innerJoin(serviceProviders, eq(serviceProviders.id, coverage.serviceProviderId))
    .where(eq(coverage.equipmentId, equipmentId))
    .orderBy(desc(coverage.startsOn));
  const current = covers.find((c) => isCoverageCurrent(c, today)) ?? null;
  const visits = await conn
    .select()
    .from(pmsVisits)
    .where(eq(pmsVisits.equipmentId, equipmentId))
    .orderBy(asc(pmsVisits.dueOn));
  const done = visits.filter((v) => v.status === "done").sort((a, b) => (b.doneOn ?? "").localeCompare(a.doneOn ?? ""));
  const totals = new Map<string, number>();
  for (const v of visits) if (v.coverageId) totals.set(v.coverageId, (totals.get(v.coverageId) ?? 0) + 1);
  const next =
    current
      ? (visits.find(
          (v) =>
            v.status === "scheduled" &&
            v.coverageId === current.id &&
            v.dueOn <= coverageLastDay(current.endsOn, current.endedEarlyOn),
        ) ?? null)
      : null;
  return {
    coverages: covers.map((c) => ({ ...c, lastDay: coverageLastDay(c.endsOn, c.endedEarlyOn), isCurrent: c.id === current?.id })),
    current,
    lastPms: done[0] ?? null,
    nextPms: next ? { ...next, total: next.coverageId ? (totals.get(next.coverageId) ?? 0) : 0 } : null,
    visits: visits.map((v) => ({ ...v, total: v.coverageId ? (totals.get(v.coverageId) ?? 0) : 0 })),
  };
}

export async function getEquipment(id: string) {
  const db = getDb();
  const rows = await equipmentRows(db).where(eq(equipment.id, id));
  if (!rows[0]) throw notFound();
  const row = withAway(rows)[0]!;
  const base = (await db.select().from(equipment).where(eq(equipment.id, id)))[0]!;

  const [designated, providerEngineers, contacts, manuals, documents, openBreakdowns, activeMove, cov] = await Promise.all([
    db
      .select({ id: serviceEngineers.id, name: serviceEngineers.name, phone: serviceEngineers.phone, email: serviceEngineers.email, isActive: serviceEngineers.isActive })
      .from(equipmentServiceEngineers)
      .innerJoin(serviceEngineers, eq(serviceEngineers.id, equipmentServiceEngineers.serviceEngineerId))
      .where(eq(equipmentServiceEngineers.equipmentId, id))
      .orderBy(asc(serviceEngineers.name)),
    db
      .select({ id: serviceEngineers.id, name: serviceEngineers.name, phone: serviceEngineers.phone, email: serviceEngineers.email })
      .from(serviceEngineers)
      .where(and(eq(serviceEngineers.providerId, base.serviceProviderId), eq(serviceEngineers.isActive, true)))
      .orderBy(asc(serviceEngineers.name)),
    db
      .select({ id: providerContacts.id, kind: providerContacts.kind, value: providerContacts.value, label: providerContacts.label })
      .from(providerContacts)
      .where(and(eq(providerContacts.providerId, base.serviceProviderId), eq(providerContacts.isActive, true))),
    fileList(db, "model", base.modelId, manualKinds),
    fileList(db, "equipment", id),
    db
      .select({ id: breakdowns.id, number: breakdowns.number, status: breakdowns.status, problem: breakdowns.problem, reportedAt: breakdowns.reportedAt })
      .from(breakdowns)
      .where(and(eq(breakdowns.equipmentId, id), inArray(breakdowns.status, ["open", "with_provider"])))
      .orderBy(desc(breakdowns.reportedAt)),
    latestOpenTemporaryMove(db, id),
    coverageAndPms(db, id),
  ]);

  return {
    equipment: { ...row, notes: base.notes, photoFileId: base.photoFileId, createdAt: base.createdAt },
    designated,
    providerEngineers,
    providerContacts: contacts,
    manuals,
    documents,
    openBreakdowns,
    activeMove,
    coverage: {
      current: cov.current ? { ...cov.current, lastDay: coverageLastDay(cov.current.endsOn, cov.current.endedEarlyOn) } : null,
      all: cov.coverages,
    },
    lastPms: cov.lastPms,
    nextPms: cov.nextPms,
    pmsVisits: cov.visits,
  };
}

export async function latestOpenTemporaryMove(conn: Conn, equipmentId: string) {
  const r = await conn
    .select({
      id: moves.id,
      type: moves.type,
      reason: moves.reason,
      movedAt: moves.movedAt,
      expectedReturnOn: moves.expectedReturnOn,
      returnedAt: moves.returnedAt,
      movedByName: user.name,
    })
    .from(moves)
    .innerJoin(user, eq(user.id, moves.movedBy))
    .where(eq(moves.equipmentId, equipmentId))
    .orderBy(desc(moves.movedAt))
    .limit(1);
  const m = r[0];
  return m && m.type === "temporary" && m.returnedAt === null ? m : null;
}

export async function fileList(
  conn: Conn,
  ownerType: "model" | "equipment" | "coverage" | "pms_visit" | "breakdown",
  ownerId: string,
  kinds?: readonly FileKind[],
) {
  return conn
    .select({
      id: files.id,
      kind: files.kind,
      title: files.title,
      note: files.note,
      fileName: files.fileName,
      mimeType: files.mimeType,
      sizeBytes: files.sizeBytes,
      createdAt: files.createdAt,
      uploadedByName: user.name,
    })
    .from(files)
    .innerJoin(user, eq(user.id, files.uploadedBy))
    .where(
      and(
        eq(files.ownerType, ownerType),
        eq(files.ownerId, ownerId),
        kinds ? inArray(files.kind, [...kinds]) : undefined,
        eq(files.status, "ready"),
        isNull(files.removedAt),
      ),
    )
    .orderBy(asc(files.kind), desc(files.createdAt));
}

