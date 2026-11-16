// Report date ranges. In Nepali (BS) mode months are BS months, quarters and years follow the Nepali fiscal
// year (Shrawan to Asar); in English (AD) mode they are calendar months, quarters and years.
import { addDays, adToBs, bsToAd, daysInBsMonth, formatDate, parseAd, todayNepal, toAd } from "@bmserv/shared/dates";
import type { DateDisplay } from "@bmserv/shared/enums";
import { t } from "@bmserv/shared/terms";

export type Preset = "thisMonth" | "lastMonth" | "thisQuarter" | "lastQuarter" | "thisYear" | "lastYear" | "custom";
export const presets: Exclude<Preset, "custom">[] = ["thisMonth", "lastMonth", "thisQuarter", "lastQuarter", "thisYear", "lastYear"];
export type Range = { from: string; to: string };

/** Month index counted continuously (year * 12 + month - 1), so stepping back crosses years. */
const idx = (y: number, m: number) => y * 12 + (m - 1);
const ym = (i: number) => ({ year: Math.floor(i / 12), month: (i % 12) + 1 });

function bsMonthRange(i: number): Range {
  const { year, month } = ym(i);
  return {
    from: bsToAd({ year, month, day: 1 }) as string,
    to: bsToAd({ year, month, day: daysInBsMonth(year, month) }) as string,
  };
}

function adMonthRange(i: number): Range {
  const { year, month } = ym(i);
  const from = toAd({ year, month, day: 1 });
  const next = ym(i + 1);
  return { from, to: addDays(toAd({ year: next.year, month: next.month, day: 1 }), -1) };
}

/** BS fiscal year starts in Shrawan (month 4). Returns the month index of Shrawan of the fiscal year holding `i`. */
function fiscalStart(i: number): number {
  const { year, month } = ym(i);
  return idx(month >= 4 ? year : year - 1, 4);
}

export function presetRange(p: Exclude<Preset, "custom">, mode: DateDisplay, today = todayNepal()): Range {
  const span = (a: number, b: number, month: (i: number) => Range) => ({ from: month(a).from, to: month(b).to });
  if (mode === "bs") {
    const bs = adToBs(today);
    if (bs) {
      const now = idx(bs.year, bs.month);
      const fy = fiscalStart(now);
      const q = fy + Math.floor((now - fy) / 3) * 3; // fiscal quarters: Shrawan, Kartik, Magh, Baisakh
      switch (p) {
        case "thisMonth":
          return bsMonthRange(now);
        case "lastMonth":
          return bsMonthRange(now - 1);
        case "thisQuarter":
          return span(q, q + 2, bsMonthRange);
        case "lastQuarter":
          return span(q - 3, q - 1, bsMonthRange);
        case "thisYear":
          return span(fy, fy + 11, bsMonthRange);
        case "lastYear":
          return span(fy - 12, fy - 1, bsMonthRange);
      }
    }
  }
  const ad = parseAd(today)!;
  const now = idx(ad.year, ad.month);
  const q = idx(ad.year, Math.floor((ad.month - 1) / 3) * 3 + 1);
  const y = idx(ad.year, 1);
  switch (p) {
    case "thisMonth":
      return adMonthRange(now);
    case "lastMonth":
      return adMonthRange(now - 1);
    case "thisQuarter":
      return span(q, q + 2, adMonthRange);
    case "lastQuarter":
      return span(q - 3, q - 1, adMonthRange);
    case "thisYear":
      return span(y, y + 11, adMonthRange);
    case "lastYear":
      return span(y - 12, y - 1, adMonthRange);
  }
}

/** The preset's name in this calendar: "This fiscal year" in BS mode. */
export function presetLabel(p: Preset, mode: DateDisplay): string {
  if (mode === "bs" && (p === "thisYear" || p === "lastYear")) return p === "thisYear" ? t.reports.thisFiscalYear : t.reports.lastFiscalYear;
  if (mode === "bs" && (p === "thisQuarter" || p === "lastQuarter")) return p === "thisQuarter" ? t.reports.thisFiscalQuarter : t.reports.lastFiscalQuarter;
  return t.reports.presets[p];
}

export function rangeText(r: Range, mode: DateDisplay): string {
  return `${formatDate(r.from, mode)} to ${formatDate(r.to, mode)}`;
}
