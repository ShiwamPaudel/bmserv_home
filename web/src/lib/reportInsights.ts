// The report's data as the server sends it, and the plain-language highlights drawn from it.
// Used by the Reports screen, its PDF (print) and its PowerPoint.
import type { CoverageType, DateDisplay } from "@bmserv/shared/enums";
import { t } from "@bmserv/shared/terms";

type Named = { name: string; n: number };

export type ReportData = {
  period: { from: string; to: string; days: number; asOf: string; months: number; running: boolean };
  generatedAt: number;
  hospital: { name: string; departmentName: string; logoFileId: string | null; dateDisplay: DateDisplay };
  equipment: {
    total: number;
    added: number;
    addedList: { label: string; serialNumber: string; department: string; installedOn: string }[];
    statusNow: { working: number; breakdown: number; out_of_service: number };
    byDepartment: Named[];
    byType: Named[];
  };
  breakdowns: {
    reported: number;
    fromStaff: number;
    closed: number;
    fixed: number;
    notRepairable: number;
    fixedInHouse: number;
    fixedByProvider: number;
    openAtEnd: number;
    medianFixHours: number | null;
    averageFixHours: number | null;
    uptimePct: number | null;
    downtimeDays: number;
    byDepartment: Named[];
    byType: Named[];
    byProvider: { name: string; reported: number; fixed: number; medianFixHours: number | null }[];
    repeat: { label: string; serialNumber: string; department: string; n: number }[];
    longestOpen: { numberText: string; label: string; serialNumber: string; department: string; days: number }[];
  };
  pms: {
    due: number;
    dueLater: number;
    done: number;
    onTime: number;
    late: number;
    missed: number;
    compliancePct: number | null;
    doneInRange: number;
    byProvider: { name: string; due: number; done: number; compliance: number | null }[];
  };
  coverage: {
    mix: { warranty: number; amc: number; cmc: number; none: number };
    covered: number;
    coveredPct: number | null;
    started: number;
    ended: number;
    endingNext: { type: CoverageType; lastDay: string; label: string; serialNumber: string; department: string; provider: string }[];
  };
  activity: { moves: number; temporaryMoves: number; permanentMoves: number; emailsSent: number; emailsFailed: number; pmsReminders: number };
  perMonth: { key: string; label: string; reported: number; fixed: number; pmsDue: number; pmsDone: number }[];
};

/** One row per service provider: breakdowns and PMS together. */
export function providerRows(r: ReportData) {
  const names = [...new Set([...r.breakdowns.byProvider.map((p) => p.name), ...r.pms.byProvider.map((p) => p.name)])];
  return names
    .map((name) => {
      const b = r.breakdowns.byProvider.find((p) => p.name === name);
      const p = r.pms.byProvider.find((x) => x.name === name);
      return {
        name,
        reported: b?.reported ?? 0,
        fixed: b?.fixed ?? 0,
        medianFixHours: b?.medianFixHours ?? null,
        pmsDue: p?.due ?? 0,
        pmsDone: p?.done ?? 0,
        compliance: p?.compliance ?? null,
      };
    })
    .sort((a, b) => b.reported + b.pmsDue - (a.reported + a.pmsDue));
}

/** Short sentences a manager can read out: the most telling facts of the period, in order. */
export function highlights(r: ReportData): string[] {
  const b = r.breakdowns;
  const out: string[] = [];
  if (b.uptimePct !== null) out.push(t.reports.hUptime(b.uptimePct, b.downtimeDays));
  if (b.reported) out.push(t.reports.hBreakdowns(b.reported, b.fixed, b.fromStaff));
  else out.push(t.reports.hQuiet);
  if (b.medianFixHours !== null) out.push(t.reports.hFix(t.reports.hours(b.medianFixHours)));
  if (b.fixed) out.push(t.reports.hInHouse(Math.round((b.fixedInHouse / b.fixed) * 100)));
  if (b.byDepartment[0] && b.reported > 1) out.push(t.reports.hTopDept(b.byDepartment[0].name, b.byDepartment[0].n));
  if (b.byType[0] && b.reported > 1) out.push(t.reports.hTopType(b.byType[0].name, b.byType[0].n));
  if (b.repeat.length) out.push(t.reports.hRepeat(b.repeat.length));
  if (b.openAtEnd && b.longestOpen[0]) out.push(t.reports.hOpen(b.openAtEnd, b.longestOpen[0].days));
  if (r.pms.due && r.pms.compliancePct !== null) out.push(t.reports.hPms(r.pms.done, r.pms.due, r.pms.compliancePct));
  if (r.pms.missed) out.push(t.reports.hPmsMissed(r.pms.missed));
  if (r.coverage.coveredPct !== null) out.push(t.reports.hCoverage(r.coverage.coveredPct, r.coverage.mix.none));
  if (r.coverage.endingNext.length) out.push(t.reports.hEnding(r.coverage.endingNext.length));
  if (r.equipment.added) out.push(t.reports.hAdded(r.equipment.added));
  return out;
}

/**
 * The hospital logo as a data URL with its size, for the PowerPoint (null when there is none or it fails).
 * Read through our own server: a browser fetch of the R2 link is blocked by CORS (a redirect sends Origin: null,
 * and the bucket may allow only uploads).
 */
export async function logoForExport(fileId: string | null): Promise<{ data: string; w: number; h: number } | null> {
  if (!fileId) return null;
  try {
    const res = await fetch("/api/hospital-logo", { cache: "no-store" });
    if (!res.ok) return null;
    const blob = await res.blob();
    const data = await new Promise<string>((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result as string);
      fr.onerror = () => reject(fr.error);
      fr.readAsDataURL(blob);
    });
    const size = await new Promise<{ w: number; h: number }>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = reject;
      img.src = data;
    });
    return { data, ...size };
  } catch {
    return null;
  }
}
