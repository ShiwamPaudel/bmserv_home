import type { Role } from "./enums";

// One row per line of PRD section 3. The server checks these on every write; the web only uses them
// to hide controls. Staff (hospital staff) only report problems and see their own reports.
export const permissions = {
  view: ["admin", "lead", "engineer"],
  "breakdown.report": ["admin", "lead", "engineer", "staff"],
  // Breakdowns: record, notes, ask provider, change recipients, pause/resume, send now, mark as fixed, assign
  "breakdown.work": ["admin", "lead", "engineer"],
  "pms.markDone": ["admin", "lead", "engineer"],
  "pms.remind": ["admin", "lead", "engineer"],
  "move.temporary": ["admin", "lead", "engineer"],
  "file.upload": ["admin", "lead", "engineer"],
  "serviceEngineer.manage": ["admin", "lead", "engineer"],
  "equipment.designate": ["admin", "lead", "engineer"],
  "label.print": ["admin", "lead", "engineer"],
  "equipment.edit": ["admin", "lead"],
  "model.edit": ["admin", "lead"],
  "equipment.import": ["admin", "lead"],
  "move.permanent": ["admin", "lead"],
  "department.edit": ["admin", "lead"],
  "provider.edit": ["admin", "lead"],
  "coverage.edit": ["admin", "lead"],
  "pms.editDate": ["admin", "lead"],
  "file.remove": ["admin", "lead"],
  "equipment.outOfService": ["admin", "lead"],
  "breakdown.notRepairable": ["admin", "lead"],
  "team.manageEngineers": ["admin", "lead"],
  "team.manageLeadsAdmins": ["admin"],
  "settings.edit": ["admin"],
} as const satisfies Record<string, readonly Role[]>;

export type Action = keyof typeof permissions;

export function can(role: Role | null | undefined, action: Action): boolean {
  if (!role) return false;
  return (permissions[action] as readonly Role[]).includes(role);
}

/** Can someone with `actor` role create, edit, reset or deactivate a person with `target` role? */
export function canManagePerson(actor: Role, target: Role): boolean {
  if (target === "engineer" || target === "staff") return can(actor, "team.manageEngineers");
  return can(actor, "team.manageLeadsAdmins");
}

/** Roles `actor` may give to someone. */
export function assignableRoles(actor: Role): Role[] {
  if (actor === "admin") return ["admin", "lead", "engineer", "staff"];
  if (actor === "lead") return ["engineer", "staff"];
  return [];
}
