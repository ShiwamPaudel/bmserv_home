import { useState } from "react";
import { Link, useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { todayNepal } from "@bmserv/shared/dates";
import { breakdownNumber } from "@bmserv/shared/keys";
import { t } from "@bmserv/shared/terms";
import { errorMessage, fieldErrors, get, patch, post, put } from "../../lib/api";
import { useCan, useOnline, useSave, useTitle } from "../../lib/hooks";
import { qk } from "../../lib/queryKeys";
import type { DepartmentListItem, EquipmentDetail, HistoryEntry, ProviderListItem } from "../../lib/types";
import { DateText, MomentText, nearDate } from "../../lib/dates";
import { DateField } from "../../components/DateField";
import { FileRows, UploadSheet } from "../../components/files";
import { CoverageSheet, EndCoverageSheet, PmsDateSheet, PmsDoneSheet } from "../../components/pmsSheets";
import { ModelThumb } from "../../components/ModelPhoto";
import {
  Checkbox,
  Confirm,
  EquipmentStatusPill,
  Fact,
  LoadError,
  Loading,
  Notice,
  PageHead,
  Phone,
  Pill,
  RadioGroup,
  Row,
  Rows,
  Section,
  SelectField,
  SheetForm,
  TextField,
  useToast,
} from "../../components/ui";
import { EngineerForm } from "../Providers";

type Open =
  | null
  | "move"
  | "designate"
  | "addEngineer"
  | "manual"
  | "document"
  | "coverage"
  | { editCoverage: string }
  | { endCoverage: string }
  | { pmsDone: string; label: string }
  | { pmsDate: string; current: string };

export function EquipmentPage() {
  const { id = "" } = useParams();
  const q = useQuery({ queryKey: qk.equipment(id), queryFn: () => get<EquipmentDetail>(`/equipment/${id}`) });
  const history = useQuery({
    queryKey: qk.history(id),
    queryFn: () => get<HistoryEntry[]>(`/equipment/${id}/history`),
  });
  const providers = useQuery({
    queryKey: qk.providers,
    queryFn: () => get<ProviderListItem[]>("/service-providers"),
  });
  const canEdit = useCan("equipment.edit");
  const canOos = useCan("equipment.outOfService");
  const canCoverage = useCan("coverage.edit");
  const canPmsDate = useCan("pms.editDate");
  const canBreakdown = useCan("breakdown.work");
  const online = useOnline();
  const toast = useToast();
  const [open, setOpen] = useState<Open>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [confirmOos, setConfirmOos] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const returnMove = useSave((moveId: string) => post(`/moves/${moveId}/return`), [qk.history(id)]);
  const setOos = useSave((v: boolean) => patch(`/equipment/${id}`, { outOfService: v }), [qk.history(id)]);
  const remind = useSave((visitId: string) => post(`/pms/${visitId}/remind`));
  const today = todayNepal();
  useTitle(q.data ? `${q.data.equipment.typeName} ${q.data.equipment.serialNumber}` : t.equipment.title);

  if (q.isLoading) return <Loading />;
  if (q.error || !q.data) return <LoadError error={q.error} retry={() => void q.refetch()} />;
  const d = q.data;
  const e = d.equipment;
  const cov = d.coverage.current;
  const covText = cov ? t.coverage.under(t.coverageType[cov.type], "") : t.coverage.none;
  const currentVisits = cov ? d.pmsVisits.filter((v) => v.coverageId === cov.id) : [];

  return (
    <>
      <PageHead title={e.typeName} back={{ to: "/equipment", label: t.equipment.title }} />
      <div className="eq-head">
        <ModelThumb fileId={e.modelPhotoFileId} name={`${e.manufacturer} ${e.model}`} size={96} />
        <div className="titles">
          <div className="row-title">
            {e.manufacturer} {e.model}
          </div>
          <div className="eq-serial">
            {t.equipment.serialShort} {e.serialNumber}
          </div>
          {e.hospitalTag && (
            <div className="secondary muted">
              {t.equipment.tagShort} <span className="serial">{e.hospitalTag}</span>
            </div>
          )}
        </div>
        <EquipmentStatusPill status={e.status} />
      </div>

      {e.labelOutdated && (
        <Notice tone="wait" action={<Link to={`/print/labels?ids=${e.id}`}>{t.equipment.printLabel}</Link>}>
          {t.status.labelOutdated}
        </Notice>
      )}
      {d.openBreakdowns.map((b) => (
        <Notice
          key={b.id}
          tone="bad"
          action={<Link to={`/breakdowns/${b.id}`}>{t.breakdowns.openExisting}</Link>}
        >
          {t.history.breakdown(breakdownNumber(b.number))}: {b.problem}
        </Notice>
      ))}
      {error && <Notice tone="bad">{error}</Notice>}

      <div className="actions">
        {canBreakdown && e.status !== "out_of_service" && (
          <Link className="btn primary" to={`/breakdowns/new?equipment=${e.id}`}>
            {t.equipment.reportBreakdown}
          </Link>
        )}
        {d.activeMove ? (
          <button
            className="btn"
            disabled={!online || returnMove.isPending}
            onClick={() =>
              returnMove.mutate(d.activeMove!.id, {
                onSuccess: () => toast(t.moves.returned),
                onError: (er) => setError(errorMessage(er)),
              })
            }
          >
            {t.moves.returnTo(e.homeDepartmentName)}
          </button>
        ) : null}
        <button className="btn" onClick={() => setOpen("move")}>
          {t.equipment.move}
        </button>
        <a className="btn" href="#manuals">
          {t.equipment.manualsCount(d.manuals.length)}
        </a>
        <button className="btn plain" aria-expanded={moreOpen} onClick={() => setMoreOpen(!moreOpen)}>
          {t.app.more}
        </button>
      </div>
      {moreOpen && (
        <div className="actions" style={{ marginTop: -8 }}>
          <Link className="btn" to={`/print/labels?ids=${e.id}`}>
            {t.equipment.printLabel}
          </Link>
          {canEdit && (
            <Link className="btn" to={`/equipment/${e.id}/edit`}>
              {t.equipment.edit}
            </Link>
          )}
          {canOos &&
            (e.status === "out_of_service" ? (
              <button
                className="btn"
                onClick={() => setOos.mutate(false, { onSuccess: () => toast(t.app.saved) })}
              >
                {t.equipment.backInService}
              </button>
            ) : (
              <button className="btn danger" onClick={() => setConfirmOos(true)}>
                {t.equipment.outOfService}
              </button>
            ))}
        </div>
      )}

      <div className="facts">
        <Fact label={t.equipment.currentDepartment}>
          {e.currentDepartmentName}
          {e.away && (
            <div className="secondary muted">
              {t.equipment.belongsTo(e.homeDepartmentName)}
              {d.activeMove?.expectedReturnOn && (
                <>
                  , {t.departments.expectedReturn.toLowerCase()}{" "}
                  <DateText ad={d.activeMove.expectedReturnOn} />
                </>
              )}
            </div>
          )}
        </Fact>
        <Fact label={t.equipment.provider}>
          <Link to={`/service-providers/${e.providerId}`}>{e.providerName}</Link>
          {d.providerContacts
            .filter((c) => c.kind === "phone")
            .slice(0, 2)
            .map((c) => (
              <div key={c.id} className="secondary">
                <Phone value={c.value} /> {c.label && <span className="muted">{c.label}</span>}
              </div>
            ))}
        </Fact>
        <Fact label={t.equipment.designated}>
          {d.designated.length
            ? d.designated.map((se) => (
                <div key={se.id}>
                  {se.name} {se.phone && <Phone value={se.phone} />}
                </div>
              ))
            : t.equipment.designatedNone}
          <button className="link-btn secondary" onClick={() => setOpen("designate")}>
            {t.equipment.chooseDesignated}
          </button>
        </Fact>
        <Fact label={t.equipment.installedOn}>
          <DateText ad={e.installedOn} />
        </Fact>
        <Fact label={t.equipment.coverage}>
          {cov ? (
            <>
              {covText}
              <DateText ad={cov.lastDay} />
            </>
          ) : (
            t.coverage.none
          )}
        </Fact>
        <Fact label={t.equipment.lastPms}>
          {d.lastPms?.doneOn ? <DateText ad={d.lastPms.doneOn} /> : t.equipment.none}
        </Fact>
        <Fact label={t.equipment.nextPms}>
          {d.nextPms ? (
            <>
              <DateText ad={d.nextPms.dueOn} />
              <div className="secondary muted">
                {d.nextPms.number ? t.pms.numberOf(d.nextPms.number, d.nextPms.total) : ""}
                {nearDate(d.nextPms.dueOn, today) && `, ${nearDate(d.nextPms.dueOn, today)}`}
              </div>
            </>
          ) : (
            t.equipment.noPms
          )}
        </Fact>
        {e.notes && (
          <Fact label={t.equipment.notes}>
            <span className="pre-line">{e.notes}</span>
          </Fact>
        )}
      </div>

      <div id="manuals" />
      <Section
        title={t.equipment.manuals}
        action={
          <Link className="btn plain" to={`/models/${e.modelId}`}>
            {t.equipment.openModel}
          </Link>
        }
      >
        <FileRows files={d.manuals} empty={t.equipment.manualsEmpty} readOnly />
      </Section>

      <Section
        title={t.equipment.documents}
        action={
          <button className="btn plain" onClick={() => setOpen("document")}>
            {t.files.uploadDocument}
          </button>
        }
      >
        <FileRows files={d.documents} empty={t.equipment.documentsEmpty} />
      </Section>

      <Section
        title={t.coverage.title}
        action={
          canCoverage && !cov ? (
            <button className="btn plain" onClick={() => setOpen("coverage")}>
              {t.coverage.add}
            </button>
          ) : undefined
        }
      >
        <Rows isEmpty={!d.coverage.all.length} empty={t.coverage.none}>
          {d.coverage.all.map((c) => (
            <Row
              key={c.id}
              title={`${t.coverageType[c.type]}, ${c.providerName}`}
              lines={[
                <>
                  <DateText ad={c.startsOn} /> to <DateText ad={c.lastDay} />
                </>,
                <>
                  {c.pmsEvery ? t.coverage.pmsLine(t.pmsEvery(c.pmsEvery, c.pmsUnit)) : t.coverage.noPms}
                  {c.contractNo && (
                    <span className="sep">
                      {t.coverage.contractNo}: {c.contractNo}
                    </span>
                  )}
                </>,
              ]}
              side={
                c.isCurrent ? (
                  <>
                    <Pill tone="ok">{t.status.active}</Pill>
                    {canCoverage && (
                      <span style={{ display: "flex", gap: 4 }}>
                        <button className="btn plain" onClick={() => setOpen({ editCoverage: c.id })}>
                          {t.providers.edit}
                        </button>
                        <button className="btn plain" onClick={() => setOpen({ endCoverage: c.id })}>
                          {t.coverage.endEarly}
                        </button>
                      </span>
                    )}
                  </>
                ) : (
                  <Pill tone="off">{c.startsOn > today ? t.coverage.startsOn : t.coverage.past}</Pill>
                )
              }
            />
          ))}
        </Rows>
        {currentVisits.length > 0 && (
          <>
            <h3 style={{ marginTop: 16, marginBottom: 8 }}>{t.pms.title}</h3>
            <Rows isEmpty={false} empty="">
              {currentVisits.map((v) => {
                const label = v.number ? t.pms.numberOf(v.number, v.total) : "PMS";
                const overdue = v.status === "scheduled" && v.dueOn < today;
                return (
                  <Row
                    key={v.id}
                    title={label}
                    lines={[
                      v.status === "done" && v.doneOn ? (
                        <>
                          {t.pms.doneOn} <DateText ad={v.doneOn} />
                          {v.serviceEngineerName && <span className="sep">{v.serviceEngineerName}</span>}
                        </>
                      ) : (
                        <>
                          {t.pms.dueOn} <DateText ad={v.dueOn} />
                          {v.status === "scheduled" && nearDate(v.dueOn, today) && (
                            <span className="sep">{nearDate(v.dueOn, today)}</span>
                          )}
                        </>
                      ),
                      v.status === "scheduled" ? (
                        <span style={{ display: "inline-flex", gap: 4, flexWrap: "wrap" }}>
                          <button className="btn plain" onClick={() => setOpen({ pmsDone: v.id, label })}>
                            {t.pms.markDone}
                          </button>
                          {canPmsDate && (
                            <button
                              className="btn plain"
                              onClick={() => setOpen({ pmsDate: v.id, current: v.dueOn })}
                            >
                              {t.pms.changeDate}
                            </button>
                          )}
                          {(overdue || v.reminderSentAt) && (
                            <button
                              className="btn plain"
                              disabled={!online || remind.isPending}
                              onClick={() =>
                                remind.mutate(v.id, {
                                  onSuccess: () => toast(t.pms.reminded),
                                  onError: (er) => setError(errorMessage(er)),
                                })
                              }
                            >
                              {t.pms.remind}
                            </button>
                          )}
                        </span>
                      ) : null,
                    ]}
                    side={
                      <Pill
                        tone={
                          v.status === "done"
                            ? "ok"
                            : v.status === "skipped"
                              ? "off"
                              : overdue
                                ? "bad"
                                : "wait"
                        }
                      >
                        {overdue ? t.status.pmsOverdue : t.status.pms[v.status]}
                      </Pill>
                    }
                  />
                );
              })}
            </Rows>
          </>
        )}
      </Section>

      <Section
        title={t.equipment.history}
        action={
          <button className="btn plain no-print" onClick={() => window.print()}>
            {t.equipment.printHistory}
          </button>
        }
      >
        <HistoryList entries={history.data} loading={history.isLoading} />
      </Section>

      {open === "move" && <MoveSheet detail={d} onClose={() => setOpen(null)} />}
      {open === "designate" && (
        <DesignateSheet detail={d} onClose={() => setOpen(null)} onAdd={() => setOpen("addEngineer")} />
      )}
      {open === "addEngineer" && (
        <EngineerForm providerId={e.providerId} onClose={() => setOpen("designate")} />
      )}
      {open === "document" && (
        <UploadSheet
          title={t.files.uploadDocument}
          ownerType="equipment"
          ownerId={e.id}
          kinds={["installation_report", "service_report", "contract", "photo", "other"]}
          onClose={() => setOpen(null)}
        />
      )}
      {open === "coverage" && (
        <CoverageSheet
          equipmentId={e.id}
          providers={providers.data ?? []}
          defaultProviderId={e.providerId}
          modelPms={{ every: e.modelPmsEvery, unit: e.modelPmsUnit }}
          onClose={() => setOpen(null)}
        />
      )}
      {open && typeof open === "object" && "editCoverage" in open && (
        <CoverageSheet
          equipmentId={e.id}
          coverage={d.coverage.all.find((c) => c.id === open.editCoverage)}
          providers={providers.data ?? []}
          defaultProviderId={e.providerId}
          modelPms={{ every: e.modelPmsEvery, unit: e.modelPmsUnit }}
          onClose={() => setOpen(null)}
        />
      )}
      {open && typeof open === "object" && "endCoverage" in open && (
        <EndCoverageSheet
          coverage={d.coverage.all.find((c) => c.id === open.endCoverage)!}
          onClose={() => setOpen(null)}
        />
      )}
      {open && typeof open === "object" && "pmsDone" in open && (
        <PmsDoneSheet visitId={open.pmsDone} label={open.label} onClose={() => setOpen(null)} />
      )}
      {open && typeof open === "object" && "pmsDate" in open && (
        <PmsDateSheet visitId={open.pmsDate} current={open.current} onClose={() => setOpen(null)} />
      )}
      {confirmOos && (
        <Confirm
          message={t.equipment.outOfServiceConfirm}
          confirmLabel={t.equipment.outOfService}
          danger
          onCancel={() => setConfirmOos(false)}
          onConfirm={() =>
            setOos.mutate(true, {
              onSuccess: () => {
                toast(t.app.saved);
                setConfirmOos(false);
              },
              onError: (er) => {
                setError(errorMessage(er));
                setConfirmOos(false);
              },
            })
          }
        />
      )}
    </>
  );
}

export function HistoryList({ entries, loading }: { entries: HistoryEntry[] | undefined; loading: boolean }) {
  if (loading) return <Loading />;
  if (!entries?.length) return <p className="empty">{t.history.empty}</p>;
  return (
    <div style={{ borderTop: "1px solid var(--line)" }}>
      {entries.map((h, i) => (
        <div className="history-entry" key={i}>
          <div className="when muted">
            {h.moment ? <MomentText ms={h.moment} /> : <DateText ad={h.date} />}
          </div>
          <div>
            {h.details.length ? (
              <details>
                <summary>
                  {h.link ? <Link to={h.link}>{h.title}</Link> : h.title}
                  {h.by && <span className="muted secondary"> {t.history.by(h.by)}</span>}
                </summary>
                <ul>
                  {h.details.map((x, j) => (
                    <li key={j}>{x}</li>
                  ))}
                </ul>
              </details>
            ) : (
              <>
                {h.link ? <Link to={h.link}>{h.title}</Link> : h.title}
                {h.by && <span className="muted secondary"> {t.history.by(h.by)}</span>}
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function MoveSheet({ detail, onClose }: { detail: EquipmentDetail; onClose: () => void }) {
  const e = detail.equipment;
  const canPermanent = useCan("move.permanent");
  const depts = useQuery({
    queryKey: qk.departments,
    queryFn: () => get<DepartmentListItem[]>("/departments"),
  });
  const [f, setF] = useState({
    toDepartmentId: "",
    type: "temporary" as "temporary" | "permanent",
    reason: "",
    expectedReturnOn: null as string | null,
  });
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const toast = useToast();
  const save = useSave(() => post(`/equipment/${e.id}/moves`, f), [qk.history(e.id)]);
  const target = depts.data?.find((x) => x.id === f.toDepartmentId)?.name ?? "";
  const run = () =>
    save.mutate(undefined, {
      onSuccess: () => {
        toast(t.moves.moved);
        onClose();
      },
      onError: (er) => {
        setConfirm(false);
        setErrs(fieldErrors(er));
        setError(errorMessage(er));
      },
    });
  if (confirm) {
    return (
      <Confirm
        message={t.moves.permanentConfirm(target)}
        confirmLabel={t.moves.save}
        onCancel={() => setConfirm(false)}
        onConfirm={run}
        busy={save.isPending}
      />
    );
  }
  return (
    <SheetForm
      title={t.moves.title}
      onClose={onClose}
      submitLabel={t.moves.save}
      busy={save.isPending}
      error={Object.keys(errs).length ? null : error}
      onSubmit={() => (f.type === "permanent" ? setConfirm(true) : run())}
    >
      <SelectField
        label={t.moves.to}
        value={f.toDepartmentId}
        onChange={(v) => setF({ ...f, toDepartmentId: v })}
        options={(depts.data ?? [])
          .filter((x) => x.isActive && x.id !== e.currentDepartmentId)
          .map((x) => ({ value: x.id, label: x.name }))}
        placeholder={t.fields.choose}
        error={errs.toDepartmentId}
      />
      <TextField
        label={t.moves.reason}
        value={f.reason}
        onChange={(v) => setF({ ...f, reason: v })}
        error={errs.reason}
      />
      {canPermanent && (
        <RadioGroup
          label={t.moves.type}
          value={f.type}
          onChange={(v) => setF({ ...f, type: v })}
          options={[
            { value: "temporary", label: t.moveType.temporary, help: t.moves.temporaryHelp },
            { value: "permanent", label: t.moveType.permanent, help: t.moves.permanentHelp },
          ]}
        />
      )}
      {f.type === "temporary" && (
        <DateField
          label={t.moves.expectedReturn}
          value={f.expectedReturnOn}
          onChange={(v) => setF({ ...f, expectedReturnOn: v })}
          error={errs.expectedReturnOn}
          optional
        />
      )}
    </SheetForm>
  );
}

function DesignateSheet({
  detail,
  onClose,
  onAdd,
}: {
  detail: EquipmentDetail;
  onClose: () => void;
  onAdd: () => void;
}) {
  const [ids, setIds] = useState<string[]>(detail.designated.filter((x) => x.isActive).map((x) => x.id));
  const toast = useToast();
  const save = useSave(() =>
    put(`/equipment/${detail.equipment.id}/service-engineers`, { serviceEngineerIds: ids }),
  );
  return (
    <SheetForm
      title={t.equipment.chooseDesignated}
      onClose={onClose}
      submitLabel={t.app.save}
      busy={save.isPending}
      onSubmit={() =>
        save.mutate(undefined, {
          onSuccess: () => {
            toast(t.app.saved);
            onClose();
          },
        })
      }
    >
      {detail.providerEngineers.length ? (
        detail.providerEngineers.map((se) => (
          <Checkbox
            key={se.id}
            checked={ids.includes(se.id)}
            onChange={(on) => setIds(on ? [...ids, se.id] : ids.filter((x) => x !== se.id))}
          >
            {se.name}
            <span className="muted secondary"> {[se.phone, se.email].filter(Boolean).join(", ")}</span>
          </Checkbox>
        ))
      ) : (
        <p className="muted">{t.providers.engineersEmpty}</p>
      )}
      <button type="button" className="btn plain" onClick={onAdd}>
        {t.providers.addEngineer}
      </button>
    </SheetForm>
  );
}
