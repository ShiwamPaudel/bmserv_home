// Dates are stored AD `YYYY-MM-DD`; moments are UTC ms. "Today" is the date in Asia/Kathmandu.
// BS (Bikram Sambat) is only for display and input.
import NepaliDate from "nepali-date-converter";
import type { DateDisplay } from "./enums";

export const NEPAL_TZ = "Asia/Kathmandu";

export const bsMonthNames = [
  "Baisakh",
  "Jestha",
  "Asar",
  "Shrawan",
  "Bhadra",
  "Asoj",
  "Kartik",
  "Mangsir",
  "Poush",
  "Magh",
  "Falgun",
  "Chaitra",
] as const;

const adMonthShort = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export type YMD = { year: number; month: number; day: number }; // month 1-12

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A UTC date for any year. Date.UTC reads years 0–99 as 1900–1999, which broke half-typed years like 0002. */
function utcDate(year: number, monthIndex: number, day: number): Date {
  const d = new Date(0);
  d.setUTCFullYear(year, monthIndex, day);
  return d;
}

export function parseAd(ad: string): YMD | null {
  const m = ISO.exec(ad);
  if (!m) return null;
  const ymd = { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
  const d = utcDate(ymd.year, ymd.month - 1, ymd.day);
  if (d.getUTCFullYear() !== ymd.year || d.getUTCMonth() !== ymd.month - 1 || d.getUTCDate() !== ymd.day) return null;
  return ymd;
}

export function isAdDate(ad: string): boolean {
  return parseAd(ad) !== null;
}

/** A real date someone means, not a year still being typed (0002, 0020, 0202). */
export function isPlausibleDate(ad: string): boolean {
  const p = parseAd(ad);
  return !!p && p.year >= 1900 && p.year <= 2200;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function toAd({ year, month, day }: YMD): string {
  return `${String(year).padStart(4, "0")}-${pad(month)}-${pad(day)}`;
}

function nepalParts(ms: number): Record<string, string> {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: NEPAL_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(ms));
  return Object.fromEntries(parts.map((p) => [p.type, p.value]));
}

/** Today's date in Nepal, `YYYY-MM-DD`. */
export function todayNepal(now: number = Date.now()): string {
  const p = nepalParts(now);
  return `${p.year}-${p.month}-${p.day}`;
}

/** The Nepal date of a moment. */
export function nepalDateOf(ms: number): string {
  return todayNepal(ms);
}

/** Nepal clock time `HH:MM` of a moment. */
export function nepalTime(now: number = Date.now()): string {
  const p = nepalParts(now);
  return `${p.hour}:${p.minute}`;
}

export function addDays(ad: string, days: number): string {
  const p = parseAd(ad);
  if (!p) throw new Error(`Not a date: ${ad}`);
  const d = utcDate(p.year, p.month - 1, p.day + days);
  return toAd({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() });
}

/** Adds months, keeping the day where possible (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(ad: string, months: number): string {
  const p = parseAd(ad);
  if (!p) throw new Error(`Not a date: ${ad}`);
  const total = p.year * 12 + (p.month - 1) + months;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  const lastDay = utcDate(year, month, 0).getUTCDate();
  return toAd({ year, month, day: Math.min(p.day, lastDay) });
}

/** Whole days from `a` to `b` (b - a). */
export function daysBetween(a: string, b: string): number {
  const pa = parseAd(a);
  const pb = parseAd(b);
  if (!pa || !pb) throw new Error("Not a date");
  return Math.round(
    (utcDate(pb.year, pb.month - 1, pb.day).getTime() - utcDate(pa.year, pa.month - 1, pa.day).getTime()) / 86_400_000,
  );
}

// ---- BS conversion ----

/** AD `YYYY-MM-DD` to BS, or null outside the supported range (BS 2000–2090). */
export function adToBs(ad: string): YMD | null {
  const p = parseAd(ad);
  if (!p) return null;
  try {
    const bs = new NepaliDate(new Date(p.year, p.month - 1, p.day)).getBS();
    return { year: bs.year, month: bs.month + 1, day: bs.date };
  } catch {
    return null;
  }
}

/** BS to AD `YYYY-MM-DD`, or null if the BS date does not exist. */
export function bsToAd(bs: YMD): string | null {
  if (bs.month < 1 || bs.month > 12 || bs.day < 1 || bs.day > 32) return null;
  try {
    const ad = new NepaliDate(bs.year, bs.month - 1, bs.day).getAD();
    const result = toAd({ year: ad.year, month: ad.month + 1, day: ad.date });
    const back = adToBs(result);
    if (!back || back.year !== bs.year || back.month !== bs.month || back.day !== bs.day) return null;
    return result;
  } catch {
    return null;
  }
}

export function daysInBsMonth(year: number, month: number): number {
  for (let d = 32; d >= 28; d--) if (bsToAd({ year, month, day: d })) return d;
  return 30;
}

export const bsYearRange = { first: 2000, last: 2090 } as const;

// ---- Display ----

export function formatBs(ad: string): string | null {
  const bs = adToBs(ad);
  if (!bs) return null;
  return `${bs.day} ${bsMonthNames[bs.month - 1]} ${bs.year}`;
}

export function formatAd(ad: string): string {
  const p = parseAd(ad);
  if (!p) return ad;
  return `${p.day} ${adMonthShort[p.month - 1]} ${p.year}`;
}

/** A date in the calendar chosen in Settings: "12 Mangsir 2083" (bs) or "28 Nov 2026" (ad). */
export function formatDate(ad: string, mode: DateDisplay = "bs"): string {
  if (mode === "ad") return formatAd(ad);
  return formatBs(ad) ?? formatAd(ad);
}

/** A moment with Nepal time: "12 Mangsir 2083, 09:15" (bs) or "28 Nov 2026, 09:15" (ad). */
export function formatMoment(ms: number, mode: DateDisplay = "bs"): string {
  return `${formatDate(nepalDateOf(ms), mode)}, ${nepalTime(ms)}`;
}

/** Days and hours between two moments: { days, hours }. */
export function durationParts(fromMs: number, toMs: number): { days: number; hours: number } {
  const totalHours = Math.max(0, Math.floor((toMs - fromMs) / 3_600_000));
  return { days: Math.floor(totalHours / 24), hours: totalHours % 24 };
}

// ---- Months (Home charts) ----

export type MonthBucket = { key: string; label: string };

/** The calendar month an AD date falls in, in the chosen calendar: key "2083-08", label "Mangsir". */
export function monthOf(ad: string, mode: DateDisplay = "bs"): MonthBucket {
  const bs = mode === "bs" ? adToBs(ad) : null;
  const ymd = bs ?? parseAd(ad);
  if (!ymd) return { key: ad.slice(0, 7), label: ad.slice(0, 7) };
  const name = bs ? bsMonthNames[ymd.month - 1] : adMonthShort[ymd.month - 1];
  return { key: `${ymd.year}-${String(ymd.month).padStart(2, "0")}`, label: name ?? "" };
}

/** The last `n` months up to and including the month of `today`, oldest first. */
export function lastMonths(today: string, n: number, mode: DateDisplay = "bs"): MonthBucket[] {
  const cur = monthOf(today, mode);
  const [y0, m0] = cur.key.split("-").map(Number) as [number, number];
  const out: MonthBucket[] = [];
  for (let i = n - 1; i >= 0; i--) {
    let y = y0;
    let m = m0 - i;
    while (m < 1) {
      m += 12;
      y -= 1;
    }
    const name = mode === "bs" && adToBs(today) ? bsMonthNames[m - 1] : adMonthShort[m - 1];
    out.push({ key: `${y}-${String(m).padStart(2, "0")}`, label: name ?? "" });
  }
  return out;
}
