// Code names stored in the database. Never shown on screen: terms.ts turns them into words.

/** How dates are shown across BMServ (Settings). Stored dates are always AD. */
export const dateDisplays = ["bs", "ad"] as const;
export type DateDisplay = (typeof dateDisplays)[number];

/** `staff` are hospital staff (nurses, ward staff) who only report problems; the rest are the Biomedical team. */
export const roles = ["admin", "lead", "engineer", "staff"] as const;
export type Role = (typeof roles)[number];
export const teamRoles = ["admin", "lead", "engineer"] as const;
export function isTeamRole(role: Role | null | undefined): boolean {
  return !!role && (teamRoles as readonly string[]).includes(role);
}

export const equipmentStatuses = ["working", "breakdown", "out_of_service"] as const;
export type EquipmentStatus = (typeof equipmentStatuses)[number];

export const coverageTypes = ["warranty", "amc", "cmc"] as const;
export type CoverageType = (typeof coverageTypes)[number];

/** PMS frequency: every N days, months or years (set on the model, copied to coverage). */
export const pmsUnits = ["days", "months", "years"] as const;
export type PmsUnit = (typeof pmsUnits)[number];

export const pmsStatuses = ["scheduled", "done", "skipped"] as const;
export type PmsStatus = (typeof pmsStatuses)[number];

export const breakdownStatuses = ["open", "with_provider", "fixed", "not_repairable"] as const;
export type BreakdownStatus = (typeof breakdownStatuses)[number];

export const pauseReasons = ["spare_parts", "quotation", "engineer_working", "other"] as const;
export type PauseReason = (typeof pauseReasons)[number];

export const moveTypes = ["temporary", "permanent"] as const;
export type MoveType = (typeof moveTypes)[number];

export const fileOwnerTypes = ["model", "equipment", "coverage", "pms_visit", "breakdown"] as const;
export type FileOwnerType = (typeof fileOwnerTypes)[number];

export const manualKinds = ["service_manual", "operation_manual", "other_manual"] as const;
export const documentKinds = ["installation_report", "service_report", "contract", "photo", "other"] as const;
export const fileKinds = [...manualKinds, ...documentKinds] as const;
export type FileKind = (typeof fileKinds)[number];

export const emailKinds = [
  "breakdown_request",
  "breakdown_daily",
  "breakdown_closed",
  "breakdown_reported",
  "pms_reminder",
  "test",
] as const;
export type EmailKind = (typeof emailKinds)[number];

export const recipientSources = ["contact", "service_engineer", "extra"] as const;
export type RecipientSource = (typeof recipientSources)[number];

export const contactKinds = ["phone", "email"] as const;
export type ContactKind = (typeof contactKinds)[number];

export const fixedByOptions = ["in_house", "service_provider"] as const;
export type FixedBy = (typeof fixedByOptions)[number];

// File rules (PRD F6)
export const allowedMimeTypes = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const;
export const MB = 1024 * 1024;
export const manualMaxBytes = 200 * MB;
export const otherFileMaxBytes = 20 * MB;
export function maxBytesFor(kind: FileKind): number {
  return (manualKinds as readonly string[]).includes(kind) ? manualMaxBytes : otherFileMaxBytes;
}
export function isManualKind(kind: string): boolean {
  return (manualKinds as readonly string[]).includes(kind);
}
