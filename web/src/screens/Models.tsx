import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { t } from "@bmserv/shared/terms";
import { errorMessage, fieldErrors, get, patch, post } from "../lib/api";
import { useCan, useDebounced, useSave, useTitle } from "../lib/hooks";
import { qk } from "../lib/queryKeys";
import type { Model, ModelDetail } from "../lib/types";
import {
  checkModelPhoto,
  ModelFields,
  modelBody,
  modelDraft,
  uploadModelPhoto,
} from "../components/ModelFields";
import { ModelThumb } from "../components/ModelPhoto";
import { EquipmentLine } from "../components/EquipmentLine";
import { FileRows, UploadSheet } from "../components/files";
import {
  Fact,
  LoadError,
  Loading,
  PageHead,
  Row,
  Rows,
  Section,
  SheetForm,
  useToast,
} from "../components/ui";
import { SetupTabs } from "../components/SetupTabs";

const pmsText = (m: Model) => (m.pmsEvery ? t.coverage.pmsLine(t.pmsEvery(m.pmsEvery, m.pmsUnit)) : null);

/** Models: photo, equipment type, manufacturer, model and PMS frequency. Manuals belong to the model. */
export function Models() {
  useTitle(t.models.title);
  const canEdit = useCan("model.edit");
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const dq = useDebounced(q.trim());
  const list = useQuery({
    queryKey: qk.models(`all:${dq}`),
    queryFn: () => get<Model[]>(`/models${dq ? `?q=${encodeURIComponent(dq)}` : ""}`),
  });
  const [adding, setAdding] = useState(false);

  return (
    <>
      <PageHead title={t.nav.setup}>
        {canEdit && (
          <button className="btn primary" onClick={() => setAdding(true)}>
            {t.models.add}
          </button>
        )}
      </PageHead>
      <SetupTabs />
      <div className="search-bar">
        <label htmlFor="model-q" className="visually-hidden">
          {t.models.searchLabel}
        </label>
        <input
          id="model-q"
          className="input"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t.models.searchPlaceholder}
        />
      </div>
      {list.isLoading ? (
        <Loading />
      ) : list.error ? (
        <LoadError error={list.error} retry={() => void list.refetch()} />
      ) : (
        <Rows isEmpty={!list.data?.length} empty={dq ? t.models.noMatch : t.models.empty}>
          {list.data?.map((m) => (
            <Row
              key={m.id}
              to={`/models/${m.id}`}
              thumb={<ModelThumb fileId={m.photoFileId} name={`${m.manufacturer} ${m.model}`} size={52} />}
              title={
                <>
                  {m.typeName}, {m.manufacturer} {m.model}
                </>
              }
              lines={[
                <>
                  {pmsText(m) ?? <span style={{ color: "var(--wait-text)" }}>{t.models.pmsNotSet}</span>}
                  {m.category && <span className="sep">{m.category}</span>}
                </>,
                <>
                  {t.models.equipmentCount(m.equipmentCount ?? 0)}
                  <span className="sep">
                    {t.models.manuals}: {m.manualCount ?? 0}
                  </span>
                </>,
              ]}
            />
          ))}
        </Rows>
      )}
      {adding && <ModelSheet onClose={() => setAdding(false)} onSaved={(id) => navigate(`/models/${id}`)} />}
    </>
  );
}

/** One model: its photo and PMS frequency, its manuals (stored once, shared by every unit), its equipment. */
export function ModelPage() {
  const { id = "" } = useParams();
  const q = useQuery({ queryKey: qk.model(id), queryFn: () => get<ModelDetail>(`/models/${id}`) });
  const canEdit = useCan("model.edit");
  const canUpload = useCan("file.upload");
  const [open, setOpen] = useState<null | "edit" | "manual">(null);
  useTitle(q.data ? `${q.data.model.manufacturer} ${q.data.model.model}` : t.models.title);
  if (q.isLoading) return <Loading />;
  if (q.error || !q.data) return <LoadError error={q.error} retry={() => void q.refetch()} />;
  const { model: m, manuals, equipment } = q.data;
  const name = `${m.manufacturer} ${m.model}`;

  return (
    <>
      <PageHead title={m.typeName} back={{ to: "/models", label: t.models.title }}>
        {canEdit && (
          <button className="btn" onClick={() => setOpen("edit")}>
            {t.models.edit}
          </button>
        )}
      </PageHead>
      <div className="eq-head">
        <ModelThumb fileId={m.photoFileId} name={name} size={96} />
        <div className="titles">
          <div className="row-title">{name}</div>
          <div className="facts" style={{ marginTop: 8 }}>
            <Fact label={t.models.pmsEvery}>{pmsText(m) ?? t.models.pmsNotSet}</Fact>
            {m.category && <Fact label={t.models.category}>{m.category}</Fact>}
          </div>
        </div>
      </div>

      <Section
        title={t.models.manuals}
        action={
          canUpload ? (
            <button className="btn plain" onClick={() => setOpen("manual")}>
              {t.files.uploadManual}
            </button>
          ) : undefined
        }
      >
        <FileRows files={manuals} empty={t.models.manualsEmpty} />
      </Section>

      <Section title={t.models.equipmentOfModel}>
        <Rows isEmpty={!equipment.length} empty={t.models.equipmentEmpty}>
          {equipment.map((e) => (
            <EquipmentLine key={e.id} e={e} />
          ))}
        </Rows>
      </Section>

      {open === "edit" && <ModelSheet model={m} onClose={() => setOpen(null)} onSaved={() => undefined} />}
      {open === "manual" && (
        <UploadSheet
          title={t.files.uploadManual}
          ownerType="model"
          ownerId={m.id}
          kinds={["service_manual", "operation_manual", "other_manual"]}
          defaultTitle={name}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  );
}

function ModelSheet({
  model,
  onClose,
  onSaved,
}: {
  model?: Model;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const [m, setM] = useState(modelDraft(model));
  const [photo, setPhoto] = useState<File | null>(null);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const save = useSave(async () => {
    const r = model
      ? await patch<{ id: string }>(`/models/${model.id}`, modelBody(m))
      : await post<{ id: string }>("/models", modelBody(m));
    if (!photo) return { id: r.id, photoFailed: false };
    try {
      await uploadModelPhoto(r.id, photo, `${m.manufacturer} ${m.model}`);
      return { id: r.id, photoFailed: false };
    } catch {
      return { id: r.id, photoFailed: true };
    }
  }, [["models"], ["equipment"], ["home"], ["breakdowns"]]);
  return (
    <SheetForm
      title={model ? t.models.editTitle : t.models.addTitle}
      onClose={onClose}
      submitLabel={model ? t.app.saveChanges : t.models.add}
      busy={save.isPending}
      error={Object.keys(errs).length ? null : error}
      onSubmit={() => {
        const photoErr = checkModelPhoto(photo);
        if (photoErr) return setErrs({ photo: photoErr });
        save.mutate(undefined, {
          onSuccess: (r) => {
            toast(r.photoFailed ? t.models.photoFailed : t.app.saved);
            onSaved(r.id);
            onClose();
          },
          onError: (e) => {
            setErrs(fieldErrors(e));
            setError(errorMessage(e));
          },
        });
      }}
    >
      <ModelFields
        m={m}
        setM={setM}
        errs={errs}
        photo={photo}
        setPhoto={setPhoto}
        currentPhotoId={model?.photoFileId ?? null}
      />
    </SheetForm>
  );
}
