import { daysBetween, durationParts, formatDate, formatMoment } from "@bmserv/shared/dates";
import type { DateDisplay } from "@bmserv/shared/enums";
import { t } from "@bmserv/shared/terms";

// The calendar chosen in Settings (Nepali or English). Set once the hospital settings load.
let mode: DateDisplay = "bs";
export function setDateMode(next: DateDisplay | undefined) {
  if (next) mode = next;
}
export function dateMode(): DateDisplay {
  return mode;
}

/** A date in the chosen calendar: "12 Mangsir 2083" or "28 Nov 2026". */
export function DateText({ ad }: { ad: string | null | undefined }) {
  if (!ad) return <>{t.app.notSet}</>;
  return <>{formatDate(ad, mode)}</>;
}

export function MomentText({ ms }: { ms: number | null | undefined }) {
  if (!ms) return <>{t.app.notSet}</>;
  return <>{formatMoment(ms, mode)}</>;
}

/** Today, Tomorrow, In 3 days, 2 days overdue — or null when far away. */
export function nearDate(ad: string, today: string): string | null {
  const d = daysBetween(today, ad);
  if (d === 0) return t.dates.today;
  if (d === 1) return t.dates.tomorrow;
  if (d === -1) return t.dates.daysOverdue(1);
  if (d > 1 && d <= 14) return t.dates.inDays(d);
  if (d < -1) return t.dates.daysOverdue(-d);
  return null;
}

export function downFor(fromMs: number, toMs: number | null): string {
  const d = durationParts(fromMs, toMs ?? Date.now());
  return toMs ? t.dates.wasDownFor(d.days, d.hours) : t.dates.downFor(d.days, d.hours);
}
