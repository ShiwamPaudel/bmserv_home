import { and, asc, eq, inArray, ne } from "drizzle-orm";
import type { Role } from "@bmserv/shared/enums";
import { assignableRoles, canManagePerson } from "@bmserv/shared/permissions";
import type { CreatePerson, UpdatePerson } from "@bmserv/shared/schemas/team";
import { t } from "@bmserv/shared/terms";
import { getAuth } from "../auth";
import { getDb } from "../db/client";
import { departments, staffDepartments, user } from "../db/schema";
import { AppError, badRequest, conflict, forbidden, notFound } from "../lib/errors";
import type { Actor } from "../lib/http";
import { logActivity } from "./activity";

export type Person = {
  id: string;
  name: string;
  username: string;
  email: string;
  phone: string;
  role: Role;
  isActive: boolean;
  /** Hospital staff only: the departments whose equipment they see. */
  departmentIds: string[];
};

const personColumns = {
  id: user.id,
  name: user.name,
  username: user.displayUsername,
  usernameKey: user.username,
  email: user.email,
  phone: user.phone,
  role: user.role,
  banned: user.banned,
};

function toPerson(r: {
  id: string;
  name: string;
  username: string | null;
  usernameKey: string | null;
  email: string;
  phone: string;
  role: Role;
  banned: boolean;
}, departmentIds: string[] = []): Person {
  return {
    id: r.id,
    name: r.name,
    username: r.username ?? r.usernameKey ?? "",
    email: r.email,
    phone: r.phone,
    role: r.role,
    isActive: !r.banned,
    departmentIds,
  };
}

async function departmentsByPerson(userIds?: string[]): Promise<Map<string, string[]>> {
  const rows = await getDb()
    .select({ userId: staffDepartments.userId, departmentId: staffDepartments.departmentId })
    .from(staffDepartments)
    .innerJoin(departments, eq(departments.id, staffDepartments.departmentId))
    .where(userIds ? inArray(staffDepartments.userId, userIds) : undefined)
    .orderBy(asc(departments.name));
  const map = new Map<string, string[]>();
  for (const r of rows) map.set(r.userId, [...(map.get(r.userId) ?? []), r.departmentId]);
  return map;
}

/** The departments a person of this role may have: only hospital staff have any, all active. */
async function checkDepartments(role: Role, ids: string[]): Promise<string[]> {
  const db = getDb();
  const wanted = role === "staff" ? [...new Set(ids)] : [];
  if (wanted.length) {
    const found = await db
      .select({ id: departments.id })
      .from(departments)
      .where(and(inArray(departments.id, wanted), eq(departments.isActive, true)));
    if (found.length !== wanted.length) throw badRequest(t.team.departmentsUnknown, { departmentIds: t.team.departmentsUnknown });
  }
  return wanted;
}

/** Replaces a person's departments with checked ids. */
async function setDepartments(personId: string, wanted: string[]): Promise<void> {
  await getDb().transaction(async (tx) => {
    await tx.delete(staffDepartments).where(eq(staffDepartments.userId, personId));
    if (wanted.length) {
      const now = Date.now();
      await tx.insert(staffDepartments).values(wanted.map((departmentId) => ({ userId: personId, departmentId, createdAt: now })));
    }
  });
}

export async function listTeam(): Promise<Person[]> {
  const rows = await getDb().select(personColumns).from(user).orderBy(asc(user.banned), asc(user.name));
  const depts = await departmentsByPerson();
  return rows.map((r) => toPerson(r, depts.get(r.id)));
}

async function findPerson(id: string): Promise<Person> {
  const rows = await getDb().select(personColumns).from(user).where(eq(user.id, id));
  if (!rows[0]) throw notFound();
  return toPerson(rows[0], (await departmentsByPerson([id])).get(id));
}

async function assertUnique(fields: { username?: string; email?: string }, exceptId?: string) {
  const db = getDb();
  if (fields.username) {
    const r = await db
      .select({ id: user.id })
      .from(user)
      .where(and(eq(user.username, fields.username), exceptId ? ne(user.id, exceptId) : undefined));
    if (r[0]) throw conflict(t.team.usernameTaken, { username: t.team.usernameTaken });
  }
  if (fields.email) {
    const r = await db
      .select({ id: user.id })
      .from(user)
      .where(and(eq(user.email, fields.email), exceptId ? ne(user.id, exceptId) : undefined));
    if (r[0]) throw conflict(t.team.emailTaken, { email: t.team.emailTaken });
  }
}

/** Creates a person with a temporary password (no public sign-up). Used by the Team screen and the seed. */
export async function createPersonUnchecked(
  input: Omit<CreatePerson, "departmentIds">,
  opts: { mustChangePassword: boolean },
): Promise<Person> {
  await assertUnique({ username: input.username, email: input.email });
  const ctx = await getAuth().$context;
  const hash = await ctx.password.hash(input.password);
  const created = await ctx.internalAdapter.createUser({
    name: input.name,
    email: input.email,
    emailVerified: true,
    username: input.username,
    displayUsername: input.username,
    role: input.role,
    phone: input.phone,
    banned: false,
    mustChangePassword: opts.mustChangePassword,
  }, { method: "admin" });
  await ctx.internalAdapter.linkAccount({
    userId: created.id,
    providerId: "credential",
    accountId: created.id,
    password: hash,
  });
  return findPerson(created.id);
}

export async function createPerson(actor: Actor, input: CreatePerson): Promise<Person> {
  if (!canManagePerson(actor.role, input.role)) throw forbidden();
  const depts = await checkDepartments(input.role, input.departmentIds ?? []);
  const created = await createPersonUnchecked(input, { mustChangePassword: true });
  if (depts.length) await setDepartments(created.id, depts);
  const person = await findPerson(created.id);
  await logActivity(getDb(), {
    userId: actor.id,
    action: "team.added",
    subjectType: "user",
    subjectId: person.id,
    summary: `Added ${person.name} as ${t.roles[person.role]}`,
  });
  return person;
}

export async function updatePerson(actor: Actor, id: string, input: UpdatePerson): Promise<Person> {
  const target = await findPerson(id);
  const self = target.id === actor.id;
  if (!self && !canManagePerson(actor.role, target.role)) throw forbidden();
  if (self && (input.role !== undefined || input.isActive !== undefined)) {
    if (input.isActive === false) throw badRequest(t.team.cannotSelf);
    if (input.role !== undefined && input.role !== target.role) throw forbidden();
  }
  if (self && input.departmentIds !== undefined) throw forbidden();
  if (!self && input.role && input.role !== target.role && !assignableRoles(actor.role).includes(input.role)) {
    throw forbidden();
  }
  await assertUnique({ email: input.email }, id);
  const role = input.role ?? target.role;
  const depts =
    input.departmentIds !== undefined || role !== target.role
      ? await checkDepartments(role, input.departmentIds ?? target.departmentIds)
      : null;

  const db = getDb();
  const patch: Partial<typeof user.$inferInsert> = { updatedAt: new Date() };
  if (input.name !== undefined) patch.name = input.name;
  if (input.phone !== undefined) patch.phone = input.phone;
  if (input.email !== undefined) patch.email = input.email;
  if (input.role !== undefined) patch.role = input.role;
  if (input.isActive !== undefined) {
    patch.banned = !input.isActive;
    patch.banReason = input.isActive ? null : "Deactivated";
  }
  await db.update(user).set(patch).where(eq(user.id, id));
  if (depts) await setDepartments(id, depts);

  if (input.isActive === false) {
    const ctx = await getAuth().$context;
    await ctx.internalAdapter.deleteUserSessions(id);
  }
  if (input.isActive !== undefined || (input.role && input.role !== target.role)) {
    await logActivity(db, {
      userId: actor.id,
      action: input.isActive === false ? "team.deactivated" : "team.updated",
      subjectType: "user",
      subjectId: id,
      summary:
        input.isActive === false
          ? `Deactivated ${target.name}`
          : input.isActive === true
            ? `Made ${target.name} active again`
            : `Changed ${target.name} to ${t.roles[input.role as Role]}`,
    });
  }
  return findPerson(id);
}

export async function resetPassword(actor: Actor, id: string, password: string): Promise<void> {
  const target = await findPerson(id);
  if (target.id === actor.id || !canManagePerson(actor.role, target.role)) throw forbidden();
  const ctx = await getAuth().$context;
  const hash = await ctx.password.hash(password);
  await ctx.internalAdapter.updatePassword(id, hash);
  await getDb().update(user).set({ mustChangePassword: true, updatedAt: new Date() }).where(eq(user.id, id));
  await ctx.internalAdapter.deleteUserSessions(id);
  await logActivity(getDb(), {
    userId: actor.id,
    action: "team.passwordReset",
    subjectType: "user",
    subjectId: id,
    summary: `Reset password for ${target.name}`,
  });
}

export async function changeOwnPassword(actor: Actor, currentPassword: string, newPassword: string): Promise<void> {
  const ctx = await getAuth().$context;
  const accounts = await ctx.internalAdapter.findAccounts(actor.id);
  const credential = accounts.find((a) => a.providerId === "credential");
  if (!credential?.password) throw notFound();
  const ok = await ctx.password.verify({ hash: credential.password, password: currentPassword });
  if (!ok) throw new AppError(400, "validation", t.account.wrongCurrent, { currentPassword: t.account.wrongCurrent });
  await ctx.internalAdapter.updatePassword(actor.id, await ctx.password.hash(newPassword));
  await getDb().update(user).set({ mustChangePassword: false, updatedAt: new Date() }).where(eq(user.id, actor.id));
}

export async function activeUserName(id: string): Promise<string | null> {
  const r = await getDb().select({ name: user.name, banned: user.banned }).from(user).where(eq(user.id, id));
  return r[0] && !r[0].banned ? r[0].name : null;
}
