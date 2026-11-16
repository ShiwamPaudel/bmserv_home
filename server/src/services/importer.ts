// CSV import of equipment (PRD F14): row-by-row preview, nothing saved until confirmed.
import { importColumns, parseCsv } from "@bmserv/shared/csv";
import { isAdDate } from "@bmserv/shared/dates";
import { modelKey, serialKey, tagKey } from "@bmserv/shared/keys";
import { t } from "@bmserv/shared/terms";
import { getDb } from "../db/client";
import { departments, equipment, equipmentModels, serviceProviders } from "../db/schema";
import { badRequest } from "../lib/errors";
import { newId } from "../lib/ids";
import type { Actor } from "../lib/http";
import { logActivity } from "./activity";
import { insertEquipment } from "./equipment";

type Row = {
  row: number;
  typeName: string;
  manufacturer: string;
  model: string;
  serialNumber: string;
  hospitalTag: string | null;
  provider: string;
  department: string;
  installedOn: string;
  lastPmsDoneOn: string | null;
  notes: string | null;
  problems: string[];
  newModel: boolean;
  providerId: string | null;
  departmentId: string | null;
  modelId: string | null;
};

const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

async function analyse(csv: string): Promise<Row[]> {
  const table = parseCsv(csv);
  if (table.length < 2) throw badRequest(t.importer.empty);
  const header = (table[0] ?? []).map((h) => norm(h));
  const expected = importColumns.map((c) => norm(c));
  if (expected.some((c, i) => header[i] !== c)) throw badRequest(t.importer.badHeader(importColumns.join(", ")));
  if (table.length > 2001) throw badRequest("Import at most 2000 equipment at a time.");

  const db = getDb();
  const [depts, providers, models, existing] = await Promise.all([
    db.select({ id: departments.id, name: departments.name, isActive: departments.isActive }).from(departments),
    db.select({ id: serviceProviders.id, name: serviceProviders.name }).from(serviceProviders),
    db.select({ id: equipmentModels.id, modelKey: equipmentModels.modelKey }).from(equipmentModels),
    db.select({ serialKey: equipment.serialKey, tagKey: equipment.hospitalTagKey }).from(equipment),
  ]);
  const deptBy = new Map(depts.filter((d) => d.isActive).map((d) => [norm(d.name), d.id]));
  const provBy = new Map(providers.map((p) => [norm(p.name), p.id]));
  const modelBy = new Map(models.map((m) => [m.modelKey, m.id]));
  const serials = new Set(existing.map((e) => e.serialKey));
  const tags = new Set(existing.map((e) => e.tagKey).filter(Boolean));
  const seenSerials = new Set<string>();
  const seenTags = new Set<string>();

  return table.slice(1).map((cells, i) => {
    const c = (n: number) => (cells[n] ?? "").trim();
    const r: Row = {
      row: i + 2,
      typeName: c(0),
      manufacturer: c(1),
      model: c(2),
      serialNumber: c(3),
      hospitalTag: c(4) || null,
      provider: c(5),
      department: c(6),
      installedOn: c(7),
      lastPmsDoneOn: c(8) || null,
      notes: c(9) || null,
      problems: [],
      newModel: false,
      providerId: null,
      departmentId: null,
      modelId: null,
    };
    for (const [n, label] of [[0, importColumns[0]], [1, importColumns[1]], [2, importColumns[2]], [3, importColumns[3]], [5, importColumns[5]], [6, importColumns[6]], [7, importColumns[7]]] as const) {
      if (!c(n)) r.problems.push(t.importer.missing(label));
    }
    if (r.installedOn && !isAdDate(r.installedOn)) r.problems.push(t.importer.badDate(importColumns[7]));
    if (r.lastPmsDoneOn && !isAdDate(r.lastPmsDoneOn)) r.problems.push(t.importer.badDate(importColumns[8]));
    if (r.serialNumber) {
      const key = serialKey(r.serialNumber);
      if (serials.has(key)) r.problems.push(t.equipment.serialDuplicate);
      else if (seenSerials.has(key)) r.problems.push(t.importer.duplicateInFile);
      seenSerials.add(key);
    }
    if (r.hospitalTag) {
      const key = tagKey(r.hospitalTag);
      if (tags.has(key) || seenTags.has(key)) r.problems.push(t.equipment.tagDuplicate);
      seenTags.add(key);
    }
    if (r.provider) {
      r.providerId = provBy.get(norm(r.provider)) ?? null;
      if (!r.providerId) r.problems.push(t.importer.unknownProvider(r.provider));
    }
    if (r.department) {
      r.departmentId = deptBy.get(norm(r.department)) ?? null;
      if (!r.departmentId) r.problems.push(t.importer.unknownDepartment(r.department));
    }
    if (r.manufacturer && r.model) {
      r.modelId = modelBy.get(modelKey(r.manufacturer, r.model)) ?? null;
      r.newModel = !r.modelId;
    }
    return r;
  });
}

export async function previewImport(csv: string) {
  const rows = await analyse(csv);
  return {
    rows: rows.map(({ providerId: _p, departmentId: _d, modelId: _m, ...r }) => r),
    ok: rows.filter((r) => !r.problems.length).length,
    bad: rows.filter((r) => r.problems.length).length,
  };
}

export async function commitImport(actor: Actor, csv: string) {
  const rows = await analyse(csv);
  if (rows.some((r) => r.problems.length)) throw badRequest(t.importer.fixFirst);
  const db = getDb();
  await db.transaction(async (tx) => {
    const created = new Map<string, string>();
    for (const r of rows) {
      let modelId = r.modelId;
      const key = modelKey(r.manufacturer, r.model);
      if (!modelId) modelId = created.get(key) ?? null;
      if (!modelId) {
        modelId = newId();
        await tx.insert(equipmentModels).values({ id: modelId, typeName: r.typeName, manufacturer: r.manufacturer, model: r.model, category: null, modelKey: key });
        created.set(key, modelId);
      }
      await insertEquipment(tx, actor, {
        modelId,
        serialNumber: r.serialNumber,
        hospitalTag: r.hospitalTag,
        serviceProviderId: r.providerId as string,
        homeDepartmentId: r.departmentId as string,
        installedOn: r.installedOn,
        notes: r.notes,
        serviceEngineerIds: [],
        lastPmsDoneOn: r.lastPmsDoneOn,
      });
    }
    await logActivity(tx, { userId: actor.id, action: "equipment.imported", subjectType: "equipment", subjectId: "import", summary: `Imported ${rows.length} equipment` });
  });
  return { count: rows.length };
}

