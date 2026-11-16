import type { PmsUnit } from "@bmserv/shared/enums";
import { t } from "@bmserv/shared/terms";
import { shrinkImage } from "../lib/image";
import type { Model } from "../lib/types";
import { checkFile, uploadFile } from "../lib/upload";
import { ModelPhotoField } from "./ModelPhoto";
import { PmsFrequencyField } from "./PmsFrequencyField";
import { TextField } from "./ui";

export type ModelDraft = { typeName: string; manufacturer: string; model: string; category: string; pmsEvery: string; pmsUnit: PmsUnit };

export function modelDraft(m?: Model): ModelDraft {
  return {
    typeName: m?.typeName ?? "",
    manufacturer: m?.manufacturer ?? "",
    model: m?.model ?? "",
    category: m?.category ?? "",
    pmsEvery: m?.pmsEvery ? String(m.pmsEvery) : "",
    pmsUnit: m?.pmsUnit ?? "months",
  };
}

export function modelBody(d: ModelDraft) {
  return { ...d, category: d.category || null, pmsEvery: d.pmsEvery ? Number(d.pmsEvery) : "" };
}

/** Checks the chosen photo before anything is saved; returns an error to show at the field. */
export function checkModelPhoto(file: File | null): string | null {
  if (!file) return null;
  if (!file.type.startsWith("image/")) return t.files.photoOnly;
  return checkFile(file, "photo");
}

/** Uploads the model's photo to R2 (made smaller first). The server swaps it in and deletes the old one. */
export async function uploadModelPhoto(modelId: string, file: File, name: string): Promise<void> {
  const small = await shrinkImage(file);
  await uploadFile(small, { ownerType: "model", ownerId: modelId, kind: "photo", title: name, note: null }, () => undefined);
}

/** Equipment type, manufacturer, model, category, PMS frequency (months by default) and photo. */
export function ModelFields({
  m,
  setM,
  errs,
  photo,
  setPhoto,
  currentPhotoId = null,
}: {
  m: ModelDraft;
  setM: (m: ModelDraft) => void;
  errs: Record<string, string>;
  photo: File | null;
  setPhoto: (f: File | null) => void;
  currentPhotoId?: string | null;
}) {
  return (
    <>
      <TextField label={t.models.type} value={m.typeName} onChange={(v) => setM({ ...m, typeName: v })} error={errs.typeName} help={t.models.typeHelp} />
      <TextField label={t.models.manufacturer} value={m.manufacturer} onChange={(v) => setM({ ...m, manufacturer: v })} error={errs.manufacturer} />
      <TextField label={t.models.modelName} value={m.model} onChange={(v) => setM({ ...m, model: v })} error={errs.model ?? errs.modelKey} />
      <TextField label={t.models.category} value={m.category} onChange={(v) => setM({ ...m, category: v })} optional />
      <PmsFrequencyField
        label={t.models.pmsEvery}
        every={m.pmsEvery}
        unit={m.pmsUnit}
        onChange={(pmsEvery, pmsUnit) => setM({ ...m, pmsEvery, pmsUnit })}
        error={errs.pmsEvery ?? errs.pmsUnit}
      />
      <ModelPhotoField currentFileId={currentPhotoId} name={`${m.manufacturer} ${m.model}`.trim()} file={photo} onFile={setPhoto} error={errs.photo} />
    </>
  );
}
