import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import QRCode from "qrcode";
import { t } from "@bmserv/shared/terms";
import { get, post } from "../lib/api";
import { useMe, useSave, useTitle } from "../lib/hooks";
import { qk } from "../lib/queryKeys";
import type { EquipmentRow } from "../lib/types";
import { CELLS_PER_SHEET, placeLabels } from "../print/labelSheet";
import { LoadError, Loading, Notice, useToast } from "../components/ui";
import "../print/label.css";

export function PrintLabels() {
  useTitle(t.labels.title);
  const [params] = useSearchParams();
  const ids = (params.get("ids") ?? "").split(",").filter(Boolean);
  const [start, setStart] = useState(Math.min(Math.max(Number(params.get("start") ?? 1), 1), 8));
  const me = useMe();
  const q = useQuery({ queryKey: qk.labels(ids.join(",")), queryFn: () => get<EquipmentRow[]>(`/equipment/labels?ids=${ids.join(",")}`), enabled: ids.length > 0 });
  const [qr, setQr] = useState<Record<string, string>>({});
  const [printed, setPrinted] = useState(false);
  const toast = useToast();
  const mark = useSave(() => post("/equipment/labels-printed", { ids }));
  const appUrl = me.data?.appUrl ?? window.location.origin;

  useEffect(() => {
    if (!q.data) return;
    let alive = true;
    void Promise.all(
      q.data.map(async (e) => [e.id, await QRCode.toString(`${appUrl}/e/${e.qrCode}`, { type: "svg", errorCorrectionLevel: "M", margin: 4, color: { dark: "#000000", light: "#ffffff" } })] as const),
    ).then((pairs) => alive && setQr(Object.fromEntries(pairs)));
    return () => {
      alive = false;
    };
  }, [q.data, appUrl]);

  useEffect(() => {
    const after = () => setPrinted(true);
    window.addEventListener("afterprint", after);
    return () => window.removeEventListener("afterprint", after);
  }, []);

  const hospital = me.data?.hospital;
  const sheets = placeLabels(q.data ?? [], start);
  const free = CELLS_PER_SHEET - start + 1;

  return (
    <div className="label-screen">
      <div className="label-controls no-print">
        <Link className="back-link" to={ids.length === 1 ? `/equipment/${ids[0]}` : "/equipment"}>
          {t.app.back}
        </Link>
        <h1 style={{ marginBottom: 12 }}>{t.labels.title}</h1>
        {!ids.length ? (
          <Notice tone="off">{t.labels.nothing}</Notice>
        ) : (
          <>
            <p>{t.labels.count(ids.length)}</p>
            <div className="field" style={{ margin: "12px 0" }}>
              <div style={{ fontWeight: 500, marginBottom: 4 }}>{t.labels.startAt}</div>
              <div className="grid-picker" role="group" aria-label={t.labels.startAt}>
                {Array.from({ length: 8 }, (_, i) => i + 1).map((p) => (
                  <button key={p} type="button" aria-pressed={p === start} className={p < start ? "used" : undefined} onClick={() => setStart(p)}>
                    {p}
                  </button>
                ))}
              </div>
              <div className="help">{t.labels.startAtHelp}</div>
            </div>
            {ids.length > free && <Notice tone="wait">{t.labels.tooMany(ids.length, free)}</Notice>}
            <p className="muted secondary">{t.labels.printNote}</p>
            <div className="actions">
              <button className="btn primary" onClick={() => window.print()} disabled={!q.data || Object.keys(qr).length < (q.data?.length ?? 0)}>
                {t.labels.print}
              </button>
            </div>
            {printed && (
              <Notice
                tone="ok"
                action={
                  <button
                    className="btn"
                    onClick={() =>
                      mark.mutate(undefined, {
                        onSuccess: () => {
                          toast(t.labels.printedSaved);
                          setPrinted(false);
                        },
                      })
                    }
                  >
                    {t.labels.markPrinted}
                  </button>
                }
              >
                {t.labels.afterPrint}
              </Notice>
            )}
          </>
        )}
      </div>

      {q.isLoading && <Loading />}
      {q.error && <LoadError error={q.error} />}
      {q.data && (
        <div className="preview-wrap">
          {sheets.map((sheet, si) => (
            <div className="sheet-a4" key={si}>
              {sheet.map((cell) => (
                <div
                  key={cell.position}
                  className={`label-cell${cell.item ? "" : " blank"}`}
                  style={{ left: `${cell.xMm}mm`, top: `${cell.yMm}mm` }}
                >
                  {cell.item && (
                    <>
                      <div className="label-corner" />
                      <div className="label-hospital">{hospital?.name}</div>
                      <div className="label-dept">{hospital?.departmentName}</div>
                      <div className="label-body">
                        <div className="label-qr" dangerouslySetInnerHTML={{ __html: qr[cell.item.id] ?? "" }} />
                        <div style={{ minWidth: 0 }}>
                          <div className="label-type">{cell.item.typeName}</div>
                          <div className="label-model">
                            {cell.item.manufacturer} {cell.item.model}
                          </div>
                          <div className="label-serial">
                            {t.equipment.serialShort} {cell.item.serialNumber}
                          </div>
                          <div className="label-home">
                            {t.labels.homeDepartment}: {cell.item.homeDepartmentName}
                          </div>
                        </div>
                      </div>
                      <div className="label-foot">{t.labels.scanLine}</div>
                    </>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
