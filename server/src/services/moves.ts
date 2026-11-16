import { and, eq } from "drizzle-orm";
import { can } from "@bmserv/shared/permissions";
import type { MoveInput } from "@bmserv/shared/schemas/equipment";
import { t } from "@bmserv/shared/terms";
import { getDb } from "../db/client";
import { departments, equipment, moves } from "../db/schema";
import { badRequest, forbidden, notFound } from "../lib/errors";
import { newId } from "../lib/ids";
import type { Actor } from "../lib/http";
import { latestOpenTemporaryMove } from "./equipment";

export async function moveEquipment(actor: Actor, equipmentId: string, input: MoveInput) {
  if (input.type === "permanent" && !can(actor.role, "move.permanent")) throw forbidden();
  const db = getDb();
  const found = await db.select().from(equipment).where(eq(equipment.id, equipmentId));
  const eqRow = found[0];
  if (!eqRow) throw notFound();
  const dept = await db
    .select({ id: departments.id })
    .from(departments)
    .where(and(eq(departments.id, input.toDepartmentId), eq(departments.isActive, true)));
  if (!dept[0]) throw badRequest(t.fields.choose, { toDepartmentId: t.fields.choose });
  if (input.type === "temporary" && input.toDepartmentId === eqRow.currentDepartmentId) {
    throw badRequest(t.moves.sameDepartment, { toDepartmentId: t.moves.sameDepartment });
  }
  if (input.type === "permanent" && input.toDepartmentId === eqRow.homeDepartmentId && input.toDepartmentId === eqRow.currentDepartmentId) {
    throw badRequest(t.moves.sameDepartment, { toDepartmentId: t.moves.sameDepartment });
  }

  const id = newId();
  const now = Date.now();
  await db.transaction(async (tx) => {
    await tx.insert(moves).values({
      id,
      equipmentId,
      fromDepartmentId: eqRow.currentDepartmentId,
      toDepartmentId: input.toDepartmentId,
      type: input.type,
      reason: input.reason,
      movedAt: now,
      movedBy: actor.id,
      expectedReturnOn: input.type === "temporary" ? input.expectedReturnOn : null,
    });
    await tx
      .update(equipment)
      .set(
        input.type === "temporary"
          ? { currentDepartmentId: input.toDepartmentId, updatedAt: now }
          : {
              currentDepartmentId: input.toDepartmentId,
              homeDepartmentId: input.toDepartmentId,
              labelOutdated: true,
              updatedAt: now,
            },
      )
      .where(eq(equipment.id, equipmentId));
  });
  return { id };
}

/** "Return to [home]": closes the latest open temporary move. */
export async function returnEquipment(actor: Actor, moveId: string) {
  const db = getDb();
  const found = await db.select().from(moves).where(eq(moves.id, moveId));
  const move = found[0];
  if (!move) throw notFound();
  const latest = await latestOpenTemporaryMove(db, move.equipmentId);
  if (!latest || latest.id !== moveId) throw badRequest("This move was already closed. Reload the page.");
  const now = Date.now();
  await db.transaction(async (tx) => {
    const eqRow = (await tx.select().from(equipment).where(eq(equipment.id, move.equipmentId)))[0];
    if (!eqRow) throw notFound();
    await tx.update(moves).set({ returnedAt: now, returnedBy: actor.id }).where(eq(moves.id, moveId));
    await tx
      .update(equipment)
      .set({ currentDepartmentId: eqRow.homeDepartmentId, updatedAt: now })
      .where(eq(equipment.id, move.equipmentId));
  });
  return { equipmentId: move.equipmentId };
}
