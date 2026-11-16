import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { t } from "@bmserv/shared/terms";
import { errorMessage, fieldErrors, get, post } from "../../lib/api";
import { useDebounced, useOnline, useSave, useTitle } from "../../lib/hooks";
import { qk } from "../../lib/queryKeys";
import type { EquipmentDetail, EquipmentRow } from "../../lib/types";
import { EquipmentLine } from "../../components/EquipmentLine";
import { Notice, PageHead, Rows, TextArea, TextField, useToast } from "../../components/ui";

/** Local datetime-local value for now (device clock). */
function nowLocal(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export function BreakdownNew() {
  useTitle(t.breakdowns.recordTitle);
  const [params] = useSearchParams();
  const [equipmentId, setEquipmentId] = useState(params.get("equipment") ?? "");
  const [search, setSearch] = useState("");
  const dq = useDebounced(search.trim());
  const [f, setF] = useState({ problem: "", reportedByName: "", reportedAt: nowLocal() });
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const online = useOnline();
  const toast = useToast();
  const navigate = useNavigate();
  const chosen = useQuery({ queryKey: qk.equipment(equipmentId), queryFn: () => get<EquipmentDetail>(`/equipment/${equipmentId}`), enabled: !!equipmentId });
  const results = useQuery({
    queryKey: qk.equipmentList(`q=${dq}&limit=20`),
    queryFn: () => get<{ rows: EquipmentRow[] }>(`/equipment?q=${encodeURIComponent(dq)}&limit=20`),
    enabled: !equipmentId && dq.length > 1,
  });
  const save = useSave(() =>
    post<{ id: string; numberText: string }>("/breakdowns", {
      equipmentId,
      problem: f.problem,
      reportedByName: f.reportedByName,
      reportedAt: new Date(f.reportedAt).getTime() || Date.now(),
    }),
  );

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!equipmentId) return setErrs({ equipmentId: t.fields.choose });
    save.mutate(undefined, {
      onSuccess: (r) => {
        toast(t.breakdowns.recorded(r.numberText));
        navigate(`/breakdowns/${r.id}`, { replace: true });
      },
      onError: (er) => {
        setErrs(fieldErrors(er));
        setError(errorMessage(er));
      },
    });
  }

  const eq = chosen.data;
  return (
    <>
      <PageHead title={t.breakdowns.recordTitle} back={{ to: equipmentId ? `/equipment/${equipmentId}` : "/breakdowns", label: t.app.back }} />
      <form className="form" onSubmit={submit} noValidate>
        {error && !Object.keys(errs).length && <Notice tone="bad">{error}</Notice>}
        <div className={`field${errs.equipmentId ? " has-error" : ""}`}>
          <label htmlFor="bd-eq">{t.breakdowns.equipment}</label>
          {equipmentId && eq ? (
            <>
              <Rows isEmpty={false} empty="">
                <EquipmentLine e={eq.equipment} noLink />
              </Rows>
              <button type="button" className="btn plain" onClick={() => setEquipmentId("")}>
                {t.breakdowns.findEquipment}
              </button>
              {eq.openBreakdowns.map((b) => (
                <Notice key={b.id} tone="wait" action={<Link to={`/breakdowns/${b.id}`}>{t.breakdowns.openExisting}</Link>}>
                  {t.breakdowns.already}
                </Notice>
              ))}
            </>
          ) : (
            <>
              <input id="bd-eq" className="input" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t.equipment.searchPlaceholder} />
              <div className="help">
                {t.breakdowns.findEquipmentHelp} <Link to="/scan">{t.app.scan}</Link>
              </div>
              {errs.equipmentId && <div className="error">{errs.equipmentId}</div>}
              {results.data && (
                <Rows isEmpty={!results.data.rows.length} empty={t.equipment.noMatch}>
                  {results.data.rows.map((r) => (
                    <EquipmentLine key={r.id} e={r} onClick={() => setEquipmentId(r.id)} />
                  ))}
                </Rows>
              )}
            </>
          )}
        </div>
        <TextArea label={t.breakdowns.problem} value={f.problem} onChange={(v) => setF({ ...f, problem: v })} error={errs.problem} />
        <TextField label={t.breakdowns.reportedBy} value={f.reportedByName} onChange={(v) => setF({ ...f, reportedByName: v })} error={errs.reportedByName} />
        <TextField label={t.breakdowns.reportedAt} type="datetime-local" value={f.reportedAt} onChange={(v) => setF({ ...f, reportedAt: v })} error={errs.reportedAt} />
        <div>
          <button className="btn primary" type="submit" disabled={save.isPending || !online}>
            {t.breakdowns.save}
          </button>
        </div>
      </form>
    </>
  );
}
