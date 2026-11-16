import { useState } from "react";
import { Download, ExternalLink, FileImage, FileText, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { isManualKind, type FileKind, type FileOwnerType } from "@bmserv/shared/enums";
import { t } from "@bmserv/shared/terms";
import { post } from "../lib/api";
import { useCan, useOnline } from "../lib/hooks";
import { registerKeys } from "../lib/queryKeys";
import type { FileRow } from "../lib/types";
import { checkFile, formatBytes, openFile, uploadFile } from "../lib/upload";
import { MomentText } from "../lib/dates";
import { Confirm, iconProps, Notice, Row, Rows, SelectField, Sheet, TextField, useToast } from "./ui";

const isImage = (mimeType: string) => mimeType.startsWith("image/");

/** The file's kind at a glance: a PDF or an image, in a square like the model photo. */
export function FileIcon({ mimeType }: { mimeType: string }) {
  const Icon = isImage(mimeType) ? FileImage : FileText;
  return (
    <span className="file-icon" aria-hidden="true">
      <Icon {...iconProps} size={22} />
    </span>
  );
}

export function fileTypeLabel(mimeType: string): string {
  return isImage(mimeType) ? t.files.typeImage : t.files.typePdf;
}

/** Open, Download and (when allowed) Remove, as real buttons. */
export function FileActions({
  id,
  title,
  onError,
  onRemove,
}: {
  id: string;
  title: string;
  onError: (message: string) => void;
  onRemove?: () => void;
}) {
  const online = useOnline();
  const run = (download: boolean) => {
    if (!online) return onError(t.app.noConnection);
    openFile(id, download).catch((e: Error) => onError(e.message));
  };
  return (
    <div className="file-actions">
      <button className="btn small" type="button" onClick={() => run(false)} aria-label={t.files.openTitle(title)}>
        <ExternalLink {...iconProps} size={16} />
        {t.files.open}
      </button>
      <button className="btn small" type="button" onClick={() => run(true)} disabled={!online} aria-label={t.files.downloadTitle(title)}>
        <Download {...iconProps} size={16} />
        {t.files.download}
      </button>
      {onRemove && (
        <button className="btn small danger" type="button" onClick={onRemove} disabled={!online} aria-label={t.files.removeTitle(title)}>
          <Trash2 {...iconProps} size={16} />
          {t.files.remove}
        </button>
      )}
    </div>
  );
}

/** `readOnly`: open and download only (manuals on an equipment page are managed on the model's page). */
export function FileRows({ files, empty, readOnly }: { files: FileRow[]; empty: string; readOnly?: boolean }) {
  const canRemove = useCan("file.remove") && !readOnly;
  const qc = useQueryClient();
  const toast = useToast();
  const [removing, setRemoving] = useState<FileRow | null>(null);
  const [err, setErr] = useState<string | null>(null);
  return (
    <>
      {err && <Notice tone="bad">{err}</Notice>}
      <Rows isEmpty={!files.length} empty={empty}>
        {files.map((f) => (
          <Row
            key={f.id}
            className="file-row"
            thumb={<FileIcon mimeType={f.mimeType} />}
            title={f.title}
            lines={[
              <>
                {t.fileKind[f.kind]}
                {f.note && <span className="sep">{f.note}</span>}
              </>,
              <>
                {fileTypeLabel(f.mimeType)}, {formatBytes(f.sizeBytes)}
                <span className="sep">
                  {t.files.addedOn} <MomentText ms={f.createdAt} />
                </span>
              </>,
            ]}
            side={<FileActions id={f.id} title={f.title} onError={setErr} {...(canRemove ? { onRemove: () => setRemoving(f) } : {})} />}
          />
        ))}
      </Rows>
      {removing && (
        <Confirm
          message={t.files.removeConfirm}
          confirmLabel={t.files.remove}
          danger
          onCancel={() => setRemoving(null)}
          onConfirm={async () => {
            try {
              await post(`/files/${removing.id}/remove`);
              await Promise.all(registerKeys.map((k) => qc.invalidateQueries({ queryKey: k })));
              toast(t.files.removed);
            } catch (e) {
              setErr((e as Error).message);
            }
            setRemoving(null);
          }}
        />
      )}
    </>
  );
}

/** Choose file, then a progress bar with size, then done. Shows the limit before choosing. */
export function UploadSheet({
  title,
  ownerType,
  ownerId,
  kinds,
  defaultTitle = "",
  onClose,
  onDone,
}: {
  title: string;
  ownerType: FileOwnerType;
  ownerId: string;
  kinds: FileKind[];
  defaultTitle?: string;
  onClose: () => void;
  onDone?: (fileId: string) => void;
}) {
  const [kind, setKind] = useState<FileKind>(kinds[0] as FileKind);
  const [name, setName] = useState(defaultTitle);
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<{ loaded: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErr, setFieldErr] = useState<Record<string, string>>({});
  const online = useOnline();
  const qc = useQueryClient();
  const toast = useToast();
  const manual = isManualKind(kind);

  async function submit() {
    const errs: Record<string, string> = {};
    if (!file) errs.file = t.fields.required;
    if (!name.trim() && !file) errs.title = t.fields.required;
    const problem = file ? checkFile(file, kind) : null;
    if (problem) errs.file = problem;
    setFieldErr(errs);
    if (Object.keys(errs).length || !file) return;
    setError(null);
    try {
      setProgress({ loaded: 0, total: file.size });
      const id = await uploadFile(
        file,
        { ownerType, ownerId, kind, title: name.trim() || file.name.replace(/\.[^.]+$/, ""), note: note.trim() || null },
        (loaded, total) => setProgress({ loaded, total }),
      );
      await Promise.all(registerKeys.map((k) => qc.invalidateQueries({ queryKey: k })));
      toast(t.files.uploaded);
      onDone?.(id);
      onClose();
    } catch (e) {
      setProgress(null);
      setError((e as Error).message || t.files.failed);
    }
  }

  return (
    <Sheet
      title={title}
      onClose={onClose}
      footer={
        <>
          <button className="btn primary" onClick={submit} disabled={!!progress || !online}>
            {t.files.upload}
          </button>
          <button className="btn" onClick={onClose}>
            {t.app.cancel}
          </button>
        </>
      }
    >
      <div className="form">
        {!online && <Notice tone="off">{t.app.noConnection}</Notice>}
        {error && <Notice tone="bad">{error}</Notice>}
        {kinds.length > 1 && (
          <SelectField label={t.files.kind} value={kind} onChange={(v) => setKind(v as FileKind)} options={kinds.map((k) => ({ value: k, label: t.fileKind[k] }))} />
        )}
        <div className={`field${fieldErr.file ? " has-error" : ""}`}>
          <label htmlFor="upload-file">{t.files.chooseFile}</label>
          <input
            id="upload-file"
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              setFile(f);
              if (f && !name) setName(f.name.replace(/\.[^.]+$/, ""));
            }}
          />
          {fieldErr.file ? <div className="error">{fieldErr.file}</div> : <div className="help">{manual ? t.files.limitManual : t.files.limitOther}</div>}
        </div>
        <TextField label={t.files.title} value={name} onChange={setName} error={fieldErr.title} />
        <TextField label={manual ? t.files.note : t.files.docNote} value={note} onChange={setNote} optional help={manual ? t.files.noteHelp : undefined} />
        {progress && (
          <div aria-live="polite">
            <div className="secondary">{t.files.uploading(formatBytes(progress.loaded), formatBytes(progress.total))}</div>
            <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((progress.loaded / Math.max(1, progress.total)) * 100)}>
              <div style={{ width: `${(progress.loaded / Math.max(1, progress.total)) * 100}%` }} />
            </div>
          </div>
        )}
      </div>
    </Sheet>
  );
}
