// The equipment line used in every list (DESIGN.md: type, model, S.N., department, status).
import { sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import type { EquipmentStatus, PmsUnit } from "@bmserv/shared/enums";
import type { Conn } from "../db/client";
import { departments, equipment, equipmentModels, serviceProviders } from "../db/schema";
import { ref } from "../lib/sqlRef";

export const homeDept = alias(departments, "home_dept");
export const curDept = alias(departments, "cur_dept");

export const equipmentRowColumns = {
  id: equipment.id,
  qrCode: equipment.qrCode,
  typeName: equipmentModels.typeName,
  manufacturer: equipmentModels.manufacturer,
  model: equipmentModels.model,
  modelId: equipment.modelId,
  serialNumber: equipment.serialNumber,
  hospitalTag: equipment.hospitalTag,
  status: equipment.status,
  labelOutdated: equipment.labelOutdated,
  currentDepartmentId: equipment.currentDepartmentId,
  currentDepartmentName: curDept.name,
  homeDepartmentId: equipment.homeDepartmentId,
  homeDepartmentName: homeDept.name,
  providerId: equipment.serviceProviderId,
  providerName: serviceProviders.name,
  installedOn: equipment.installedOn,
  modelPmsEvery: equipmentModels.pmsEvery,
  modelPmsUnit: equipmentModels.pmsUnit,
  modelPhotoFileId: equipmentModels.photoFileId,
};

export type EquipmentRow = {
  id: string;
  qrCode: string;
  typeName: string;
  manufacturer: string;
  model: string;
  modelId: string;
  serialNumber: string;
  hospitalTag: string | null;
  status: EquipmentStatus;
  labelOutdated: boolean;
  currentDepartmentId: string;
  currentDepartmentName: string;
  homeDepartmentId: string;
  homeDepartmentName: string;
  providerId: string;
  providerName: string;
  installedOn: string;
  modelPmsEvery: number | null;
  modelPmsUnit: PmsUnit;
  modelPhotoFileId: string | null;
  away: boolean;
};

export function equipmentRows(conn: Conn) {
  return conn
    .select(equipmentRowColumns)
    .from(equipment)
    .innerJoin(equipmentModels, sql`${equipmentModels.id} = ${equipment.modelId}`)
    .innerJoin(curDept, sql`${curDept.id} = ${equipment.currentDepartmentId}`)
    .innerJoin(homeDept, sql`${homeDept.id} = ${equipment.homeDepartmentId}`)
    .innerJoin(serviceProviders, sql`${serviceProviders.id} = ${equipment.serviceProviderId}`);
}

export function withAway<T extends Omit<EquipmentRow, "away">>(rows: T[]): (T & { away: boolean })[] {
  return rows.map((r) => ({ ...r, away: r.currentDepartmentId !== r.homeDepartmentId }));
}

/** SQL: the equipment has coverage current on `today`. */
export function hasCurrentCoverage(today: string): SQL {
  return sql`exists (select 1 from coverage c where c.equipment_id = ${ref(equipment.id)}
    and c.starts_on <= ${today}
    and ${today} <= min(c.ends_on, coalesce(c.ended_early_on, c.ends_on)))`;
}

export function textSearch(q: string): SQL {
  const like = `%${q.toLowerCase().replace(/[%_]/g, (m) => `\\${m}`)}%`;
  const compact = `%${q.replace(/\s+/g, "").toUpperCase().replace(/[%_]/g, (m) => `\\${m}`)}%`;
  return sql`(lower(${equipmentModels.typeName}) like ${like} escape '\\'
    or lower(${equipmentModels.manufacturer}) like ${like} escape '\\'
    or lower(${equipmentModels.model}) like ${like} escape '\\'
    or (lower(${equipmentModels.manufacturer}) || ' ' || lower(${equipmentModels.model})) like ${like} escape '\\'
    or ${equipment.serialKey} like ${compact} escape '\\'
    or ${equipment.hospitalTagKey} like ${compact} escape '\\')`;
}
