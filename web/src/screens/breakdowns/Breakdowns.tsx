import { useState } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { t } from "@bmserv/shared/terms";
import { get } from "../../lib/api";
import { useCan, useMe, useTitle } from "../../lib/hooks";
import { qk } from "../../lib/queryKeys";
import type { BreakdownListItem } from "../../lib/types";
import { downFor } from "../../lib/dates";
import { EquipmentLine } from "../../components/EquipmentLine";
import { BreakdownStatusPill, Checkbox, LoadError, Loading, PageHead, Rows, Tabs } from "../../components/ui";

type Filter = "open" | "with_provider" | "fixed";

export function Breakdowns() {
  useTitle(t.breakdowns.title);
  const [status, setStatus] = useState<Filter>("open");
  const [mine, setMine] = useState(false);
  const [paused, setPaused] = useState(false);
  const me = useMe();
  const canRecord = useCan("breakdown.work");
  const params = new URLSearchParams({ status: paused ? "with_provider" : status, ...(mine ? { mine: "1" } : {}), ...(paused ? { paused: "1" } : {}) });
  const q = useQuery({ queryKey: qk.breakdowns(params.toString()), queryFn: () => get<BreakdownListItem[]>(`/breakdowns?${params}`) });

  return (
    <>
      <PageHead title={t.breakdowns.title}>
        {canRecord && (
          <Link className="btn primary" to="/breakdowns/new">
            {t.breakdowns.record}
          </Link>
        )}
      </PageHead>
      <Tabs
        value={status}
        onChange={(v) => {
          setStatus(v);
          if (v !== "with_provider") setPaused(false);
        }}
        items={[
          { value: "open", label: t.breakdowns.filterOpen },
          { value: "with_provider", label: t.breakdowns.filterWithProvider },
          { value: "fixed", label: t.breakdowns.filterFixed },
        ]}
      />
      <div className="filters" style={{ marginBottom: 8 }}>
        <Checkbox checked={mine} onChange={setMine}>
          {t.breakdowns.filterMine}
        </Checkbox>
        {status === "with_provider" && (
          <Checkbox checked={paused} onChange={setPaused}>
            {t.breakdowns.filterPaused}
          </Checkbox>
        )}
        <a className="btn plain" href="/api/export/breakdowns.csv" style={{ marginLeft: "auto" }}>
          {t.export.breakdowns}
        </a>
      </div>
      {q.isLoading ? (
        <Loading />
      ) : q.error ? (
        <LoadError error={q.error} retry={() => void q.refetch()} />
      ) : (
        <Rows isEmpty={!q.data?.length} empty={status === "open" && !mine ? t.breakdowns.empty : t.breakdowns.emptyFilter}>
          {q.data?.map((b) => (
            <EquipmentLine
              key={b.id}
              e={b.equipment}
              to={`/breakdowns/${b.id}`}
              extra={
                <>
                  <span className="serial">{b.numberText}</span>
                  <span className="sep">{downFor(b.reportedAt, b.closedAt)}</span>
                  <span className="sep">
                    {b.assignedName}
                    {b.assignedTo === me.data?.user.id && ` (${t.home.mine})`}
                  </span>
                </>
              }
              side={<BreakdownStatusPill status={b.status} paused={b.pausedAt !== null} />}
            />
          ))}
        </Rows>
      )}
    </>
  );
}
