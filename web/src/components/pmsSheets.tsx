import { useState } from "react";
import type { CoverageType, PmsUnit } from "@bmserv/shared/enums";
import { todayNepal } from "@bmserv/shared/dates";
import { t } from "@bmserv/shared/terms";
import { errorMessage, fieldErrors, patch, post } from "../lib/api";
import { useSave } from "../lib/hooks";
import type { CoverageRow, ProviderListItem } from "../lib/types";
import { DateField } from "./DateField";
import { PmsFrequencyField } from "./PmsFrequencyField";
import { UploadSheet } from "./files";
import { RadioGroup, SelectField, SheetForm, TextArea, TextField, useToast } from "./ui";

export function PmsDoneSheet({ visitId, label, onClose }: { visitId: string; label: string; onClose: () => void }) {
  const [f, setF] = useState({ doneOn: todayNepal() as string | null, serviceEngineerName: "", remarks: "" });
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState(false);
  const toast = useToast();
  const save = useSave(() => post(`/pms/${visitId}/done`, f));
  if (report) {
    return <UploadSheet title={t.pms.report} ownerType="pms_visit" ownerId={visitId} kinds={["service_report"]} defaultTitle={`${t.pms.report}, ${label}`} onClose={onClose} />;
  }
  return (
    <SheetForm
      title={`${t.pms.markDoneTitle}: ${label}`}
      onClose={onClose}
      submitLabel={t.pms.markDone}
      busy={save.isPending}
      error={Object.keys(errs).length ? null : error}
      onSubmit={() =>
        save.mutate(undefined, {
          onSuccess: () => {
            toast(t.pms.done);
            setReport(true);
          },
          onError: (e) => {
            setErrs(fieldErrors(e));
            setError(errorMessage(e));
          },
        })
      }
    >
      <DateField label={t.pms.doneOn} value={f.doneOn} onChange={(v) => setF({ ...f, doneOn: v })} error={errs.doneOn} />
      <TextField label={t.pms.serviceEngineer} value={f.serviceEngineerName} onChange={(v) => setF({ ...f, serviceEngineerName: v })} optional />
      <TextArea label={t.pms.remarks} value={f.remarks} onChange={(v) => setF({ ...f, remarks: v })} optional rows={3} />
      <p className="help">{t.pms.report}: {t.files.limitOther}. {t.app.optional}.</p>
    </SheetForm>
  );
}

export function PmsDateSheet({ visitId, current, onClose }: { visitId: string; current: string; onClose: () => void }) {
  const [dueOn, setDueOn] = useState<string | null>(current);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const save = useSave(() => patch(`/pms/${visitId}`, { dueOn }));
  return (
    <SheetForm
      title={t.pms.changeDateTitle}
      onClose={onClose}
      submitLabel={t.pms.changeDate}
      busy={save.isPending}
      error={Object.keys(errs).length ? null : error}
      onSubmit={() =>
        save.mutate(undefined, {
          onSuccess: () => {
            toast(t.pms.dateChanged);
            onClose();
          },
          onError: (e) => {
            setErrs(fieldErrors(e));
            setError(errorMessage(e));
          },
        })
      }
    >
      <DateField label={t.pms.dueOn} value={dueOn} onChange={setDueOn} error={errs.dueOn} />
    </SheetForm>
  );
}

export function CoverageSheet({
  equipmentId,
  coverage,
  providers,
  defaultProviderId,
  modelPms,
  onClose,
}: {
  equipmentId: string;
  coverage?: CoverageRow;
  providers: ProviderListItem[];
  defaultProviderId: string;
  /** The model's PMS frequency: the starting value for new coverage. */
  modelPms: { every: number | null; unit: PmsUnit };
  onClose: () => void;
}) {
  const [f, setF] = useState({
    type: (coverage?.type ?? "warranty") as CoverageType,
    serviceProviderId: coverage?.serviceProviderId ?? defaultProviderId,
    startsOn: coverage?.startsOn ?? null,
    endsOn: coverage?.endsOn ?? null,
    pmsEvery: coverage ? (coverage.pmsEvery === null ? "" : String(coverage.pmsEvery)) : modelPms.every ? String(modelPms.every) : "",
    pmsUnit: (coverage ? coverage.pmsUnit : modelPms.unit) as PmsUnit,
    contractNo: coverage?.contractNo ?? "",
    notes: coverage?.notes ?? "",
  });
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);
  const toast = useToast();
  const save = useSave(() => {
    const body = { ...f, pmsEvery: f.pmsEvery ? Number(f.pmsEvery) : null, contractNo: f.contractNo || null, notes: f.notes || null };
    return coverage ? patch<{ id: string }>(`/coverage/${coverage.id}`, body) : post<{ id: string; pmsCount: number }>(`/equipment/${equipmentId}/coverage`, body);
  });
  if (created) {
    return <UploadSheet title={t.coverage.contractDocument} ownerType="coverage" ownerId={created} kinds={["contract"]} defaultTitle={`${t.coverageType[f.type]} ${f.contractNo}`.trim()} onClose={onClose} />;
  }
  return (
    <SheetForm
      title={coverage ? t.coverage.editTitle : t.coverage.addTitle}
      onClose={onClose}
      submitLabel={coverage ? t.app.saveChanges : t.coverage.add}
      busy={save.isPending}
      error={Object.keys(errs).length ? null : error}
      onSubmit={() => {
        const local: Record<string, string> = {};
        if (!f.startsOn) local.startsOn = t.fields.date;
        if (!f.endsOn) local.endsOn = t.fields.date;
        if (Object.keys(local).length) return setErrs(local);
        save.mutate(undefined, {
          onSuccess: (r) => {
            const count = (r as { pmsCount?: number }).pmsCount;
            toast(count !== undefined ? `${t.app.saved}. ${t.coverage.pmsCreated(count)}` : t.app.saved);
            if (!coverage) setCreated(r.id);
            else onClose();
          },
          onError: (e) => {
            setErrs(fieldErrors(e));
            setError(errorMessage(e));
          },
        });
      }}
    >
      <RadioGroup
        label={t.coverage.type}
        value={f.type}
        onChange={(v) => setF({ ...f, type: v })}
        options={(["warranty", "amc", "cmc"] as const).map((v) => ({ value: v, label: t.coverageTypeLong[v] }))}
      />
      <SelectField
        label={t.coverage.provider}
        value={f.serviceProviderId}
        onChange={(v) => setF({ ...f, serviceProviderId: v })}
        options={providers.map((p) => ({ value: p.id, label: p.name }))}
        error={errs.serviceProviderId}
      />
      <DateField label={t.coverage.startsOn} value={f.startsOn} onChange={(v) => setF({ ...f, startsOn: v })} error={errs.startsOn} />
      <DateField label={t.coverage.endsOn} value={f.endsOn} onChange={(v) => setF({ ...f, endsOn: v })} error={errs.endsOn} />
      <PmsFrequencyField
        label={t.coverage.pmsEvery}
        every={f.pmsEvery}
        unit={f.pmsUnit}
        onChange={(every, unit) => setF({ ...f, pmsEvery: every, pmsUnit: unit })}
        error={errs.pmsEvery}
        help={t.coverage.pmsEveryHelp}
        optional
      />
      <TextField label={t.coverage.contractNo} value={f.contractNo} onChange={(v) => setF({ ...f, contractNo: v })} optional />
      <TextArea label={t.coverage.notes} value={f.notes} onChange={(v) => setF({ ...f, notes: v })} optional rows={2} />
    </SheetForm>
  );
}

export function EndCoverageSheet({ coverage, onClose }: { coverage: CoverageRow; onClose: () => void }) {
  const [endedOn, setEndedOn] = useState<string | null>(todayNepal());
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const save = useSave(() => post(`/coverage/${coverage.id}/end`, { endedOn }));
  return (
    <SheetForm
      title={t.coverage.endEarlyTitle}
      onClose={onClose}
      submitLabel={t.coverage.endEarly}
      danger
      busy={save.isPending}
      error={Object.keys(errs).length ? null : error}
      onSubmit={() =>
        save.mutate(undefined, {
          onSuccess: () => {
            toast(t.app.saved);
            onClose();
          },
          onError: (e) => {
            setErrs(fieldErrors(e));
            setError(errorMessage(e));
          },
        })
      }
    >
      <DateField label={t.coverage.endedOn} value={endedOn} onChange={setEndedOn} error={errs.endedOn} help={t.coverage.endEarlyConfirm} />
    </SheetForm>
  );
}
