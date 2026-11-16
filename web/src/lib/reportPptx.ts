// The report as a PowerPoint (.pptx) with editable charts, for monthly, quarterly and annual meetings.
// pptxgenjs is loaded only when someone downloads, so it never slows the app down.
import { formatDate } from "@bmserv/shared/dates";
import { t } from "@bmserv/shared/terms";
import { highlights, logoForExport, providerRows, type ReportData } from "./reportInsights";

// Brand colours from tokens.css (PowerPoint wants hex without #).
const NAVY = "19445B";
const INK = "12303F";
const MUTED = "52656F";
const LINE = "D6DFE4";
const SURFACE = "F3F7F8";
const TEAL = "2DD4BF";
const C = { ok: "2E8B57", bad: "C0392B", wait: "D98A00", off: "9AA8AF", one: "2A78D6", two: "0B8F80", three: "C2700F", none: "D6DFE4" };
const FONT = "Arial";

type Cell = { text: string; options?: Record<string, unknown> };

/** Fits a logo into a box, keeping its shape. */
function fit(logo: { w: number; h: number }, boxW: number, boxH: number) {
  const scale = Math.min(boxW / logo.w, boxH / logo.h);
  return { w: logo.w * scale, h: logo.h * scale };
}

export async function downloadReportPptx(r: ReportData, periodText: string): Promise<void> {
  const { default: PptxGenJS } = await import("pptxgenjs");
  const logo = await logoForExport(r.hospital.logoFileId);
  const mode = r.hospital.dateDisplay;
  const pptx = new PptxGenJS();
  type Slide = ReturnType<typeof pptx.addSlide>;
  pptx.layout = "LAYOUT_WIDE"; // 13.33 x 7.5 in
  pptx.title = `${t.reports.coverTitle}, ${periodText}`;
  pptx.company = r.hospital.name;
  pptx.author = r.hospital.departmentName;

  // Every content slide: navy band on top, hospital and period in the footer, logo bottom right, slide number.
  const footerLogo = logo ? fit(logo, 1.1, 0.42) : null;
  pptx.defineSlideMaster({
    title: "BODY",
    background: { color: "FFFFFF" },
    objects: [
      { rect: { x: 0, y: 0, w: 13.33, h: 0.12, fill: { color: NAVY } } },
      { line: { x: 0.5, y: 6.95, w: 12.33, h: 0, line: { color: LINE, width: 0.75 } } },
      { text: { text: `${r.hospital.name}  ·  ${r.hospital.departmentName}  ·  ${periodText}`, options: { x: 0.5, y: 7.0, w: 9.5, h: 0.35, fontFace: FONT, fontSize: 10, color: MUTED } } },
      ...(logo && footerLogo ? [{ image: { data: logo.data, x: 12.83 - footerLogo.w, y: 6.99 + (0.42 - footerLogo.h) / 2, w: footerLogo.w, h: footerLogo.h } }] : []),
    ],
    slideNumber: { x: logo ? 10.6 : 12.2, y: 7.0, w: 0.8, h: 0.35, fontFace: FONT, fontSize: 10, color: MUTED },
  });

  const title = (slide: Slide, text: string, sub?: string) => {
    slide.addText(text, { x: 0.5, y: 0.35, w: 12.33, h: 0.6, fontFace: FONT, fontSize: 26, bold: true, color: NAVY });
    if (sub) slide.addText(sub, { x: 0.5, y: 0.92, w: 12.33, h: 0.4, fontFace: FONT, fontSize: 13, color: MUTED });
  };
  const none = (slide: Slide, x: number, y: number, w: number) =>
    slide.addText(t.reports.none, { x, y, w, h: 0.4, fontFace: FONT, fontSize: 13, color: MUTED });
  const header = (cells: string[]): Cell[] => cells.map((text) => ({ text, options: { bold: true, color: INK, fill: { color: SURFACE } } }));
  const table = (slide: Slide, rows: Cell[][], x: number, y: number, w: number, colW: number[]) =>
    slide.addTable(rows, { x, y, w, colW, fontFace: FONT, fontSize: 11, color: INK, border: { type: "solid", pt: 0.5, color: LINE }, rowH: 0.34, autoPage: false });
  const chartBase = {
    fontFace: FONT,
    catAxisLabelFontSize: 11,
    valAxisLabelFontSize: 10,
    catAxisLabelColor: MUTED,
    valAxisLabelColor: MUTED,
    valGridLine: { color: LINE, size: 0.5 },
    dataLabelFontSize: 10,
    dataLabelColor: INK,
    showValue: true,
    legendFontSize: 11,
  };
  const bars = (slide: Slide, rows: { name: string; n: number }[], x: number, y: number, w: number, h: number, color: string) => {
    if (!rows.length) return none(slide, x, y, w);
    const top = rows.slice(0, 8).reverse(); // largest on top
    slide.addChart(pptx.ChartType.bar, [{ name: "", labels: top.map((d) => d.name), values: top.map((d) => d.n) }], {
      ...chartBase,
      x,
      y,
      w,
      h,
      barDir: "bar",
      chartColors: [color],
      showLegend: false,
      valAxisHidden: true,
      valGridLine: { style: "none" },
    });
  };

  // 1. Cover
  {
    const s = pptx.addSlide();
    s.background = { color: NAVY };
    s.addShape(pptx.ShapeType.rect, { x: 0, y: 6.9, w: 13.33, h: 0.6, fill: { color: TEAL } });
    if (logo) {
      // A white card so any logo reads on the navy cover.
      const size = fit(logo, 2.6, 1.3);
      s.addShape(pptx.ShapeType.roundRect, { x: 0.8, y: 0.8, w: size.w + 0.5, h: size.h + 0.5, fill: { color: "FFFFFF" }, rectRadius: 0.12 });
      s.addImage({ data: logo.data, x: 1.05, y: 1.05, w: size.w, h: size.h });
    }
    s.addText(r.hospital.name, { x: 0.8, y: 2.85, w: 11.5, h: 0.7, fontFace: FONT, fontSize: 30, bold: true, color: "FFFFFF" });
    s.addText(t.reports.coverTitle, { x: 0.8, y: 3.55, w: 11.5, h: 0.6, fontFace: FONT, fontSize: 22, color: "FFFFFF" });
    s.addText(t.reports.periodLine(periodText), { x: 0.8, y: 4.45, w: 11.5, h: 0.45, fontFace: FONT, fontSize: 16, color: "D9E6EC" });
    s.addText(`${r.hospital.departmentName}  ·  ${t.reports.prepared(formatDate(new Date(r.generatedAt).toISOString().slice(0, 10), mode))}`, {
      x: 0.8,
      y: 4.95,
      w: 11.5,
      h: 0.4,
      fontFace: FONT,
      fontSize: 13,
      color: "D9E6EC",
    });
  }

  // 2. Key figures
  {
    const s = pptx.addSlide({ masterName: "BODY" });
    title(s, t.reports.keyFigures, r.period.running ? t.reports.running : undefined);
    const b = r.breakdowns;
    const tiles: [string, string, string, string][] = [
      [t.reports.tiles.equipment, String(r.equipment.total), t.reports.addedN(r.equipment.added), NAVY],
      [t.reports.tiles.uptime, t.reports.percent(b.uptimePct), t.reports.downtime(b.downtimeDays), C.ok],
      [t.reports.tiles.reported, String(b.reported), t.reports.fromStaff(b.fromStaff), C.bad],
      [t.reports.tiles.fixed, String(b.fixed), t.reports.fixedSplit(b.fixedInHouse, b.fixedByProvider), C.ok],
      [t.reports.tiles.medianFix, b.medianFixHours === null ? "-" : t.reports.hours(b.medianFixHours), b.averageFixHours === null ? "" : t.reports.averageFix(t.reports.hours(b.averageFixHours)), NAVY],
      [t.reports.tiles.openAtEnd, String(b.openAtEnd), t.reports.notRepairable(b.notRepairable), C.wait],
      [t.reports.tiles.pmsDone, t.reports.percent(r.pms.compliancePct), t.reports.ofDue(r.pms.done, r.pms.due), C.two],
      [t.reports.tiles.covered, t.reports.percent(r.coverage.coveredPct), `${r.coverage.covered} of ${r.equipment.total}`, C.one],
    ];
    tiles.forEach(([label, value, sub, color], i) => {
      const x = 0.5 + (i % 4) * 3.1;
      const y = 1.55 + Math.floor(i / 4) * 2.55;
      s.addShape(pptx.ShapeType.rect, { x, y, w: 2.9, h: 2.25, fill: { color: "FFFFFF" }, line: { color: LINE, width: 0.75 } });
      s.addShape(pptx.ShapeType.rect, { x, y, w: 0.09, h: 2.25, fill: { color } });
      s.addText(label, { x: x + 0.25, y: y + 0.2, w: 2.55, h: 0.4, fontFace: FONT, fontSize: 13, color: MUTED });
      s.addText(value, { x: x + 0.25, y: y + 0.65, w: 2.55, h: 0.85, fontFace: FONT, fontSize: 36, bold: true, color: NAVY });
      s.addText(sub, { x: x + 0.25, y: y + 1.5, w: 2.55, h: 0.6, fontFace: FONT, fontSize: 11, color: MUTED, valign: "top" });
    });
  }

  // 3. Highlights
  {
    const s = pptx.addSlide({ masterName: "BODY" });
    title(s, t.reports.highlights);
    s.addText(
      highlights(r).map((text) => ({ text, options: { bullet: { indent: 18 }, paraSpaceAfter: 10 } })),
      { x: 0.6, y: 1.4, w: 12.1, h: 5.3, fontFace: FONT, fontSize: 17, color: INK, valign: "top" },
    );
  }

  // 4. Breakdowns per month
  {
    const s = pptx.addSlide({ masterName: "BODY" });
    title(s, t.reports.perMonth, `${t.reports.reported}: ${r.breakdowns.reported}  ·  ${t.reports.fixedLabel}: ${r.breakdowns.fixed}`);
    const labels = r.perMonth.map((m) => m.label);
    s.addChart(
      pptx.ChartType.bar,
      [
        { name: t.reports.reported, labels, values: r.perMonth.map((m) => m.reported) },
        { name: t.reports.fixedLabel, labels, values: r.perMonth.map((m) => m.fixed) },
      ],
      { ...chartBase, x: 0.5, y: 1.45, w: 12.33, h: 5.3, barDir: "col", barGrouping: "clustered", chartColors: [NAVY, TEAL], showLegend: true, legendPos: "b" },
    );
  }

  // 5. Where breakdowns happened
  {
    const s = pptx.addSlide({ masterName: "BODY" });
    title(s, t.reports.breakdowns);
    s.addText(t.reports.byDepartment, { x: 0.5, y: 1.3, w: 6, h: 0.4, fontFace: FONT, fontSize: 15, bold: true, color: INK });
    s.addText(t.reports.byType, { x: 6.85, y: 1.3, w: 6, h: 0.4, fontFace: FONT, fontSize: 15, bold: true, color: INK });
    bars(s, r.breakdowns.byDepartment, 0.5, 1.8, 6, 4.9, NAVY);
    bars(s, r.breakdowns.byType, 6.85, 1.8, 6, 4.9, C.two);
  }

  // 6. Service providers
  {
    const s = pptx.addSlide({ masterName: "BODY" });
    title(s, t.reports.providers);
    const rows = providerRows(r);
    if (!rows.length) none(s, 0.5, 1.5, 12);
    else
      table(
        s,
        [
          header([t.reports.col.provider, t.reports.col.reported, t.reports.col.fixed, t.reports.col.medianFix, t.reports.col.pmsDue, t.reports.col.pmsDone]),
          ...rows.slice(0, 12).map((p) => [
            { text: p.name },
            { text: String(p.reported) },
            { text: String(p.fixed) },
            { text: p.medianFixHours === null ? "-" : t.reports.hours(p.medianFixHours) },
            { text: String(p.pmsDue) },
            { text: `${p.pmsDone}${p.compliance === null ? "" : ` (${p.compliance}%)`}` },
          ]),
        ],
        0.5,
        1.5,
        12.33,
        [4.33, 1.4, 1.4, 2.0, 1.4, 1.8],
      );
  }

  // 7. Needs attention: repeated and long-open breakdowns
  {
    const s = pptx.addSlide({ masterName: "BODY" });
    title(s, t.reports.repeat);
    const b = r.breakdowns;
    if (!b.repeat.length) none(s, 0.5, 1.5, 6);
    else
      table(
        s,
        [header([t.reports.col.equipment, t.reports.col.serial, t.reports.col.times]), ...b.repeat.slice(0, 8).map((x) => [{ text: x.label }, { text: x.serialNumber }, { text: String(x.n) }])],
        0.5,
        1.5,
        6,
        [3.4, 1.6, 1.0],
      );
    s.addText(t.reports.longestOpen, { x: 6.85, y: 0.35, w: 6, h: 0.6, fontFace: FONT, fontSize: 26, bold: true, color: NAVY });
    if (!b.longestOpen.length) none(s, 6.85, 1.5, 6);
    else
      table(
        s,
        [header([t.reports.col.breakdown, t.reports.col.equipment, t.reports.col.daysOpen]), ...b.longestOpen.map((x) => [{ text: x.numberText }, { text: x.label }, { text: String(x.days) }])],
        6.85,
        1.5,
        6,
        [1.3, 3.5, 1.2],
      );
  }

  // 8. PMS
  {
    const s = pptx.addSlide({ masterName: "BODY" });
    const p = r.pms;
    title(s, t.reports.pms, `${t.reports.tiles.pmsDone}: ${t.reports.percent(p.compliancePct)} (${t.reports.ofDue(p.done, p.due)})`);
    s.addChart(
      pptx.ChartType.bar,
      [{ name: t.reports.pmsResult, labels: [t.reports.onTime, t.reports.late, t.reports.missed, t.reports.notYet], values: [p.onTime, p.late, p.missed, Math.max(0, p.due - p.done - p.missed)] }],
      { ...chartBase, x: 0.5, y: 1.45, w: 5.6, h: 5.2, barDir: "col", chartColors: [C.ok, C.wait, C.bad, C.off], showLegend: false },
    );
    const labels = r.perMonth.map((m) => m.label);
    s.addChart(
      pptx.ChartType.bar,
      [
        { name: t.reports.due, labels, values: r.perMonth.map((m) => m.pmsDue) },
        { name: t.reports.done, labels, values: r.perMonth.map((m) => m.pmsDone) },
      ],
      { ...chartBase, x: 6.5, y: 1.45, w: 6.33, h: 5.2, barDir: "col", barGrouping: "clustered", chartColors: [C.off, C.two], showLegend: true, legendPos: "b" },
    );
  }

  // 9. Coverage
  {
    const s = pptx.addSlide({ masterName: "BODY" });
    const c = r.coverage;
    title(s, t.reports.coverage, t.reports.coverageMoves(c.started, c.ended));
    s.addChart(
      pptx.ChartType.bar,
      [{ name: t.reports.coverageMix, labels: [t.coverageType.warranty, t.coverageType.amc, t.coverageType.cmc, t.home.noCoverage], values: [c.mix.warranty, c.mix.amc, c.mix.cmc, c.mix.none] }],
      { ...chartBase, x: 0.5, y: 1.45, w: 5.2, h: 5.2, barDir: "col", chartColors: [C.one, C.two, C.three, C.off], showLegend: false },
    );
    s.addText(t.reports.endingNext, { x: 6.1, y: 1.4, w: 6.7, h: 0.4, fontFace: FONT, fontSize: 15, bold: true, color: INK });
    if (!c.endingNext.length) none(s, 6.1, 1.9, 6.7);
    else
      table(
        s,
        [
          header([t.reports.col.equipment, t.reports.col.type, t.reports.col.lastDay]),
          ...c.endingNext.slice(0, 10).map((x) => [{ text: `${x.label}, S.N. ${x.serialNumber}` }, { text: t.coverageType[x.type] }, { text: formatDate(x.lastDay, mode) }]),
        ],
        6.1,
        1.9,
        6.73,
        [4.0, 1.0, 1.73],
      );
  }

  // 10. Equipment
  {
    const s = pptx.addSlide({ masterName: "BODY" });
    const e = r.equipment;
    title(s, t.reports.equipment, `${t.reports.tiles.equipment}: ${e.total}  ·  ${t.reports.addedN(e.added)}`);
    s.addText(t.reports.statusNow, { x: 0.5, y: 1.4, w: 4, h: 0.4, fontFace: FONT, fontSize: 15, bold: true, color: INK });
    s.addChart(
      pptx.ChartType.bar,
      [{ name: t.reports.statusNow, labels: [t.status.equipment.working, t.status.equipment.breakdown, t.status.equipment.out_of_service], values: [e.statusNow.working, e.statusNow.breakdown, e.statusNow.out_of_service] }],
      { ...chartBase, x: 0.5, y: 1.85, w: 4.0, h: 4.8, barDir: "col", chartColors: [C.ok, C.bad, C.off], showLegend: false },
    );
    s.addText(t.reports.equipmentByDept, { x: 4.9, y: 1.4, w: 7.9, h: 0.4, fontFace: FONT, fontSize: 15, bold: true, color: INK });
    bars(s, e.byDepartment, 4.9, 1.85, 7.93, 4.8, NAVY);
  }

  // 11. Added equipment and other activity
  {
    const s = pptx.addSlide({ masterName: "BODY" });
    const e = r.equipment;
    title(s, t.reports.added);
    if (!e.addedList.length) none(s, 0.5, 1.5, 7.6);
    else
      table(
        s,
        [
          header([t.reports.col.equipment, t.reports.col.serial, t.reports.col.department, t.reports.col.installed]),
          ...e.addedList.slice(0, 12).map((x) => [{ text: x.label }, { text: x.serialNumber }, { text: x.department }, { text: formatDate(x.installedOn, mode) }]),
        ],
        0.5,
        1.5,
        7.8,
        [3.4, 1.5, 1.5, 1.4],
      );
    const a = r.activity;
    s.addShape(pptx.ShapeType.rect, { x: 8.7, y: 1.5, w: 4.13, h: 3.1, fill: { color: SURFACE }, line: { color: LINE, width: 0.75 } });
    s.addText(t.reports.activity, { x: 8.95, y: 1.65, w: 3.7, h: 0.4, fontFace: FONT, fontSize: 15, bold: true, color: INK });
    s.addText(
      [t.reports.moves(a.moves, a.temporaryMoves, a.permanentMoves), t.reports.emails(a.emailsSent), t.reports.reminders(a.pmsReminders), ...(a.emailsFailed ? [t.reports.emailsFailed(a.emailsFailed)] : [])].map((text) => ({
        text,
        options: { bullet: true, paraSpaceAfter: 8 },
      })),
      { x: 8.95, y: 2.1, w: 3.7, h: 2.4, fontFace: FONT, fontSize: 13, color: INK, valign: "top" },
    );
  }

  await pptx.writeFile({ fileName: `${r.hospital.name} - ${t.reports.coverTitle} - ${r.period.from} to ${r.period.to}.pptx` });
}
