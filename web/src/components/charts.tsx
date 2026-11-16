// Small charts for Home, in plain HTML and CSS (no chart library). Colours come from tokens.css:
// status fills for equipment state, one navy hue for counts, a validated 3-slot palette for coverage.
import type { ReactNode } from "react";
import { Link } from "react-router";

export type Tone = "neutral" | "ok" | "bad" | "wait" | "off";

/** One headline number. A tile, not a chart. */
export function StatTile({ label, value, sub, tone = "neutral", to }: { label: string; value: ReactNode; sub?: ReactNode; tone?: Tone; to?: string }) {
  const body = (
    <>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {sub && <span className="stat-sub">{sub}</span>}
    </>
  );
  return to ? (
    <Link className={`stat-tile ${tone}`} to={to}>
      {body}
    </Link>
  ) : (
    <div className={`stat-tile ${tone}`}>{body}</div>
  );
}

export function ChartCard({ title, help, children, wide }: { title: string; help?: string; children: ReactNode; wide?: boolean }) {
  return (
    <section className={`chart-card${wide ? " wide" : ""}`}>
      <h3>{title}</h3>
      {help && <p className="chart-help">{help}</p>}
      {children}
    </section>
  );
}

export type Segment = { key: string; label: string; value: number; color: string; to?: string };

const pct = (n: number, total: number) => (total ? Math.round((n / total) * 100) : 0);

/** Parts of a whole: one bar split into segments, with a legend that always shows the numbers. */
export function SegmentBar({ segments, emptyText }: { segments: Segment[]; emptyText: string }) {
  const total = segments.reduce((a, s) => a + s.value, 0);
  if (!total) return <p className="chart-empty">{emptyText}</p>;
  const summary = segments.map((s) => `${s.label} ${s.value}`).join(", ");
  return (
    <div>
      <div className="segbar" role="img" aria-label={summary}>
        {segments
          .filter((s) => s.value > 0)
          .map((s) => (
            <span
              key={s.key}
              className="seg"
              style={{ flexGrow: s.value, background: s.color }}
              data-tip={`${s.label}: ${s.value} (${pct(s.value, total)}%)`}
              tabIndex={0}
            />
          ))}
      </div>
      <ul className="legend">
        {segments.map((s) => {
          const inner = (
            <>
              <span className="swatch" style={{ background: s.color }} aria-hidden="true" />
              <span className="legend-label">{s.label}</span>
              <span className="legend-value">
                {s.value} <span className="muted">({pct(s.value, total)}%)</span>
              </span>
            </>
          );
          return <li key={s.key}>{s.to ? <Link to={s.to}>{inner}</Link> : inner}</li>;
        })}
      </ul>
    </div>
  );
}

/** Counts over time: one column per month, one hue. The latest month is labelled; the rest on hover. */
export function Columns({ data, unit }: { data: { key: string; label: string; n: number }[]; unit: (n: number) => string }) {
  const max = Math.max(1, ...data.map((d) => d.n));
  return (
    <div className="columns" role="img" aria-label={data.map((d) => `${d.label} ${d.n}`).join(", ")}>
      {data.map((d, i) => (
        <div className="col" key={d.key}>
          <div className="col-track">
            {(i === data.length - 1 || d.n === max) && d.n > 0 && <span className="col-value">{d.n}</span>}
            <span className="col-bar" style={{ height: `${(d.n / max) * 100}%` }} data-tip={`${d.label}: ${unit(d.n)}`} tabIndex={0} />
          </div>
          <span className="col-label">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

/** Ranked horizontal bars (departments, models). `part` is drawn inside the bar in the alert colour. */
export function BarList({
  rows,
  partLabel,
  emptyText,
}: {
  rows: { key: string; label: string; value: number; part?: number; to?: string }[];
  partLabel?: string;
  emptyText: string;
}) {
  if (!rows.length) return <p className="chart-empty">{emptyText}</p>;
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="barlist">
      {rows.map((r) => {
        const label = r.to ? <Link to={r.to}>{r.label}</Link> : r.label;
        return (
          <li key={r.key}>
            <div className="barlist-head">
              <span className="barlist-label">{label}</span>
              <span className="barlist-value">
                {r.value}
                {partLabel && r.part ? <span className="barlist-part">, {r.part} {partLabel.toLowerCase()}</span> : null}
              </span>
            </div>
            <div className="barlist-track" aria-hidden="true">
              <span className="barlist-bar" style={{ width: `${(r.value / max) * 100}%` }}>
                {r.part ? <span className="barlist-bar-part" style={{ width: `${(r.part / r.value) * 100}%` }} /> : null}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
