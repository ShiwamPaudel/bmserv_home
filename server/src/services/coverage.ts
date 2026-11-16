import { and, eq, gt, gte, inArray, isNull, lt, ne, sql } from "drizzle-orm";
import { todayNepal } from "@bmserv/shared/dates";
import { coverageLastDay, pmsSchedule, rangesOverlap } from "@bmserv/shared/pms";
import type { CoverageInput } from "@bmserv/shared/schemas/coverage";
import { t } from "@bmserv/shared/terms";
import { getDb, type Conn } from "../db/client";
import { coverage, equipment, pmsVisits, serviceProviders } from "../db/schema";
import { badRequest, conflict, notFound } from "../lib/errors";
import { newId } from "../lib/ids";
import type { Actor } from "../lib/http";
import { logActivity } from "./activity";

async function assertNoOverlap(conn: Conn, equipmentId: string, startsOn: string, endsOn: string, exceptId?: string) {
  const others = await conn
    .select()
    .from(coverage)
    .where(and(eq(coverage.equipmentId, equipmentId), exceptId ? ne(coverage.id, exceptId) : undefined));
  for (const c of others) {
    if (rangesOverlap(startsOn, endsOn, c.startsOn, coverageLastDay(c.endsOn, c.endedEarlyOn))) {
      throw conflict(t.coverage.overlap, { startsOn: t.coverage.overlap });
    }
  }
}

async function assertProvider(conn: Conn, id: string) {
  const r = await conn.select({ id: serviceProviders.id }).from(serviceProviders).where(eq(serviceProviders.id, id));
  if (!r[0]) throw badRequest(t.fields.choose, { serviceProviderId: t.fields.choose });
}

/** Inserts coverage and its PMS schedule inside a transaction. Shared by Add coverage and new equipment's warranty. */
export async function insertCoverage(tx: Conn, actor: Actor, equipmentId: string, input: CoverageInput) {
  const id = newId();
  const schedule = pmsSchedule(input.startsOn, input.endsOn, input.pmsEvery, input.pmsUnit);
  await tx.insert(coverage).values({ id, equipmentId, ...input, createdBy: actor.id });
  for (const v of schedule) {
    await tx.insert(pmsVisits).values({ id: newId(), equipmentId, coverageId: id, number: v.number, dueOn: v.dueOn, status: "scheduled" });
  }
  await logActivity(tx, {
    userId: actor.id,
    action: "coverage.added",
    subjectType: "equipment",
    subjectId: equipmentId,
    summary: `${t.coverageType[input.type]} added`,
  });
  return { id, pmsCount: schedule.length };
}

export async function addCoverage(actor: Actor, equipmentId: string, input: CoverageInput) {
  const db = getDb();
  const eqRow = await db.select({ id: equipment.id }).from(equipment).where(eq(equipment.id, equipmentId));
  if (!eqRow[0]) throw notFound();
  await assertProvider(db, input.serviceProviderId);
  await assertNoOverlap(db, equipmentId, input.startsOn, input.endsOn);
  return db.transaction((tx) => insertCoverage(tx, actor, equipmentId, input));
}

/** Editing coverage regenerates only future scheduled visits; done visits never change. */
export async function updateCoverage(actor: Actor, id: string, input: CoverageInput) {
  const db = getDb();
  const found = (await db.select().from(coverage).where(eq(coverage.id, id)))[0];
  if (!found) throw notFound();
  await assertProvider(db, input.serviceProviderId);
  await assertNoOverlap(db, found.equipmentId, input.startsOn, coverageLastDay(input.endsOn, found.endedEarlyOn), id);
  const today = todayNepal();
  const schedule = pmsSchedule(input.startsOn, input.endsOn, input.pmsEvery, input.pmsUnit);
  await db.transaction(async (tx) => {
    await tx.update(coverage).set({ ...input, endProcessedAt: null }).where(eq(coverage.id, id));
    // Future scheduled visits are generated, not recorded by a person: replace them.
    await tx
      .delete(pmsVisits)
      .where(and(eq(pmsVisits.coverageId, id), eq(pmsVisits.status, "scheduled"), gte(pmsVisits.dueOn, today)));
    const kept = await tx.select({ number: pmsVisits.number }).from(pmsVisits).where(eq(pmsVisits.coverageId, id));
    const taken = new Set(kept.map((k) => k.number));
    for (const v of schedule) {
      if (v.dueOn < today || taken.has(v.number)) continue;
      await tx.insert(pmsVisits).values({ id: newId(), equipmentId: found.equipmentId, coverageId: id, number: v.number, dueOn: v.dueOn, status: "scheduled" });
    }
    // Visits past the new end are not done.
    await tx
      .update(pmsVisits)
      .set({ status: "skipped" })
      .where(and(eq(pmsVisits.coverageId, id), eq(pmsVisits.status, "scheduled"), gt(pmsVisits.dueOn, input.endsOn)));
    await logActivity(tx, { userId: actor.id, action: "coverage.updated", subjectType: "equipment", subjectId: found.equipmentId, summary: `${t.coverageType[input.type]} changed` });
  });
  return { id };
}

export async function endCoverageEarly(actor: Actor, id: string, endedOn: string) {
  const db = getDb();
  const found = (await db.select().from(coverage).where(eq(coverage.id, id)))[0];
  if (!found) throw notFound();
  if (endedOn < found.startsOn || endedOn > found.endsOn) {
    throw badRequest("Choose a date between the start and end of this coverage.", { endedOn: t.fields.date });
  }
  await db.transaction(async (tx) => {
    await tx.update(coverage).set({ endedEarlyOn: endedOn }).where(eq(coverage.id, id));
    await tx
      .update(pmsVisits)
      .set({ status: "skipped" })
      .where(and(eq(pmsVisits.coverageId, id), eq(pmsVisits.status, "scheduled"), gt(pmsVisits.dueOn, endedOn)));
    await logActivity(tx, { userId: actor.id, action: "coverage.ended", subjectType: "equipment", subjectId: found.equipmentId, summary: `${t.coverageType[found.type]} ended early` });
  });
  await processEndedCoverage();
  return { id };
}

/** When coverage ends, remaining PMS become Not done. Runs in the tick and after an early end. */
export async function processEndedCoverage(today = todayNepal()) {
  const db = getDb();
  const ended = await db
    .select({ id: coverage.id })
    .from(coverage)
    .where(
      and(
        isNull(coverage.endProcessedAt),
        lt(sql`min(${coverage.endsOn}, coalesce(${coverage.endedEarlyOn}, ${coverage.endsOn}))`, today),
      ),
    );
  if (!ended.length) return 0;
  const ids = ended.map((e) => e.id);
  await db.transaction(async (tx) => {
    await tx.update(pmsVisits).set({ status: "skipped" }).where(and(inArray(pmsVisits.coverageId, ids), eq(pmsVisits.status, "scheduled")));
    await tx.update(coverage).set({ endProcessedAt: Date.now() }).where(inArray(coverage.id, ids));
  });
  return ids.length;
}
