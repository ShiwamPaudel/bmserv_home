// Reports: choose a period, see what happened in the Biomedical Department, download it as PDF (print)
// or PowerPoint. Built for the monthly management report and monthly, quarterly or annual meetings.
import { useEffect, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { FileDown, Presentation } from "lucide-react";
import { formatDate, todayNepal } from "@bmserv/shared/dates";
import { t } from "@bmserv/shared/terms";
import { get } from "../lib/api";
import { useMe, useTitle } from "../lib/hooks";
import { highlights, providerRows, type ReportData } from "../lib/reportInsights";
import { presetLabel, presetRange, presets, rangeText, type Preset } from "../lib/reportRange";
import { DateField } from "../components/DateField";
import { BarList, ChartCard, SegmentBar, StatTile } from "../components/charts";
import { iconProps, LoadError, Loading, Notice, PageHead } from "../components/ui";

export function ReportsScreen() {
  useTitle(t.reports.title);
  const me = useMe();
  const mode = me.data?.hospital.dateDisplay ?? "bs";
  const [params, setParams] = useSearchParams();
  const preset = ((params.get("p") as Preset | null) ?? "thisMonth") satisfies Preset;
  const custom = preset === "custom";
  const range = custom ? { from: params.get("from") ?? "", to: params.get("to") ?? "" } : presetRange(preset, mode);
  const [draft, setDraft] = useState<{ from: string | null; to: string | null }>({ from: range.from || null, to: range.to || null });
  const ready = !!range.from && !!range.to;
  const q = useQuery({
    queryKey: ["reports", range.from, range.to],
    queryFn: () => get<ReportData>(`/reports?from=${range.from}&to=${range.to}`),
    enabled: ready,
  });
  const [pptBusy, setPptBusy] = useState(false);
  const [pptError, setPptError] = useState<string | null>(null);
  const periodText = ready ? rangeText(range, mode) : "";

  async function pdf() {
    if (!q.data) return;
    // The PDF's file name comes from the page title.
    const before = document.title;
    document.title = `${q.data.hospital.name} - ${t.reports.coverTitle} - ${range.from} to ${range.to}`;
    window.addEventListener("afterprint", () => (document.title = before), { once: true });
    window.print();
  }

  async function ppt() {
    if (!q.data) return;
    setPptBusy(true);
    setPptError(null);
    try {
      const { downloadReportPptx } = await import("../lib/reportPptx");
      await downloadReportPptx(q.data, periodText);
    } catch (e) {
      console.error(e);
      setPptError(t.reports.pptFailed);
    } finally {
      setPptBusy(false);
    }
  }

  return (
    <div className="report-screen">
      <div className="no-print">
        <PageHead title={t.reports.title}>
          <div className="report-exports">
            <button className="btn" type="button" onClick={() => void pdf()} disabled={!q.data}>
              <FileDown {...iconProps} size={18} />
              {t.reports.exportPdf}
            </button>
            <button className="btn primary" type="button" onClick={() => void ppt()} disabled={!q.data || pptBusy}>
              <Presentation {...iconProps} size={18} />
              {pptBusy ? t.reports.preparing : t.reports.exportPpt}
            </button>
          </div>
        </PageHead>
        <div className="report-range" role="group" aria-label={t.reports.period}>
          {[...presets, "custom" as const].map((p) => (
            <button
              key={p}
              type="button"
              className="chip"
              aria-pressed={preset === p}
              onClick={() => setParams(p === "custom" ? { p, from: range.from, to: range.to } : { p }, { replace: true })}
            >
              {presetLabel(p, mode)}
            </button>
          ))}
        </div>
        {custom && (
          <form
            className="report-custom"
            onSubmit={(e) => {
              e.preventDefault();
              if (draft.from && draft.to) setParams({ p: "custom", from: draft.from, to: draft.to }, { replace: true });
            }}
          >
            <DateField label={t.reports.from} value={draft.from} onChange={(v) => setDraft({ ...draft, from: v })} />
            <DateField label={t.reports.to} value={draft.to} onChange={(v) => setDraft({ ...draft, to: v })} />
            <div>
              <button className="btn" type="submit" disabled={!draft.from || !draft.to}>
                {t.reports.show}
              </button>
            </div>
          </form>
        )}
        {pptError && <Notice tone="bad">{pptError}</Notice>}
        <p className="help" style={{ margin: "8px 0 16px" }}>
          {t.reports.pdfHelp}
        </p>
      </div>

      {!ready ? null : q.isLoading ? (
        <Loading />
      ) : q.error || !q.data ? (
        <LoadError error={q.error} retry={() => void q.refetch()} />
      ) : (
        <Report r={q.data} periodText={periodText} />
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="report-section">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function Table({ head, rows, empty }: { head: string[]; rows: ReactNode[][]; empty?: string }) {
  if (!rows.length) return <p className="muted">{empty ?? t.reports.none}</p>;
  return (
    <div className="report-table-wrap">
      <table className="report-table">
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Two series per month (reported and fixed, or due and done), side by side. */
function PairColumns({ data, a, b }: { data: { key: string; label: string; a: number; b: number }[]; a: string; b: string }) {
  const max = Math.max(1, ...data.flatMap((d) => [d.a, d.b]));
  return (
    <div>
      <div className="pair-cols" role="img" aria-label={data.map((d) => `${d.label}: ${a} ${d.a}, ${b} ${d.b}`).join("; ")}>
        {data.map((d) => (
          <div className="pair-col" key={d.key}>
            <div className="pair-track">
              <span className="pair-bar a" style={{ height: `${(d.a / max) * 100}%` }} data-tip={`${d.label}: ${a} ${d.a}`}>
                {d.a > 0 && <i>{d.a}</i>}
              </span>
              <span className="pair-bar b" style={{ height: `${(d.b / max) * 100}%` }} data-tip={`${d.label}: ${b} ${d.b}`}>
                {d.b > 0 && <i>{d.b}</i>}
              </span>
            </div>
            <span className="col-label">{d.label}</span>
          </div>
        ))}
      </div>
      <ul className="legend" style={{ marginTop: 8 }}>
        <li>
          <span className="swatch" style={{ background: "var(--chart-bar)" }} aria-hidden="true" />
          <span className="legend-label">{a}</span>
        </li>
        <li>
          <span className="swatch" style={{ background: "var(--teal)" }} aria-hidden="true" />
          <span className="legend-label">{b}</span>
        </li>
      </ul>
    </div>
  );
}

function Report({ r, periodText }: { r: ReportData; periodText: string }) {
  const mode = r.hospital.dateDisplay;
  const b = r.breakdowns;
  const p = r.pms;
  const c = r.coverage;
  const e = r.equipment;
  const hours = (h: number | null) => (h === null ? "-" : t.reports.hours(h));
  const [logoOk, setLogoOk] = useState(true);
  useEffect(() => setLogoOk(true), [r.hospital.logoFileId]);

  return (
    <article className="report">
      <header className="report-cover">
        {r.hospital.logoFileId && logoOk && (
          <img className="report-logo" src={`/api/files/${r.hospital.logoFileId}/image`} alt="" onError={() => setLogoOk(false)} />
        )}
        <div>
          <div className="report-hospital">{r.hospital.name}</div>
          <h1 className="report-title">{t.reports.coverTitle}</h1>
          <div className="report-period">{t.reports.periodLine(periodText)}</div>
          <div className="muted secondary">
            {r.hospital.departmentName}, {t.reports.prepared(formatDate(todayNepal(r.generatedAt), mode))}
          </div>
        </div>
      </header>
      {r.period.running && <Notice tone="wait">{t.reports.running}</Notice>}

      <Section title={t.reports.keyFigures}>
        <div className="stat-grid report-stats">
          <StatTile label={t.reports.tiles.equipment} value={e.total} sub={t.reports.addedN(e.added)} />
          <StatTile label={t.reports.tiles.uptime} value={t.reports.percent(b.uptimePct)} sub={t.reports.downtime(b.downtimeDays)} tone="ok" />
          <StatTile label={t.reports.tiles.reported} value={b.reported} sub={t.reports.fromStaff(b.fromStaff)} tone={b.reported ? "bad" : "neutral"} />
          <StatTile label={t.reports.tiles.fixed} value={b.fixed} sub={t.reports.fixedSplit(b.fixedInHouse, b.fixedByProvider)} tone="ok" />
          <StatTile label={t.reports.tiles.medianFix} value={hours(b.medianFixHours)} sub={b.averageFixHours === null ? undefined : t.reports.averageFix(hours(b.averageFixHours))} />
          <StatTile label={t.reports.tiles.openAtEnd} value={b.openAtEnd} sub={t.reports.notRepairable(b.notRepairable)} tone={b.openAtEnd ? "wait" : "neutral"} />
          <StatTile label={t.reports.tiles.pmsDone} value={t.reports.percent(p.compliancePct)} sub={t.reports.ofDue(p.done, p.due)} tone={p.missed ? "wait" : "ok"} />
          <StatTile label={t.reports.tiles.covered} value={t.reports.percent(c.coveredPct)} sub={`${c.covered} of ${e.total}`} />
        </div>
      </Section>

      <Section title={t.reports.highlights}>
        <ul className="report-highlights">
          {highlights(r).map((h) => (
            <li key={h}>{h}</li>
          ))}
        </ul>
      </Section>

      <Section title={t.reports.breakdowns}>
        <div className="chart-grid">
          <ChartCard title={t.reports.perMonth} wide>
            <PairColumns data={r.perMonth.map((m) => ({ key: m.key, label: m.label, a: m.reported, b: m.fixed }))} a={t.reports.reported} b={t.reports.fixedLabel} />
          </ChartCard>
          <ChartCard title={t.reports.byDepartment}>
            <BarList rows={b.byDepartment.map((d) => ({ key: d.name, label: d.name, value: d.n }))} emptyText={t.reports.none} />
          </ChartCard>
          <ChartCard title={t.reports.byType}>
            <BarList rows={b.byType.map((d) => ({ key: d.name, label: d.name, value: d.n }))} emptyText={t.reports.none} />
          </ChartCard>
          <ChartCard title={t.reports.repeat}>
            <Table head={[t.reports.col.equipment, t.reports.col.serial, t.reports.col.department, t.reports.col.times]} rows={b.repeat.map((x) => [x.label, <span className="serial">{x.serialNumber}</span>, x.department, x.n])} />
          </ChartCard>
          <ChartCard title={t.reports.longestOpen}>
            <Table head={[t.reports.col.breakdown, t.reports.col.equipment, t.reports.col.department, t.reports.col.daysOpen]} rows={b.longestOpen.map((x) => [x.numberText, x.label, x.department, x.days])} />
          </ChartCard>
        </div>
      </Section>

      <Section title={t.reports.providers}>
        <Table
          head={[t.reports.col.provider, t.reports.col.reported, t.reports.col.fixed, t.reports.col.medianFix, t.reports.col.pmsDue, t.reports.col.pmsDone]}
          rows={providerRows(r).map((x) => [x.name, x.reported, x.fixed, hours(x.medianFixHours), x.pmsDue, `${x.pmsDone}${x.compliance === null ? "" : ` (${x.compliance}%)`}`])}
        />
      </Section>

      <Section title={t.reports.pms}>
        <div className="chart-grid">
          <ChartCard title={t.reports.pmsResult}>
            <SegmentBar
              emptyText={t.reports.none}
              segments={[
                { key: "ontime", label: t.reports.onTime, value: p.onTime, color: "var(--chart-ok)" },
                { key: "late", label: t.reports.late, value: p.late, color: "var(--chart-wait)" },
                { key: "missed", label: t.reports.missed, value: p.missed, color: "var(--chart-bad)" },
                { key: "open", label: t.reports.notYet, value: Math.max(0, p.due - p.done - p.missed), color: "var(--chart-off)" },
              ]}
            />
          </ChartCard>
          <ChartCard title={t.reports.pmsPerMonth}>
            <PairColumns data={r.perMonth.map((m) => ({ key: m.key, label: m.label, a: m.pmsDue, b: m.pmsDone }))} a={t.reports.due} b={t.reports.done} />
          </ChartCard>
        </div>
      </Section>

      <Section title={t.reports.coverage}>
        <div className="chart-grid">
          <ChartCard title={t.reports.coverageMix} help={t.reports.coverageMoves(c.started, c.ended)}>
            <SegmentBar
              emptyText={t.reports.none}
              segments={[
                { key: "warranty", label: t.coverageType.warranty, value: c.mix.warranty, color: "var(--chart-1)" },
                { key: "amc", label: t.coverageType.amc, value: c.mix.amc, color: "var(--chart-2)" },
                { key: "cmc", label: t.coverageType.cmc, value: c.mix.cmc, color: "var(--chart-3)" },
                { key: "none", label: t.home.noCoverage, value: c.mix.none, color: "var(--chart-none)" },
              ]}
            />
          </ChartCard>
          <ChartCard title={t.reports.endingNext}>
            <Table
              head={[t.reports.col.equipment, t.reports.col.type, t.reports.col.lastDay]}
              rows={c.endingNext.map((x) => [
                <>
                  {x.label}, <span className="serial">S.N. {x.serialNumber}</span>
                </>,
                t.coverageType[x.type],
                formatDate(x.lastDay, mode),
              ])}
            />
          </ChartCard>
        </div>
      </Section>

      <Section title={t.reports.equipment}>
        <div className="chart-grid">
          <ChartCard title={t.reports.statusNow} help={t.reports.atEnd}>
            <SegmentBar
              emptyText={t.reports.none}
              segments={[
                { key: "working", label: t.status.equipment.working, value: e.statusNow.working, color: "var(--chart-ok)" },
                { key: "breakdown", label: t.status.equipment.breakdown, value: e.statusNow.breakdown, color: "var(--chart-bad)" },
                { key: "oos", label: t.status.equipment.out_of_service, value: e.statusNow.out_of_service, color: "var(--chart-off)" },
              ]}
            />
          </ChartCard>
          <ChartCard title={t.reports.equipmentByDept}>
            <BarList rows={e.byDepartment.map((d) => ({ key: d.name, label: d.name, value: d.n }))} emptyText={t.reports.none} />
          </ChartCard>
          <ChartCard title={t.reports.added} wide>
            <Table
              head={[t.reports.col.equipment, t.reports.col.serial, t.reports.col.department, t.reports.col.installed]}
              rows={e.addedList.map((x) => [x.label, <span className="serial">{x.serialNumber}</span>, x.department, formatDate(x.installedOn, mode)])}
            />
          </ChartCard>
        </div>
      </Section>

      <Section title={t.reports.activity}>
        <ul className="report-highlights">
          <li>{t.reports.moves(r.activity.moves, r.activity.temporaryMoves, r.activity.permanentMoves)}</li>
          <li>{t.reports.emails(r.activity.emailsSent)}</li>
          <li>{t.reports.reminders(r.activity.pmsReminders)}</li>
          {r.activity.emailsFailed > 0 && <li>{t.reports.emailsFailed(r.activity.emailsFailed)}</li>}
        </ul>
      </Section>
    </article>
  );
}
