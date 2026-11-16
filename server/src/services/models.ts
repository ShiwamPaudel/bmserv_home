import { and, asc, eq, ne, sql, type SQL } from "drizzle-orm";
import { manualKinds } from "@bmserv/shared/enums";
import { modelKey } from "@bmserv/shared/keys";
import type { ModelInput } from "@bmserv/shared/schemas/equipment";
import { t } from "@bmserv/shared/terms";
import { getDb } from "../db/client";
import { equipment, equipmentModels } from "../db/schema";
import { conflict, notFound } from "../lib/errors";
import { newId } from "../lib/ids";
import type { Actor } from "../lib/http";
import { logActivity } from "./activity";
import { ref } from "../lib/sqlRef";
import { fileList } from "./equipment";
import { equipmentRows, withAway } from "./equipmentRows";

const modelColumns = {
  id: equipmentModels.id,
  typeName: equipmentModels.typeName,
  manufacturer: equipmentModels.manufacturer,
  model: equipmentModels.model,
  category: equipmentModels.category,
  pmsEvery: equipmentModels.pmsEvery,
  pmsUnit: equipmentModels.pmsUnit,
  photoFileId: equipmentModels.photoFileId,
  manualCount: sql<number>`(select count(*) from files f where f.owner_type = 'model' and f.owner_id = ${ref(equipmentModels.id)}
    and f.kind in ('service_manual', 'operation_manual', 'other_manual') and f.status = 'ready' and f.removed_at is null)`,
  equipmentCount: sql<number>`(select count(*) from equipment e where e.model_id = ${ref(equipmentModels.id)})`,
};

function listModelsWhere(where: SQL | undefined, limit = 1000) {
  return getDb().select(modelColumns).from(equipmentModels).where(where).orderBy(asc(equipmentModels.manufacturer), asc(equipmentModels.model)).limit(limit);
}

export async function listModels(q?: string) {
  const like = q ? `%${q.toLowerCase()}%` : null;
  return listModelsWhere(
    like
      ? sql`(lower(${equipmentModels.typeName}) like ${like} or lower(${equipmentModels.manufacturer}) like ${like}
            or lower(${equipmentModels.model}) like ${like}
            or (lower(${equipmentModels.manufacturer}) || ' ' || lower(${equipmentModels.model})) like ${like})`
      : undefined,
    like ? 50 : 1000,
  );
}

export async function getModel(id: string) {
  const db = getDb();
  const rows = await listModelsWhere(eq(equipmentModels.id, id));
  const model = rows[0];
  if (!model) throw notFound();
  const [manuals, units] = await Promise.all([
    fileList(db, "model", id, manualKinds),
    equipmentRows(db).where(eq(equipment.modelId, id)).orderBy(asc(equipment.serialNumber)),
  ]);
  return { model, manuals, equipment: withAway(units) };
}

export async function findModelByKey(key: string) {
  const r = await getDb().select().from(equipmentModels).where(eq(equipmentModels.modelKey, key));
  return r[0] ?? null;
}

export async function createModel(actor: Actor, input: ModelInput) {
  const key = modelKey(input.manufacturer, input.model);
  const existing = await findModelByKey(key);
  if (existing) throw conflict(t.models.exists, { model: t.models.exists }, { modelId: existing.id });
  const id = newId();
  const db = getDb();
  await db.insert(equipmentModels).values({ id, ...input, modelKey: key });
  await logActivity(db, {
    userId: actor.id,
    action: "model.added",
    subjectType: "model",
    subjectId: id,
    summary: `Added model ${input.manufacturer} ${input.model}`,
  });
  const row = await db.select().from(equipmentModels).where(eq(equipmentModels.id, id));
  return row[0];
}

export async function updateModel(actor: Actor, id: string, input: Partial<ModelInput>) {
  const db = getDb();
  const found = await db.select().from(equipmentModels).where(eq(equipmentModels.id, id));
  const current = found[0];
  if (!current) throw notFound();
  const next = { ...current, ...input };
  const key = modelKey(next.manufacturer, next.model);
  const clash = await db
    .select({ id: equipmentModels.id })
    .from(equipmentModels)
    .where(and(eq(equipmentModels.modelKey, key), ne(equipmentModels.id, id)));
  if (clash[0]) throw conflict(t.models.exists, { model: t.models.exists });
  await db
    .update(equipmentModels)
    .set({
      typeName: next.typeName,
      manufacturer: next.manufacturer,
      model: next.model,
      category: next.category,
      pmsEvery: next.pmsEvery,
      pmsUnit: next.pmsUnit,
      modelKey: key,
    })
    .where(eq(equipmentModels.id, id));
  await logActivity(db, {
    userId: actor.id,
    action: "model.updated",
    subjectType: "model",
    subjectId: id,
    summary: `Changed model ${next.manufacturer} ${next.model}`,
  });
  return { id };
}
