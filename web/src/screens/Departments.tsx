import { useState } from "react";
import { useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { t } from "@bmserv/shared/terms";
import { errorMessage, fieldErrors, get, patch, post } from "../lib/api";
import { useCan, useSave, useTitle } from "../lib/hooks";
import { qk } from "../lib/queryKeys";
import type { DepartmentDetail, DepartmentListItem } from "../lib/types";
import { DateText, MomentText } from "../lib/dates";
import { EquipmentLine } from "../components/EquipmentLine";
import {
  Checkbox,
  LoadError,
  Loading,
  PageHead,
  Pill,
  Row,
  Rows,
  Section,
  SheetForm,
  TextField,
  useToast,
} from "../components/ui";
import { SetupTabs } from "../components/SetupTabs";

export function Departments() {
  useTitle(t.departments.title);
  const q = useQuery({ queryKey: qk.departments, queryFn: () => get<DepartmentListItem[]>("/departments") });
  const canEdit = useCan("department.edit");
  const [adding, setAdding] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  return (
    <>
      <PageHead title={t.nav.setup}>
        {canEdit && (
          <button className="btn primary" onClick={() => setAdding(true)}>
            {t.departments.add}
          </button>
        )}
      </PageHead>
      <SetupTabs />
      {q.isLoading ? (
        <Loading />
      ) : q.error ? (
        <LoadError error={q.error} retry={() => void q.refetch()} />
      ) : (
        <Rows isEmpty={!q.data?.length} empty={t.departments.empty}>
          {q.data?.map((d) => (
            <Row
              key={d.id}
              flash={flash === d.id}
              to={`/departments/${d.id}`}
              title={d.name}
              lines={[
                <>
                  {t.departments.equipmentCount(d.hereNow)}
                  {d.shortName && <span className="sep">{d.shortName}</span>}
                </>,
              ]}
              side={!d.isActive ? <Pill tone="off">{t.status.inactive}</Pill> : undefined}
            />
          ))}
        </Rows>
      )}
      {adding && <DepartmentForm onClose={() => setAdding(false)} onSaved={(id) => setFlash(id)} />}
    </>
  );
}

function DepartmentForm({
  dept,
  onClose,
  onSaved,
}: {
  dept?: { id: string; name: string; shortName: string | null; isActive: boolean };
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const [f, setF] = useState({
    name: dept?.name ?? "",
    shortName: dept?.shortName ?? "",
    isActive: dept?.isActive ?? true,
  });
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const save = useSave((body: typeof f) =>
    dept
      ? patch<{ id: string }>(`/departments/${dept.id}`, body)
      : post<{ id: string }>("/departments", { name: body.name, shortName: body.shortName }),
  );
  return (
    <SheetForm
      title={dept ? t.departments.editTitle : t.departments.addTitle}
      onClose={onClose}
      submitLabel={dept ? t.app.saveChanges : t.departments.add}
      busy={save.isPending}
      error={Object.keys(errs).length ? null : error}
      onSubmit={() =>
        save.mutate(f, {
          onSuccess: (r) => {
            toast(t.app.saved);
            onSaved(r.id);
            onClose();
          },
          onError: (e) => {
            setErrs(fieldErrors(e));
            setError(errorMessage(e));
          },
        })
      }
    >
      <TextField
        label={t.departments.name}
        value={f.name}
        onChange={(v) => setF({ ...f, name: v })}
        error={errs.name}
      />
      <TextField
        label={t.departments.shortName}
        value={f.shortName}
        onChange={(v) => setF({ ...f, shortName: v })}
        error={errs.shortName}
        help={t.departments.shortNameHelp}
        optional
      />
      {dept && (
        <Checkbox checked={!f.isActive} onChange={(v) => setF({ ...f, isActive: !v })}>
          {t.departments.makeInactive}
        </Checkbox>
      )}
    </SheetForm>
  );
}

export function DepartmentPage() {
  const { id = "" } = useParams();
  const q = useQuery({
    queryKey: qk.department(id),
    queryFn: () => get<DepartmentDetail>(`/departments/${id}`),
  });
  const canEdit = useCan("department.edit");
  const [editing, setEditing] = useState(false);
  useTitle(q.data?.department.name ?? t.departments.title);
  if (q.isLoading) return <Loading />;
  if (q.error || !q.data) return <LoadError error={q.error} retry={() => void q.refetch()} />;
  const { department, hereNow, elsewhere } = q.data;
  return (
    <>
      <PageHead title={department.name} back={{ to: "/departments", label: t.departments.title }}>
        {canEdit && (
          <button className="btn" onClick={() => setEditing(true)}>
            {t.providers.edit}
          </button>
        )}
      </PageHead>
      {!department.isActive && <Pill tone="off">{t.status.inactive}</Pill>}
      <Section title={t.departments.hereNow}>
        <Rows isEmpty={!hereNow.length} empty={t.departments.hereNowEmpty}>
          {hereNow.map((e) => (
            <EquipmentLine
              key={e.id}
              e={e}
              extra={e.away ? t.departments.borrowedFrom(e.homeDepartmentName) : undefined}
            />
          ))}
        </Rows>
      </Section>
      <Section title={t.departments.elsewhere}>
        <Rows isEmpty={!elsewhere.length} empty={t.departments.elsewhereEmpty}>
          {elsewhere.map((e) => (
            <EquipmentLine
              key={e.id}
              e={e}
              extra={
                e.move ? (
                  <>
                    {t.departments.isAt(e.currentDepartmentName)}, {t.departments.since.toLowerCase()}{" "}
                    <MomentText ms={e.move.movedAt} />, {t.departments.movedBy.toLowerCase()}{" "}
                    {e.move.movedByName}
                    {e.move.expectedReturnOn && (
                      <>
                        . {t.departments.expectedReturn}: <DateText ad={e.move.expectedReturnOn} />
                      </>
                    )}
                  </>
                ) : (
                  t.departments.isAt(e.currentDepartmentName)
                )
              }
            />
          ))}
        </Rows>
      </Section>
      {editing && (
        <DepartmentForm dept={department} onClose={() => setEditing(false)} onSaved={() => undefined} />
      )}
    </>
  );
}
