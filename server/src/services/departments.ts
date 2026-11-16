import { and, asc, desc, eq, isNull, ne, or, sql } from "drizzle-orm";
import { t } from "@bmserv/shared/terms";
import { getDb } from "../db/client";
import { departments, equipment, moves, user } from "../db/schema";
import { badRequest, conflict, notFound } from "../lib/errors";
import { newId } from "../lib/ids";
import type { Actor } from "../lib/http";
import { logActivity } from "./activity";
import { equipmentRows, withAway } from "./equipmentRows";
import { ref } from "../lib/sqlRef";

const nameKey = (n: string) => n.trim().replace(/\s+/g, " ").toLowerCase();

export async function listDepartments() {
  return getDb()
    .select({
      id: departments.id,
      name: departments.name,
      shortName: departments.shortName,
      isActive: departments.isActive,
      hereNow: sql<number>`(select count(*) from equipment e where e.current_department_id = ${ref(departments.id)})`,
      belongs: sql<number>`(select count(*) from equipment e where e.home_department_id = ${ref(departments.id)})`,
    })
    .from(departments)
    .orderBy(desc(departments.isActive), asc(departments.name));
}

async function assertNameFree(name: string, exceptId?: string) {
  const r = await getDb()
    .select({ id: departments.id })
    .from(departments)
    .where(and(eq(departments.nameKey, nameKey(name)), exceptId ? ne(departments.id, exceptId) : undefined));
  if (r[0]) throw conflict(t.departments.nameTaken, { name: t.departments.nameTaken });
}

export async function createDepartment(actor: Actor, input: { name: string; shortName: string | null }) {
  await assertNameFree(input.name);
  const id = newId();
  const db = getDb();
  await db.insert(departments).values({ id, name: input.name, nameKey: nameKey(input.name), shortName: input.shortName });
  await logActivity(db, {
    userId: actor.id,
    action: "department.added",
    subjectType: "department",
    subjectId: id,
    summary: `Added department ${input.name}`,
  });
  return { id };
}

export async function updateDepartment(
  actor: Actor,
  id: string,
  input: { name?: string | undefined; shortName?: string | null | undefined; isActive?: boolean | undefined },
) {
  const db = getDb();
  const found = await db.select().from(departments).where(eq(departments.id, id));
  if (!found[0]) throw notFound();
  if (input.name) await assertNameFree(input.name, id);
  if (input.isActive === false) {
    const used = await db
      .select({ id: equipment.id })
      .from(equipment)
      .where(or(eq(equipment.currentDepartmentId, id), eq(equipment.homeDepartmentId, id)))
      .limit(1);
    if (used[0]) throw badRequest(t.departments.cannotInactive);
  }
  await db
    .update(departments)
    .set({
      ...(input.name ? { name: input.name, nameKey: nameKey(input.name) } : {}),
      ...(input.shortName !== undefined ? { shortName: input.shortName } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    })
    .where(eq(departments.id, id));
  await logActivity(db, {
    userId: actor.id,
    action: "department.updated",
    subjectType: "department",
    subjectId: id,
    summary: `Changed department ${input.name ?? found[0].name}`,
  });
  return { id };
}

export async function getDepartment(id: string) {
  const db = getDb();
  const found = await db.select().from(departments).where(eq(departments.id, id));
  if (!found[0]) throw notFound();

  const hereNow = withAway(
    await equipmentRows(db)
      .where(eq(equipment.currentDepartmentId, id))
      .orderBy(asc(sql`type_name`), asc(equipment.serialNumber)),
  );
  const elsewhereRows = withAway(
    await equipmentRows(db)
      .where(and(eq(equipment.homeDepartmentId, id), ne(equipment.currentDepartmentId, id)))
      .orderBy(asc(equipment.serialNumber)),
  );

  // The move that took each away: latest open temporary move.
  const ids = elsewhereRows.map((r) => r.id);
  const moveRows = ids.length
    ? await db
        .select({
          id: moves.id,
          equipmentId: moves.equipmentId,
          movedAt: moves.movedAt,
          expectedReturnOn: moves.expectedReturnOn,
          movedByName: user.name,
        })
        .from(moves)
        .innerJoin(user, eq(user.id, moves.movedBy))
        .where(and(sql`${moves.equipmentId} in ${ids}`, isNull(moves.returnedAt), eq(moves.type, "temporary")))
        .orderBy(desc(moves.movedAt))
    : [];
  const latest = new Map<string, (typeof moveRows)[number]>();
  for (const m of moveRows) if (!latest.has(m.equipmentId)) latest.set(m.equipmentId, m);

  return {
    department: found[0],
    hereNow,
    elsewhere: elsewhereRows.map((r) => ({ ...r, move: latest.get(r.id) ?? null })),
  };
}
