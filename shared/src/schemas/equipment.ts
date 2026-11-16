import { z } from "zod";
import { moveTypes, pmsUnits } from "../enums";
import { t } from "../terms";
import { adDate, id, optionalAdDate, optionalText, text } from "./common";

export const modelSchema = z.object({
  typeName: text(80),
  manufacturer: text(80),
  model: text(80),
  category: optionalText(80),
  pmsEvery: z.coerce.number({ error: t.fields.number }).int(t.fields.number).min(1, t.models.pmsRange).max(999, t.models.pmsRange),
  pmsUnit: z.enum(pmsUnits).default("months"),
});
export type ModelInput = z.infer<typeof modelSchema>;

export const equipmentSchema = z.object({
  modelId: id(),
  serialNumber: text(80),
  hospitalTag: optionalText(40),
  serviceProviderId: id(),
  homeDepartmentId: id(),
  installedOn: adDate(),
  notes: optionalText(2000),
  serviceEngineerIds: z.array(id()).max(20).default([]),
  lastPmsDoneOn: optionalAdDate(),
});
export type EquipmentInput = z.infer<typeof equipmentSchema>;

/** The warranty added with new equipment (1 year from installation by default; the person may change or remove it). */
export const newWarrantySchema = z
  .object({
    startsOn: adDate(),
    endsOn: adDate(),
    pmsEvery: z.number().int(t.fields.number).min(1, t.models.pmsRange).max(999, t.models.pmsRange).nullable(),
    pmsUnit: z.enum(pmsUnits).default("months"),
  })
  .refine((w) => w.endsOn > w.startsOn, { path: ["endsOn"], message: t.coverage.endBeforeStart });

export const equipmentCreateSchema = equipmentSchema.extend({ warranty: newWarrantySchema.nullable().default(null) });
export type EquipmentCreate = z.infer<typeof equipmentCreateSchema>;

export const equipmentUpdateSchema = z.object({
  modelId: id().optional(),
  serialNumber: text(80).optional(),
  hospitalTag: optionalText(40),
  serviceProviderId: id().optional(),
  homeDepartmentId: id().optional(),
  installedOn: adDate().optional(),
  notes: optionalText(2000),
  outOfService: z.boolean().optional(),
});
export type EquipmentUpdate = z.infer<typeof equipmentUpdateSchema>;

export const designateSchema = z.object({ serviceEngineerIds: z.array(id()).max(20) });
export const labelsPrintedSchema = z.object({ ids: z.array(id()).min(1).max(500) });

export const moveSchema = z.object({
  toDepartmentId: id(),
  type: z.enum(moveTypes),
  reason: text(300),
  expectedReturnOn: optionalAdDate(),
});
export type MoveInput = z.infer<typeof moveSchema>;
