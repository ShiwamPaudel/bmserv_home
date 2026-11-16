import { useState } from "react";
import { useNavigate } from "react-router";
import { importTemplate } from "@bmserv/shared/csv";
import { t } from "@bmserv/shared/terms";
import { errorMessage, post } from "../../lib/api";
import { useCan, useOnline, useSave, useTitle } from "../../lib/hooks";
import { Notice, PageHead, Pill, Row, Rows, useToast } from "../../components/ui";

type Preview = {
  ok: number;
  bad: number;
  rows: { row: number; typeName: string; manufacturer: string; model: string; serialNumber: string; department: string; problems: string[]; newModel: boolean }[];
};

export function ImportEquipment() {
  useTitle(t.importer.title);
  const allowed = useCan("equipment.import");
  const online = useOnline();
  const toast = useToast();
  const navigate = useNavigate();
  const [csv, setCsv] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const check = useSave((text: string) => post<Preview>("/equipment/import/preview", { csv: text }));
  const commit = useSave((text: string) => post<{ count: number }>("/equipment/import", { csv: text }));

  if (!allowed) return <Notice tone="off">{t.app.noAccess}</Notice>;

  function downloadTemplate() {
    const blob = new Blob([importTemplate()], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "bmserv-equipment-template.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <>
      <PageHead title={t.importer.title} back={{ to: "/equipment", label: t.equipment.title }} />
      <p>{t.importer.help}</p>
      <div className="actions">
        <button className="btn" onClick={downloadTemplate}>
          {t.importer.template}
        </button>
        <label className="btn primary">
          {t.importer.choose}
          <input
            type="file"
            accept=".csv,text/csv"
            className="visually-hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              const text = await file.text();
              setCsv(text);
              setError(null);
              setPreview(null);
              check.mutate(text, { onSuccess: setPreview, onError: (er) => setError(errorMessage(er)) });
            }}
          />
        </label>
      </div>
      {error && <Notice tone="bad">{error}</Notice>}
      {preview && (
        <>
          <Notice tone={preview.bad ? "wait" : "ok"}>
            {t.importer.rowsOk(preview.ok)}
            {preview.bad > 0 && `. ${t.importer.rowsBad(preview.bad)}. ${t.importer.fixFirst}`}
          </Notice>
          <Rows isEmpty={!preview.rows.length} empty={t.importer.empty}>
            {preview.rows.map((r) => (
              <Row
                key={r.row}
                title={`${t.importer.row(r.row)}: ${r.typeName || "?"}`}
                lines={[
                  `${r.manufacturer} ${r.model}${r.newModel ? `. ${t.importer.newModel}` : ""}`,
                  <>
                    {t.equipment.serialShort} <span className="serial">{r.serialNumber}</span>
                    <span className="sep">{r.department}</span>
                  </>,
                  ...r.problems.map((p) => <span style={{ color: "var(--bad-text)" }}>{p}</span>),
                ]}
                side={<Pill tone={r.problems.length ? "bad" : "ok"}>{r.problems.length ? t.status.failed : t.app.yes}</Pill>}
              />
            ))}
          </Rows>
          <div className="actions">
            <button
              className="btn primary"
              disabled={!!preview.bad || !preview.ok || !online || commit.isPending}
              onClick={() =>
                csv &&
                commit.mutate(csv, {
                  onSuccess: (r) => {
                    toast(t.importer.imported(r.count));
                    navigate("/equipment");
                  },
                  onError: (er) => setError(errorMessage(er)),
                })
              }
            >
              {t.importer.confirm(preview.ok)}
            </button>
          </div>
        </>
      )}
    </>
  );
}
