// The equipment line used in every list (DESIGN.md: type, model, S.N., department, status).
import { sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import type { CoverageType, EquipmentStatus, PmsUnit } from "@bmserv/shared/enums";
import type { Conn } from "../db/client";
import { departments, equipment, equipmentModels, serviceProviders } from "../db/schema";
import { ref } from "../lib/sqlRef";

export const homeDept = alias(departments, "home_dept");

/** Today in Nepal, in SQL (UTC + 5:45), for the current-coverage columns below. */
const nepalToday = sql.raw("date('now', '+345 minutes')");
const currentCoverage = <T>(column: string) =>
  sql<T | null>`(select ${sql.raw(column)} from coverage c
    where c.equipment_id = ${ref(equipment.id)} and c.starts_on <= ${nepalToday}
      and ${nepalToday} <= min(c.ends_on, coalesce(c.ended_early_on, c.ends_on))
    order by c.starts_on desc limit 1)`;
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
  /** Current coverage today (warranty, AMC or CMC) and its last day; null when not covered. */
  coverageType: currentCoverage<CoverageType>("c.type"),
  coverageLastDay: currentCoverage<string>("min(c.ends_on, coalesce(c.ended_early_on, c.ends_on))"),
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
  coverageType: CoverageType | null;
  coverageLastDay: string | null;
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

/** SQL: current coverage of one type (warranty, AMC or CMC). */
export function hasCurrentCoverageOfType(today: string, type: CoverageType): SQL {
  return sql`exists (select 1 from coverage c where c.equipment_id = ${ref(equipment.id)} and c.type = ${type}
    and c.starts_on <= ${today}
    and ${today} <= min(c.ends_on, coalesce(c.ended_early_on, c.ends_on)))`;
}

/** SQL: current coverage whose last day is on or before `until`. */
export function coverageEndingBy(today: string, until: string): SQL {
  return sql`exists (select 1 from coverage c where c.equipment_id = ${ref(equipment.id)}
    and c.starts_on <= ${today}
    and ${today} <= min(c.ends_on, coalesce(c.ended_early_on, c.ends_on))
    and min(c.ends_on, coalesce(c.ended_early_on, c.ends_on)) <= ${until})`;
}

/** SQL: the equipment has coverage current on `today`. */
export function hasCurrentCoverage(today: string): SQL {
  return sql`exists (select 1 from coverage c where c.equipment_id = ${ref(equipment.id)}
    and c.starts_on <= ${today}
    and ${today} <= min(c.ends_on, coalesce(c.ended_early_on, c.ends_on)))`;
}

export function textSearch(q: string): SQL {
  const like = `%${q.toLowerCase().replace(/[%_]/g, (m) => `\\${m}`)}%`;
  const compact = `%${q
    .replace(/\s+/g, "")
    .toUpperCase()
    .replace(/[%_]/g, (m) => `\\${m}`)}%`;
  return sql`(lower(${equipmentModels.typeName}) like ${like} escape '\\'
    or lower(${equipmentModels.manufacturer}) like ${like} escape '\\'
    or lower(${equipmentModels.model}) like ${like} escape '\\'
    or (lower(${equipmentModels.manufacturer}) || ' ' || lower(${equipmentModels.model})) like ${like} escape '\\'
    or ${equipment.serialKey} like ${compact} escape '\\'
    or ${equipment.hospitalTagKey} like ${compact} escape '\\')`;
}
