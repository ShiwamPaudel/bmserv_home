import { and, asc, eq, inArray, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { HOSPITAL_OWNER_ID, isManualKind, manualKinds, maxBytesFor, type FileKind, type FileOwnerType } from "@bmserv/shared/enums";
import { can } from "@bmserv/shared/permissions";
import type { UploadRequest } from "@bmserv/shared/schemas/files";
import { t } from "@bmserv/shared/terms";
import { getDb } from "../db/client";
import { breakdowns, coverage, equipment, equipmentModels, files, pmsVisits, settings, user } from "../db/schema";
import { badRequest, forbidden, notFound } from "../lib/errors";
import { newId } from "../lib/ids";
import type { Actor } from "../lib/http";
import { deleteObject, headObject, presignGet, presignPut } from "../lib/r2";
import { ref } from "../lib/sqlRef";

/** Which kinds may be attached to which owner. */
const kindsFor: Record<FileOwnerType, readonly FileKind[]> = {
  model: [...manualKinds, "photo"],
  equipment: ["installation_report", "service_report", "contract", "photo", "other"],
  coverage: ["contract"],
  pms_visit: ["service_report"],
  breakdown: ["service_report", "photo", "other"],
  hospital: ["photo"],
};

const prefix: Record<FileOwnerType, string> = {
  model: "models",
  equipment: "equipment",
  coverage: "coverage",
  pms_visit: "pms",
  breakdown: "breakdowns",
  hospital: "hospital",
};

export function safeFileName(name: string): string {
  const cleaned = name
    .normalize("NFKD")
    .replace(/[^\w.\- ]+/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(-120);
  return cleaned || "file";
}

function humanLimit(kind: FileKind): string {
  return isManualKind(kind) ? "200 MB" : "20 MB";
}

async function ownerExists(type: FileOwnerType, id: string): Promise<boolean> {
  if (type === "hospital") return id === HOSPITAL_OWNER_ID;
  const db = getDb();
  const table = { model: equipmentModels, equipment, coverage, pms_visit: pmsVisits, breakdown: breakdowns }[type];
  const r = await db.select({ id: table.id }).from(table).where(eq(table.id, id));
  return !!r[0];
}

/** Checks type and size, then returns a presigned PUT link straight to R2 (15 minutes). */
export async function requestUpload(actor: Actor, input: UploadRequest) {
  if (!kindsFor[input.ownerType].includes(input.kind)) throw badRequest(t.fields.choose, { kind: t.fields.choose });
  // A model's photo is part of the model: only those who edit models may set it. Photos are images, never PDF.
  if (input.ownerType === "model" && input.kind === "photo" && !can(actor.role, "model.edit")) throw forbidden();
  // The hospital logo is a setting: Admin only.
  if (input.ownerType === "hospital" && !can(actor.role, "settings.edit")) throw forbidden();
  if (input.kind === "photo" && !input.mimeType.startsWith("image/")) throw badRequest(t.files.photoOnly, { file: t.files.photoOnly });
  if (input.sizeBytes > maxBytesFor(input.kind)) {
    throw badRequest(t.files.tooBig(humanLimit(input.kind)), { file: t.files.tooBig(humanLimit(input.kind)) });
  }
  if (!(await ownerExists(input.ownerType, input.ownerId))) throw notFound();
  const id = newId();
  const storageKey = `${prefix[input.ownerType]}/${input.ownerId}/${id}-${safeFileName(input.fileName)}`;
  await getDb().insert(files).values({
    id,
    ownerType: input.ownerType,
    ownerId: input.ownerId,
    kind: input.kind,
    title: input.title,
    note: input.note,
    storageKey,
    fileName: input.fileName,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    status: "pending",
    uploadedBy: actor.id,
  });
  const uploadUrl = await presignPut(storageKey, input.mimeType);
  return { fileId: id, uploadUrl };
}

/** After the browser PUT: confirm the object exists in R2 and mark ready. */
export async function markReady(actor: Actor, id: string) {
  const db = getDb();
  const found = await db.select().from(files).where(eq(files.id, id));
  const f = found[0];
  if (!f || f.removedAt) throw notFound();
  if (f.uploadedBy !== actor.id) throw notFound();
  if (f.status === "ready") return { id };
  const size = await headObject(f.storageKey);
  if (size === null) throw badRequest(t.files.failed);
  if (size > maxBytesFor(f.kind)) {
    await deleteObject(f.storageKey);
    throw badRequest(t.files.tooBig(humanLimit(f.kind)));
  }
  let replaced: { id: string; storageKey: string } | null = null;
  await db.transaction(async (tx) => {
    await tx.update(files).set({ status: "ready", sizeBytes: size }).where(eq(files.id, id));
    if (f.ownerType === "equipment" && f.kind === "photo") {
      await tx.update(equipment).set({ photoFileId: id }).where(eq(equipment.id, f.ownerId));
    }
    if (f.ownerType === "model" && f.kind === "photo") {
      const m = (await tx.select({ photoFileId: equipmentModels.photoFileId }).from(equipmentModels).where(eq(equipmentModels.id, f.ownerId)))[0];
      if (m?.photoFileId && m.photoFileId !== id) {
        const old = (await tx.select({ id: files.id, storageKey: files.storageKey }).from(files).where(eq(files.id, m.photoFileId)))[0];
        if (old) {
          // The row stays (who uploaded what, when); the object leaves R2 now (owner, 2026-11-16).
          const now = Date.now();
          await tx.update(files).set({ removedAt: now, removedBy: actor.id, purgedAt: now }).where(eq(files.id, old.id));
          replaced = old;
        }
      }
      await tx.update(equipmentModels).set({ photoFileId: id }).where(eq(equipmentModels.id, f.ownerId));
    }
    if (f.ownerType === "hospital") {
      // A new logo replaces the old one, which leaves R2 at once (like a model photo).
      const s = (await tx.select({ logoFileId: settings.logoFileId }).from(settings).where(eq(settings.id, 1)))[0];
      if (s?.logoFileId && s.logoFileId !== id) {
        const old = (await tx.select({ id: files.id, storageKey: files.storageKey }).from(files).where(eq(files.id, s.logoFileId)))[0];
        if (old) {
          const now = Date.now();
          await tx.update(files).set({ removedAt: now, removedBy: actor.id, purgedAt: now }).where(eq(files.id, old.id));
          replaced = old;
        }
      }
      await tx.update(settings).set({ logoFileId: id }).where(eq(settings.id, 1));
    }
  });
  const gone = replaced as { id: string; storageKey: string } | null;
  if (gone) await deleteObject(gone.storageKey).catch((err: unknown) => console.error("Replaced photo not deleted from R2:", err instanceof Error ? err.message : err));
  return { id };
}

/** A photo for an <img>: a short redirect to a presigned R2 link, cached by the browser for most of its life. */
export async function photoLink(id: string): Promise<string> {
  const found = await getDb().select().from(files).where(eq(files.id, id));
  const f = found[0];
  if (!f || f.removedAt || f.status !== "ready" || f.kind !== "photo") throw notFound();
  return presignGet(f.storageKey, f.fileName, f.mimeType, false, 60 * 60);
}

export async function fileLink(id: string, download: boolean) {
  const found = await getDb().select().from(files).where(eq(files.id, id));
  const f = found[0];
  if (!f || f.removedAt || f.status !== "ready") throw notFound();
  return { url: await presignGet(f.storageKey, f.fileName, f.mimeType, download) };
}

/** Lead/Admin. The file stops showing; the object is deleted from R2 after 30 days. */
export async function removeFile(actor: Actor, id: string) {
  const db = getDb();
  const found = await db.select().from(files).where(eq(files.id, id));
  const f = found[0];
  if (!f || f.removedAt) throw notFound();
  await db.transaction(async (tx) => {
    await tx.update(files).set({ removedAt: Date.now(), removedBy: actor.id }).where(eq(files.id, id));
    if (f.ownerType === "equipment" && f.kind === "photo") {
      await tx.update(equipment).set({ photoFileId: null }).where(and(eq(equipment.id, f.ownerId), eq(equipment.photoFileId, id)));
    }
    if (f.ownerType === "model" && f.kind === "photo") {
      await tx.update(equipmentModels).set({ photoFileId: null }).where(and(eq(equipmentModels.id, f.ownerId), eq(equipmentModels.photoFileId, id)));
    }
    if (f.ownerType === "hospital") {
      if (!can(actor.role, "settings.edit")) throw forbidden();
      await tx.update(settings).set({ logoFileId: null }).where(and(eq(settings.id, 1), eq(settings.logoFileId, id)));
    }
  });
  return { id };
}

export async function searchManuals(q?: string) {
  const like = q ? `%${q.toLowerCase()}%` : null;
  return getDb()
    .select({
      id: files.id,
      kind: files.kind,
      title: files.title,
      note: files.note,
      sizeBytes: files.sizeBytes,
      mimeType: files.mimeType,
      createdAt: files.createdAt,
      modelId: equipmentModels.id,
      typeName: equipmentModels.typeName,
      manufacturer: equipmentModels.manufacturer,
      model: equipmentModels.model,
      uploadedByName: user.name,
      equipmentCount: sql<number>`(select count(*) from equipment e where e.model_id = ${ref(equipmentModels.id)})`,
    })
    .from(files)
    .innerJoin(equipmentModels, eq(equipmentModels.id, files.ownerId))
    .innerJoin(user, eq(user.id, files.uploadedBy))
    .where(
      and(
        eq(files.ownerType, "model"),
        inArray(files.kind, [...manualKinds]),
        eq(files.status, "ready"),
        isNull(files.removedAt),
        like
          ? sql`(lower(${equipmentModels.typeName}) like ${like} or lower(${equipmentModels.manufacturer}) like ${like}
              or lower(${equipmentModels.model}) like ${like} or lower(${files.title}) like ${like}
              or (lower(${equipmentModels.manufacturer}) || ' ' || lower(${equipmentModels.model})) like ${like})`
          : undefined,
      ),
    )
    .orderBy(asc(equipmentModels.manufacturer), asc(equipmentModels.model), asc(files.kind))
    .limit(200);
}

/** Daily: delete removed objects after 30 days and abandoned pending uploads after a day. */
export async function cleanupFiles(now = Date.now()) {
  const db = getDb();
  const removed = await db
    .select({ id: files.id, storageKey: files.storageKey })
    .from(files)
    .where(and(isNotNull(files.removedAt), lt(files.removedAt, now - 30 * 86_400_000), isNull(files.purgedAt)))
    .limit(200);
  for (const f of removed) {
    await deleteObject(f.storageKey).catch(() => undefined);
    await db.update(files).set({ purgedAt: now }).where(eq(files.id, f.id));
  }
  const pending = await db
    .select({ id: files.id, storageKey: files.storageKey })
    .from(files)
    .where(and(eq(files.status, "pending"), lt(files.createdAt, now - 86_400_000)))
    .limit(200);
  for (const f of pending) await deleteObject(f.storageKey).catch(() => undefined);
  if (pending.length) await db.delete(files).where(inArray(files.id, pending.map((p) => p.id)));
  return { purged: removed.length, abandoned: pending.length };
}
