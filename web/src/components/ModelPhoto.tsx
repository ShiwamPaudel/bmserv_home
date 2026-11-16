import { useEffect, useId, useState } from "react";
import { Camera, Package } from "lucide-react";
import { t } from "@bmserv/shared/terms";
import { useOnline } from "../lib/hooks";

/** The model's photo beside its name; a quiet placeholder when there is none or it cannot load. */
export function ModelThumb({ fileId, name, size = 44 }: { fileId: string | null | undefined; name: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const online = useOnline();
  useEffect(() => setFailed(false), [fileId]);
  const style = { width: size, height: size };
  if (!fileId || failed || !online) {
    return (
      <span className="model-thumb empty" style={style} aria-hidden="true">
        <Package size={Math.round(size * 0.5)} strokeWidth={1.5} />
      </span>
    );
  }
  return (
    <img
      className="model-thumb"
      style={style}
      src={`/api/files/${fileId}/image`}
      alt={t.models.photoAlt(name)}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}

/** Choose or change the model's photo; shows a preview of the new one before it is saved. */
export function ModelPhotoField({
  currentFileId,
  name,
  file,
  onFile,
  error,
}: {
  currentFileId: string | null;
  name: string;
  file: File | null;
  onFile: (f: File | null) => void;
  error?: string | undefined;
}) {
  const id = useId();
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const has = !!preview || !!currentFileId;
  return (
    <div className={`field${error ? " has-error" : ""}`}>
      <label htmlFor={id}>
        {t.models.photo} <span className="opt">({t.app.optional})</span>
      </label>
      <div className="photo-field">
        {preview ? (
          <img className="model-thumb large" src={preview} alt={t.models.photoAlt(name)} />
        ) : (
          <ModelThumb fileId={currentFileId} name={name} size={88} />
        )}
        <div className="photo-field-side">
          <label className="btn" htmlFor={id}>
            <Camera size={18} strokeWidth={1.5} aria-hidden="true" />
            {has ? t.models.changePhoto : t.models.choosePhoto}
          </label>
          <input
            id={id}
            className="visually-hidden"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => onFile(e.target.files?.[0] ?? null)}
          />
          {file && <span className="help">{t.models.photoReady}</span>}
        </div>
      </div>
      {error ? <div className="error">{error}</div> : <div className="help">{t.models.photoHelp}</div>}
    </div>
  );
}
