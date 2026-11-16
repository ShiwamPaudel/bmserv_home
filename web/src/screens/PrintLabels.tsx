import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import QRCode from "qrcode";
import { t } from "@bmserv/shared/terms";
import { get, post } from "../lib/api";
import { useMe, useSave, useTitle } from "../lib/hooks";
import { qk } from "../lib/queryKeys";
import type { EquipmentRow } from "../lib/types";
import { CELLS_PER_SHEET, placeLabels } from "../print/labelSheet";
import { iconProps, LoadError, Loading, Notice, PageHead, useToast } from "../components/ui";
import "../print/label.css";

/** 210 mm at 96 px per inch: the preview shrinks the sheets to fit the space beside the controls. */
const SHEET_PX = (210 / 25.4) * 96;

export function PrintLabels() {
  useTitle(t.labels.title);
  const [params] = useSearchParams();
  const ids = (params.get("ids") ?? "").split(",").filter(Boolean);
  const [start, setStart] = useState(Math.min(Math.max(Number(params.get("start") ?? 1), 1), 8));
  const me = useMe();
  const q = useQuery({
    queryKey: qk.labels(ids.join(",")),
    queryFn: () => get<EquipmentRow[]>(`/equipment/labels?ids=${ids.join(",")}`),
    enabled: ids.length > 0,
  });
  const [qr, setQr] = useState<Record<string, string>>({});
  const [printed, setPrinted] = useState(false);
  const toast = useToast();
  const mark = useSave(() => post("/equipment/labels-printed", { ids }));
  const appUrl = me.data?.appUrl ?? window.location.origin;
  const previewRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    if (!q.data) return;
    let alive = true;
    void Promise.all(
      q.data.map(
        async (e) =>
          [
            e.id,
            await QRCode.toString(`${appUrl}/e/${e.qrCode}`, {
              type: "svg",
              errorCorrectionLevel: "M",
              margin: 4,
              color: { dark: "#000000", light: "#ffffff" },
            }),
          ] as const,
      ),
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

  // Fit the A4 preview to the space it has (print always uses actual size).
  useEffect(() => {
    const el = previewRef.current;
    if (!el) return;
    const fit = () => {
      const pad = parseFloat(getComputedStyle(el).paddingLeft) * 2;
      setZoom(Math.min(1, Math.max(0.3, (el.clientWidth - pad) / SHEET_PX)));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [q.data]);

  const hospital = me.data?.hospital;
  const sheets = placeLabels(q.data ?? [], start);
  const free = CELLS_PER_SHEET - start + 1;
  const ready = !!q.data && Object.keys(qr).length >= q.data.length;
  const back = ids.length === 1 ? `/equipment/${ids[0]}` : "/equipment";

  return (
    <div className="label-screen">
      <div className="no-print">
        <PageHead title={t.labels.title} back={{ to: back, label: t.app.back }} />
      </div>
      {!ids.length ? (
        <Notice tone="off">{t.labels.nothing}</Notice>
      ) : (
        <div className="labels-layout">
          <aside className="labels-panel no-print">
            <div className="labels-summary">
              <span className="labels-count">{t.labels.count(ids.length)}</span>
              <span className="muted">{t.labels.sheets(sheets.length)}</span>
            </div>

            <div className="field">
              <div className="labels-label" id="start-label">
                {t.labels.startAt}
              </div>
              <div className="sheet-picker" role="group" aria-labelledby="start-label">
                {Array.from({ length: CELLS_PER_SHEET }, (_, i) => i + 1).map((p) => {
                  const state = p < start ? "used" : p < start + ids.length ? "new" : "free";
                  return (
                    <button
                      key={p}
                      type="button"
                      className={`cell ${state}`}
                      aria-pressed={p === start}
                      aria-label={`${t.labels.position(p)}, ${state === "used" ? t.labels.legendUsed : state === "new" ? t.labels.legendNew : t.labels.legendFree}`}
                      onClick={() => setStart(p)}
                    >
                      {p}
                    </button>
                  );
                })}
              </div>
              <div className="sheet-legend" aria-hidden="true">
                <span>
                  <i className="swatch used" />
                  {t.labels.legendUsed}
                </span>
                <span>
                  <i className="swatch new" />
                  {t.labels.legendNew}
                </span>
                <span>
                  <i className="swatch free" />
                  {t.labels.legendFree}
                </span>
              </div>
              <div className="help">{t.labels.startAtHelp}</div>
            </div>

            {ids.length > free && <Notice tone="wait">{t.labels.tooMany(ids.length, free)}</Notice>}

            <button className="btn primary labels-print" onClick={() => window.print()} disabled={!ready}>
              <Printer {...iconProps} size={18} />
              {t.labels.print}
            </button>
            <p className="help labels-note">{t.labels.printNote}</p>

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
          </aside>

          <section className="labels-preview" aria-label={t.labels.preview}>
            <div className="labels-preview-head no-print">
              <span>{t.labels.preview}</span>
              <span className="muted">{t.labels.sheets(sheets.length)}</span>
            </div>
            <div className="preview-wrap" ref={previewRef} style={{ "--sheet-zoom": zoom } as React.CSSProperties}>
              {q.isLoading && <Loading />}
              {q.error && <LoadError error={q.error} />}
              {q.data &&
                sheets.map((sheet, si) => (
                  <div className="sheet-frame" key={si}>
                    {sheets.length > 1 && <div className="sheet-name no-print">{t.labels.sheetOf(si + 1, sheets.length)}</div>}
                    <div className="sheet-a4">
                      {sheet.map((cell) => (
                        <div
                          key={cell.position}
                          className={`label-cell${cell.item ? "" : " blank"}`}
                          style={{ left: `${cell.xMm}mm`, top: `${cell.yMm}mm` }}
                        >
                          {cell.item ? (
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
                          ) : (
                            <span className="label-pos no-print">{cell.position}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
