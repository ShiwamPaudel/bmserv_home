import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { t } from "@bmserv/shared/terms";
import { ApiError, errorMessage, fieldErrors, get, patch, post } from "../../lib/api";
import { useCan, useDebounced, useOnline, useSave, useTitle } from "../../lib/hooks";
import { qk } from "../../lib/queryKeys";
import type {
  DepartmentListItem,
  EquipmentDetail,
  Model,
  ProviderDetail,
  ProviderListItem,
} from "../../lib/types";
import {
  checkModelPhoto,
  ModelFields,
  modelBody,
  modelDraft,
  uploadModelPhoto,
  type ModelDraft,
} from "../../components/ModelFields";
import { ModelThumb } from "../../components/ModelPhoto";
import { DateField } from "../../components/DateField";
import {
  Checkbox,
  LoadError,
  Loading,
  Notice,
  PageHead,
  SelectField,
  TextArea,
  TextField,
  useToast,
} from "../../components/ui";

type Form = {
  modelId: string;
  serialNumber: string;
  hospitalTag: string;
  serviceProviderId: string;
  homeDepartmentId: string;
  installedOn: string | null;
  notes: string;
  serviceEngineerIds: string[];
  lastPmsDoneOn: string | null;
};

export function EquipmentForm() {
  const { id } = useParams();
  const editing = !!id;
  useTitle(editing ? t.equipment.editTitle : t.equipment.addTitle);
  const canEdit = useCan("equipment.edit");
  const navigate = useNavigate();
  const toast = useToast();
  const online = useOnline();
  const existing = useQuery({
    queryKey: qk.equipment(id ?? ""),
    queryFn: () => get<EquipmentDetail>(`/equipment/${id}`),
    enabled: editing,
  });
  const depts = useQuery({
    queryKey: qk.departments,
    queryFn: () => get<DepartmentListItem[]>("/departments"),
  });
  const providers = useQuery({
    queryKey: qk.providers,
    queryFn: () => get<ProviderListItem[]>("/service-providers"),
  });
  const [f, setF] = useState<Form>({
    modelId: "",
    serialNumber: "",
    hospitalTag: "",
    serviceProviderId: "",
    homeDepartmentId: "",
    installedOn: null,
    notes: "",
    serviceEngineerIds: [],
    lastPmsDoneOn: null,
  });
  const [modelLabel, setModelLabel] = useState("");
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [duplicateId, setDuplicateId] = useState<string | null>(null);
  const provider = useQuery({
    queryKey: qk.provider(f.serviceProviderId),
    queryFn: () => get<ProviderDetail>(`/service-providers/${f.serviceProviderId}`),
    enabled: !!f.serviceProviderId && !editing,
  });

  useEffect(() => {
    const e = existing.data?.equipment;
    if (e && !f.modelId) {
      setF({
        modelId: e.modelId,
        serialNumber: e.serialNumber,
        hospitalTag: e.hospitalTag ?? "",
        serviceProviderId: e.providerId,
        homeDepartmentId: e.homeDepartmentId,
        installedOn: e.installedOn,
        notes: e.notes ?? "",
        serviceEngineerIds: [],
        lastPmsDoneOn: null,
      });
      setModelLabel(`${e.typeName}, ${e.manufacturer} ${e.model}`);
    }
  }, [existing.data, f.modelId]);

  const save = useSave(() => {
    const body = { ...f, hospitalTag: f.hospitalTag || null, notes: f.notes || null };
    if (editing) {
      const { serviceEngineerIds: _s, lastPmsDoneOn: _l, ...rest } = body;
      return patch<{ id: string }>(`/equipment/${id}`, rest);
    }
    return post<{ id: string }>("/equipment", body);
  });

  if (!canEdit) return <Notice tone="off">{t.app.noAccess}</Notice>;
  if (editing && existing.isLoading) return <Loading />;
  if (editing && existing.error) return <LoadError error={existing.error} />;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const local: Record<string, string> = {};
    if (!f.modelId) local.modelId = t.fields.choose;
    if (!f.installedOn) local.installedOn = t.fields.date;
    if (Object.keys(local).length) {
      setErrs(local);
      return;
    }
    setDuplicateId(null);
    save.mutate(undefined, {
      onSuccess: (r) => {
        toast(editing ? t.app.saved : t.equipment.added);
        navigate(`/equipment/${r.id}`, { replace: true });
      },
      onError: (err) => {
        setErrs(fieldErrors(err));
        setError(errorMessage(err));
        if (err instanceof ApiError && typeof err.extra.equipmentId === "string")
          setDuplicateId(err.extra.equipmentId);
      },
    });
  }

  const activeDepts = (depts.data ?? []).filter((d) => d.isActive || d.id === f.homeDepartmentId);
  const engineers = (provider.data?.engineers ?? []).filter((e) => e.isActive);

  return (
    <>
      <PageHead
        title={editing ? t.equipment.editTitle : t.equipment.addTitle}
        back={{
          to: editing ? `/equipment/${id}` : "/equipment",
          label: editing ? t.app.back : t.equipment.title,
        }}
      />
      <form className="form" onSubmit={submit} noValidate>
        {error && !Object.keys(errs).length && <Notice tone="bad">{error}</Notice>}
        <ModelPicker
          value={f.modelId}
          label={modelLabel}
          error={errs.modelId}
          onChange={(m) => {
            setF({ ...f, modelId: m.id });
            setModelLabel(`${m.typeName}, ${m.manufacturer} ${m.model}`);
          }}
        />
        <TextField
          label={t.equipment.serial}
          value={f.serialNumber}
          onChange={(v) => setF({ ...f, serialNumber: v })}
          error={errs.serialNumber}
          serial
        />
        {duplicateId && (
          <Notice
            tone="bad"
            action={<Link to={`/equipment/${duplicateId}`}>{t.equipment.openExisting}</Link>}
          >
            {t.equipment.serialDuplicate}
          </Notice>
        )}
        <TextField
          label={t.equipment.tag}
          value={f.hospitalTag}
          onChange={(v) => setF({ ...f, hospitalTag: v })}
          error={errs.hospitalTag}
          optional
          serial
        />
        <SelectField
          label={t.equipment.provider}
          value={f.serviceProviderId}
          onChange={(v) => setF({ ...f, serviceProviderId: v, serviceEngineerIds: [] })}
          options={(providers.data ?? [])
            .filter((p) => p.isActive || p.id === f.serviceProviderId)
            .map((p) => ({ value: p.id, label: p.name }))}
          placeholder={t.fields.choose}
          error={errs.serviceProviderId}
          help={!providers.data?.length ? <Link to="/service-providers">{t.providers.add}</Link> : undefined}
        />
        <SelectField
          label={t.equipment.homeDepartment}
          value={f.homeDepartmentId}
          onChange={(v) => setF({ ...f, homeDepartmentId: v })}
          options={activeDepts.map((d) => ({ value: d.id, label: d.name }))}
          placeholder={t.fields.choose}
          error={errs.homeDepartmentId}
          help={!depts.data?.length ? <Link to="/departments">{t.departments.add}</Link> : undefined}
        />
        <DateField
          label={t.equipment.installedOn}
          value={f.installedOn}
          onChange={(v) => setF({ ...f, installedOn: v })}
          error={errs.installedOn}
        />
        {!editing && f.serviceProviderId && (
          <div className="field">
            <label>
              {t.equipment.designated} <span className="opt">({t.app.optional})</span>
            </label>
            <div className="help">{t.equipment.designatedHelp}</div>
            {engineers.length ? (
              engineers.map((se) => (
                <Checkbox
                  key={se.id}
                  checked={f.serviceEngineerIds.includes(se.id)}
                  onChange={(on) =>
                    setF({
                      ...f,
                      serviceEngineerIds: on
                        ? [...f.serviceEngineerIds, se.id]
                        : f.serviceEngineerIds.filter((x) => x !== se.id),
                    })
                  }
                >
                  {se.name}
                  {se.phone && <span className="muted"> {se.phone}</span>}
                </Checkbox>
              ))
            ) : (
              <p className="muted secondary">{t.providers.engineersEmpty}</p>
            )}
          </div>
        )}
        {!editing && (
          <DateField
            label={t.equipment.lastPmsDone}
            value={f.lastPmsDoneOn}
            onChange={(v) => setF({ ...f, lastPmsDoneOn: v })}
            error={errs.lastPmsDoneOn}
            help={t.equipment.lastPmsDoneHelp}
            optional
          />
        )}
        <TextArea
          label={t.equipment.notes}
          value={f.notes}
          onChange={(v) => setF({ ...f, notes: v })}
          optional
          rows={3}
        />
        <div>
          <button className="btn primary" type="submit" disabled={save.isPending || !online}>
            {editing ? t.app.saveChanges : t.equipment.add}
          </button>
        </div>
      </form>
    </>
  );
}

/** Choose a model, or add one inline (unique by manufacturer + model). */
function ModelPicker({
  value,
  label,
  error,
  onChange,
}: {
  value: string;
  label: string;
  error?: string | undefined;
  onChange: (m: Model) => void;
}) {
  const [q, setQ] = useState("");
  const dq = useDebounced(q.trim());
  const [adding, setAdding] = useState(false);
  const [m, setM] = useState<ModelDraft>(modelDraft());
  const [photo, setPhoto] = useState<File | null>(null);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const list = useQuery({
    queryKey: qk.models(dq),
    queryFn: () => get<Model[]>(`/models?q=${encodeURIComponent(dq)}`),
    enabled: !value || !!q,
  });
  const create = useSave(async () => {
    const created = await post<Model>("/models", modelBody(m));
    // The model is saved either way; a failed photo can be added later on the Models screen.
    if (photo)
      await uploadModelPhoto(created.id, photo, `${m.manufacturer} ${m.model}`).catch(() => undefined);
    return created;
  }, [["models"]]);

  if (value && !q && !adding) {
    return (
      <div className="field">
        <label>{t.models.model}</label>
        <div className="input-like" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ flex: 1 }}>{label}</span>
          <button type="button" className="btn plain" onClick={() => setQ(" ")}>
            {t.models.chooseOrAdd}
          </button>
        </div>
      </div>
    );
  }

  if (adding) {
    return (
      <fieldset className="field" style={{ border: "1px solid var(--line)", borderRadius: 6, padding: 12 }}>
        <legend>{t.models.addNew}</legend>
        <div className="form">
          <ModelFields m={m} setM={setM} errs={errs} photo={photo} setPhoto={setPhoto} />
          <div className="actions" style={{ margin: 0 }}>
            <button
              type="button"
              className="btn"
              onClick={() => {
                const photoErr = checkModelPhoto(photo);
                if (photoErr) return setErrs({ photo: photoErr });
                create.mutate(undefined, {
                  onSuccess: (created) => {
                    onChange(created);
                    setAdding(false);
                    setQ("");
                  },
                  onError: (e) => setErrs(fieldErrors(e)),
                });
              }}
            >
              {t.models.addNew}
            </button>
            <button type="button" className="btn plain" onClick={() => setAdding(false)}>
              {t.app.cancel}
            </button>
          </div>
        </div>
      </fieldset>
    );
  }

  return (
    <div className={`field${error ? " has-error" : ""}`}>
      <label htmlFor="model-search">{t.models.model}</label>
      <input
        id="model-search"
        className="input"
        type="search"
        value={q.trimStart()}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t.models.searchHelp}
        autoComplete="off"
      />
      {error && <div className="error">{error}</div>}
      <ul className="rows" style={{ marginTop: 8 }}>
        {list.data?.map((x) => (
          <li className="row" key={x.id}>
            <button
              type="button"
              className="row-link"
              onClick={() => {
                onChange(x);
                setQ("");
              }}
            >
              <ModelThumb fileId={x.photoFileId} name={`${x.manufacturer} ${x.model}`} size={40} />
              <div className="row-main">
                <div className="row-title" style={{ fontSize: "var(--fs-body)" }}>
                  {x.manufacturer} {x.model}
                </div>
                <div className="row-line">{x.typeName}</div>
              </div>
            </button>
          </li>
        ))}
        {list.data && !list.data.length && <li className="empty">{t.models.noMatch}</li>}
      </ul>
      <button type="button" className="btn plain" onClick={() => setAdding(true)} style={{ marginTop: 4 }}>
        {t.models.addNew}
      </button>
    </div>
  );
}
