import { useQuery } from "@tanstack/react-query";
import { daysBetween, durationParts } from "@bmserv/shared/dates";
import { t } from "@bmserv/shared/terms";
import { get } from "../lib/api";
import { useMe, useTitle } from "../lib/hooks";
import { qk } from "../lib/queryKeys";
import type { HomeData } from "../lib/types";
import { DateText, downFor, nearDate } from "../lib/dates";
import { EquipmentLine } from "../components/EquipmentLine";
import { BarList, ChartCard, Columns, SegmentBar, StatTile } from "../components/charts";
import { BreakdownStatusPill, LoadError, Loading, PageHead, Pill, Rows, Section } from "../components/ui";
import { pmsLabel } from "./Pms";

/** Overview numbers and charts, then what needs attention in PRD F13 order. */
export function Home() {
  useTitle(t.home.title);
  const me = useMe();
  const q = useQuery({ queryKey: qk.home, queryFn: () => get<HomeData>("/home"), refetchInterval: 5 * 60_000 });
  if (q.isLoading) return <Loading />;
  if (q.error || !q.data) return <LoadError error={q.error} retry={() => void q.refetch()} />;
  const d = q.data;
  const myId = me.data?.user.id;
  const nothing =
    !d.down.length && !d.pausedLong.length && !d.pmsOverdue.length && !d.pmsThisWeek.length && !d.toReturn.length && !d.coverageEnding.length;

  return (
    <>
      <PageHead title={me.data?.hospital.name ?? t.home.title} />
      <Overview d={d} />
      <h2 className="home-heading">{t.home.needsAttention}</h2>
      {nothing && <p className="empty">{t.home.allClear}</p>}

      {d.down.length > 0 && (
        <Section title={t.home.downNow}>
          <Rows isEmpty={false} empty="">
            {d.down.map((b) => (
              <EquipmentLine
                key={b.id}
                e={b.equipment}
                to={`/breakdowns/${b.id}`}
                extra={
                  <>
                    <span className="serial">{b.numberText}</span>
                    <span className="sep">{downFor(b.reportedAt, null)}</span>
                    <span className="sep">
                      {b.assignedName}
                      {b.assignedTo === myId && ` (${t.home.mine})`}
                    </span>
                  </>
                }
                side={<BreakdownStatusPill status={b.status} paused={b.pausedAt !== null} />}
              />
            ))}
          </Rows>
        </Section>
      )}

      {d.pausedLong.length > 0 && (
        <Section title={t.home.pausedLong}>
          <Rows isEmpty={false} empty="">
            {d.pausedLong.map((b) => (
              <EquipmentLine
                key={b.id}
                e={b.equipment}
                to={`/breakdowns/${b.id}`}
                extra={
                  <>
                    <span className="serial">{b.numberText}</span>
                    <span className="sep">
                      {b.pauseReason ? t.pauseReason[b.pauseReason] : ""}, {t.dates.daysAgo(Math.floor((Date.now() - (b.pausedAt ?? 0)) / 86_400_000))}
                    </span>
                  </>
                }
                side={<Pill tone="wait">{t.status.paused}</Pill>}
              />
            ))}
          </Rows>
        </Section>
      )}

      {d.pmsOverdue.length > 0 && (
        <Section title={t.home.pmsOverdue}>
          <Rows isEmpty={false} empty="">
            {d.pmsOverdue.map((v) => (
              <EquipmentLine
                key={v.id}
                e={v.equipment}
                extra={
                  <>
                    {pmsLabel(v)}, <DateText ad={v.dueOn} />, {nearDate(v.dueOn, d.today)}
                  </>
                }
                side={<Pill tone="bad">{t.status.pmsOverdue}</Pill>}
              />
            ))}
          </Rows>
        </Section>
      )}

      {d.pmsThisWeek.length > 0 && (
        <Section title={t.home.pmsSoon(d.pmsSoonDays)}>
          <Rows isEmpty={false} empty="">
            {d.pmsThisWeek.map((v) => (
              <EquipmentLine
                key={v.id}
                e={v.equipment}
                extra={
                  <>
                    {pmsLabel(v)}, <DateText ad={v.dueOn} />, {nearDate(v.dueOn, d.today)}
                  </>
                }
                side={<Pill tone="wait">{t.status.pmsDueSoon}</Pill>}
              />
            ))}
          </Rows>
        </Section>
      )}

      {d.toReturn.length > 0 && (
        <Section title={t.home.toReturn}>
          <Rows isEmpty={false} empty="">
            {d.toReturn.map((m) => (
              <EquipmentLine
                key={m.id}
                e={m.equipment}
                extra={
                  <>
                    {t.departments.expectedReturn}: <DateText ad={m.expectedReturnOn} />.{" "}
                    {m.expectedReturnOn && t.moves.pastReturn(daysBetween(m.expectedReturnOn, d.today))}
                  </>
                }
                side={<Pill tone="wait">{t.status.away}</Pill>}
              />
            ))}
          </Rows>
        </Section>
      )}

      {d.coverageEnding.length > 0 && (
        <Section title={t.home.coverageEnding}>
          <Rows isEmpty={false} empty="">
            {d.coverageEnding.map((c) => (
              <EquipmentLine
                key={c.id}
                e={c.equipment}
                extra={
                  <>
                    {t.coverageType[c.type]}, {t.home.endsIn("")}
                    <DateText ad={c.lastDay} />
                    {nearDate(c.lastDay, d.today) && `, ${nearDate(c.lastDay, d.today)}`}
                  </>
                }
                side={<Pill tone="wait">{t.coverageType[c.type]}</Pill>}
              />
            ))}
          </Rows>
        </Section>
      )}
    </>
  );
}

function Overview({ d }: { d: HomeData }) {
  const s = d.stats;
  if (!s) return null; // data saved by an older version: the fresh copy follows in a moment
  if (!s.total) return <p className="chart-empty">{t.home.chartEmpty}</p>;
  const workingPct = Math.round((s.byStatus.working / s.total) * 100);
  const open = d.down.filter((b) => b.status === "open").length;
  const withProvider = d.down.length - open;
  const repair = s.avgRepairMs === null ? null : durationParts(0, s.avgRepairMs);
  return (
    <div className="overview">
      <div className="stat-grid">
        <StatTile label={t.home.totalEquipment} value={s.total} sub={t.home.coveredOf(s.covered, s.total)} to="/equipment" />
        <StatTile label={t.home.uptime} value={t.home.percent(workingPct)} sub={t.home.ofTotal(s.byStatus.working, s.total)} tone="ok" to="/equipment?status=working" />
        <StatTile label={t.home.openBreakdowns} value={d.down.length} sub={t.home.openSplit(open, withProvider)} tone={d.down.length ? "bad" : "neutral"} to="/breakdowns" />
        <StatTile label={t.home.pmsOverdueCount} value={s.pms90.overdue} sub={`${t.home.pmsDueMonth}: ${s.pmsDue30}`} tone={s.pms90.overdue ? "wait" : "neutral"} to="/pms" />
        <StatTile
          label={t.home.avgRepair}
          value={repair ? (repair.days ? t.home.days(repair.days) : t.home.hours(repair.hours)) : t.home.noneYet}
          sub={t.home.avgRepairHelp}
        />
      </div>
      <div className="chart-grid">
        <ChartCard title={t.home.statusChart}>
          <SegmentBar
            emptyText={t.home.chartEmpty}
            segments={[
              { key: "working", label: t.status.equipment.working, value: s.byStatus.working, color: "var(--chart-ok)", to: "/equipment?status=working" },
              { key: "breakdown", label: t.status.equipment.breakdown, value: s.byStatus.breakdown, color: "var(--chart-bad)", to: "/equipment?status=breakdown" },
              { key: "oos", label: t.status.equipment.out_of_service, value: s.byStatus.out_of_service, color: "var(--chart-off)", to: "/equipment?status=out_of_service" },
            ]}
          />
        </ChartCard>
        <ChartCard title={t.home.coverageMix}>
          <SegmentBar
            emptyText={t.home.chartEmpty}
            segments={[
              { key: "warranty", label: t.coverageType.warranty, value: s.coverageMix.warranty, color: "var(--chart-1)" },
              { key: "amc", label: t.coverageType.amc, value: s.coverageMix.amc, color: "var(--chart-2)" },
              { key: "cmc", label: t.coverageType.cmc, value: s.coverageMix.cmc, color: "var(--chart-3)" },
              { key: "none", label: t.home.noCoverage, value: s.total - s.covered, color: "var(--chart-none)" },
            ]}
          />
        </ChartCard>
        <ChartCard title={t.home.breakdownsByMonth} help={t.home.breakdownsByMonthHelp}>
          <Columns data={s.breakdownsByMonth} unit={t.home.breakdownCount} />
        </ChartCard>
        <ChartCard title={t.home.pmsChart}>
          <SegmentBar
            emptyText={t.home.noneYet}
            segments={[
              { key: "done", label: t.home.pmsDone, value: s.pms90.done, color: "var(--chart-ok)" },
              { key: "late", label: t.home.pmsLate, value: s.pms90.overdue, color: "var(--chart-wait)", to: "/pms" },
              { key: "skipped", label: t.home.pmsMissed, value: s.pms90.skipped, color: "var(--chart-off)" },
            ]}
          />
        </ChartCard>
        <ChartCard title={t.home.byDepartment}>
          <BarList
            emptyText={t.home.chartEmpty}
            partLabel={t.status.equipment.breakdown}
            rows={s.byDepartment.slice(0, 8).map((x) => ({ key: x.id, label: x.name, value: x.total, part: x.down, to: `/departments/${x.id}` }))}
          />
        </ChartCard>
        <ChartCard title={t.home.topModels}>
          <BarList emptyText={t.home.topModelsEmpty} rows={s.topModels.map((x) => ({ key: x.label, label: x.label, value: x.n }))} />
        </ChartCard>
      </div>
    </div>
  );
}
