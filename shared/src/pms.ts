import { addDays, addMonths } from "./dates";
import type { PmsUnit } from "./enums";

export type PmsDate = { number: number; dueOn: string };

/** Most PMS visits a coverage can generate (every 1 day for years would be absurd). */
export const PMS_MAX_VISITS = 400;

/** The date `k` PMS intervals after `start`. */
export function pmsStep(start: string, every: number, unit: PmsUnit, k: number): string {
  if (unit === "days") return addDays(start, every * k);
  return addMonths(start, (unit === "years" ? 12 : 1) * every * k);
}

/**
 * PMS schedule for a coverage: first due = startsOn + N days/months/years, then every N while <= endsOn.
 * Always counted from the start so days do not drift (31 Jan, 28 Feb, 31 Mar…).
 */
export function pmsSchedule(startsOn: string, endsOn: string, every: number | null, unit: PmsUnit = "months"): PmsDate[] {
  if (!every || every < 1) return [];
  const out: PmsDate[] = [];
  for (let k = 1; k <= PMS_MAX_VISITS; k++) {
    const due = pmsStep(startsOn, every, unit, k);
    if (due > endsOn) break;
    out.push({ number: k, dueOn: due });
  }
  return out;
}

/** The day coverage effectively stops: the earlier of the end date and the early end. */
export function coverageLastDay(endsOn: string, endedEarlyOn: string | null): string {
  return endedEarlyOn && endedEarlyOn < endsOn ? endedEarlyOn : endsOn;
}

export function isCoverageCurrent(
  c: { startsOn: string; endsOn: string; endedEarlyOn: string | null },
  today: string,
): boolean {
  return c.startsOn <= today && today <= coverageLastDay(c.endsOn, c.endedEarlyOn);
}

/** Two date ranges overlap (inclusive). */
export function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}
