import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { todayNepal } from "@bmserv/shared/dates";
import { t } from "@bmserv/shared/terms";
import { errorMessage, get, post } from "../lib/api";
import { useCan, useOnline, useSave, useTitle } from "../lib/hooks";
import { qk } from "../lib/queryKeys";
import type { PmsListItem } from "../lib/types";
import { DateText, MomentText, nearDate } from "../lib/dates";
import { EquipmentLine } from "../components/EquipmentLine";
import { PmsDateSheet, PmsDoneSheet } from "../components/pmsSheets";
import { LoadError, Loading, Notice, PageHead, Pill, Rows, Tabs, useToast } from "../components/ui";

type Filter = "due" | "overdue" | "done";

export function pmsLabel(v: PmsListItem): string {
  return v.number ? t.pms.numberOf(v.number, v.total) : t.pms.fromEarlier;
}

export function PmsScreen() {
  useTitle(t.pms.title);
  const [filter, setFilter] = useState<Filter>("due");
  const q = useQuery({ queryKey: qk.pms(filter), queryFn: () => get<PmsListItem[]>(`/pms?filter=${filter}`) });
  const [open, setOpen] = useState<{ done: PmsListItem } | { date: PmsListItem } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canDate = useCan("pms.editDate");
  const online = useOnline();
  const toast = useToast();
  const remind = useSave((id: string) => post(`/pms/${id}/remind`));
  const today = todayNepal();

  return (
    <>
      <PageHead title={t.pms.title}>
        <a className="btn plain" href="/api/export/pms.csv">
          {t.export.pms}
        </a>
      </PageHead>
      <Tabs
        value={filter}
        onChange={setFilter}
        items={[
          { value: "due", label: t.pms.filterDue },
          { value: "overdue", label: t.pms.filterOverdue },
          { value: "done", label: t.pms.filterDone },
        ]}
      />
      {error && <Notice tone="bad">{error}</Notice>}
      {q.isLoading ? (
        <Loading />
      ) : q.error ? (
        <LoadError error={q.error} retry={() => void q.refetch()} />
      ) : (
        <Rows isEmpty={!q.data?.length} empty={filter === "due" ? t.pms.empty : filter === "overdue" ? t.pms.emptyOverdue : t.pms.emptyDone}>
          {q.data?.map((v) => (
            <EquipmentLine
              key={v.id}
              e={v.equipment}
              noLink
              extra={
                <>
                  <strong style={{ fontWeight: 500, color: "var(--ink)" }}>{pmsLabel(v)}</strong>
                  {v.status === "done" ? (
                    <>
                      {", "}
                      {t.pms.doneOn.toLowerCase()} <DateText ad={v.doneOn} />
                      {v.serviceEngineerName && `, ${v.serviceEngineerName}`}
                    </>
                  ) : (
                    <>
                      {", "}
                      <DateText ad={v.dueOn} />
                      {nearDate(v.dueOn, today) && `, ${nearDate(v.dueOn, today)}`}
                      <div className="small">
                        {v.reminderSentAt ? (
                          <>
                            {t.pms.reminderSent("")}
                            <MomentText ms={v.reminderSentAt} />
                          </>
                        ) : (
                          t.pms.reminderNotSent
                        )}
                      </div>
                    </>
                  )}
                </>
              }
              side={
                <>
                  <Pill tone={v.status === "done" ? "ok" : v.dueOn < today ? "bad" : "wait"}>
                    {v.status === "done" ? t.status.pms.done : v.dueOn < today ? t.status.pmsOverdue : t.status.pmsDueSoon}
                  </Pill>
                  {v.status === "scheduled" && (
                    <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                      <button className="btn plain" onClick={() => setOpen({ done: v })}>
                        {t.pms.markDone}
                      </button>
                      {canDate && (
                        <button className="btn plain" onClick={() => setOpen({ date: v })}>
                          {t.pms.changeDate}
                        </button>
                      )}
                      <button
                        className="btn plain"
                        disabled={!online || remind.isPending}
                        onClick={() => remind.mutate(v.id, { onSuccess: () => toast(t.pms.reminded), onError: (e) => setError(errorMessage(e)) })}
                      >
                        {t.pms.remind}
                      </button>
                    </span>
                  )}
                </>
              }
            />
          ))}
        </Rows>
      )}
      {open && "done" in open && <PmsDoneSheet visitId={open.done.id} label={pmsLabel(open.done)} onClose={() => setOpen(null)} />}
      {open && "date" in open && <PmsDateSheet visitId={open.date.id} current={open.date.dueOn} onClose={() => setOpen(null)} />}
    </>
  );
}
