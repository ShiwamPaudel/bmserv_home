import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { t } from "@bmserv/shared/terms";
import { get } from "../../lib/api";
import { useCan, useDebounced, useTitle } from "../../lib/hooks";
import { qk } from "../../lib/queryKeys";
import type { DepartmentListItem, EquipmentRow, ProviderListItem } from "../../lib/types";
import { EquipmentLine } from "../../components/EquipmentLine";
import { LoadError, Loading, PageHead, Rows } from "../../components/ui";

export function EquipmentList() {
  useTitle(t.equipment.title);
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const dq = useDebounced(q.trim());
  const department = params.get("department") ?? "";
  const status = params.get("status") ?? "";
  const coverage = params.get("coverage") ?? "";
  const provider = params.get("provider") ?? "";
  const [limit, setLimit] = useState(100);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const canEdit = useCan("equipment.edit");
  const canImport = useCan("equipment.import");
  const navigate = useNavigate();

  const search = new URLSearchParams({ q: dq, department, status, coverage, provider, limit: String(limit) });
  const list = useQuery({
    queryKey: qk.equipmentList(search.toString()),
    queryFn: () => get<{ rows: EquipmentRow[]; total: number }>(`/equipment?${search}`),
    placeholderData: (prev) => prev,
  });
  const depts = useQuery({ queryKey: qk.departments, queryFn: () => get<DepartmentListItem[]>("/departments") });
  const providers = useQuery({ queryKey: qk.providers, queryFn: () => get<ProviderListItem[]>("/service-providers") });

  const setFilter = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };
  const anyFilter = !!(dq || department || status || coverage || provider);
  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <>
      <PageHead title={t.equipment.title}>
        {canEdit && (
          <Link className="btn primary" to="/equipment/new">
            {t.equipment.add}
          </Link>
        )}
      </PageHead>
      <div className="search-bar">
        <label className="visually-hidden" htmlFor="eq-search">
          {t.equipment.searchLabel}
        </label>
        <input id="eq-search" className="input" type="search" placeholder={t.equipment.searchPlaceholder} value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="filters">
          <select aria-label={t.equipment.filterDepartment} value={department} onChange={(e) => setFilter("department", e.target.value)}>
            <option value="">{t.equipment.filterDepartment}: {t.app.all}</option>
            {depts.data?.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <select aria-label={t.equipment.filterStatus} value={status} onChange={(e) => setFilter("status", e.target.value)}>
            <option value="">{t.equipment.filterStatus}: {t.app.all}</option>
            <option value="working">{t.status.equipment.working}</option>
            <option value="breakdown">{t.status.equipment.breakdown}</option>
            <option value="out_of_service">{t.status.equipment.out_of_service}</option>
            <option value="away">{t.status.away}</option>
            <option value="label">{t.status.labelOutdated}</option>
          </select>
          <select aria-label={t.equipment.filterCoverage} value={coverage} onChange={(e) => setFilter("coverage", e.target.value)}>
            <option value="">{t.equipment.coverageAny}</option>
            <option value="under">{t.equipment.coverageUnder}</option>
            <option value="none">{t.equipment.coverageNone}</option>
          </select>
          <select aria-label={t.equipment.filterProvider} value={provider} onChange={(e) => setFilter("provider", e.target.value)}>
            <option value="">{t.equipment.filterProvider}: {t.app.all}</option>
            {providers.data?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="actions" style={{ marginTop: 0 }}>
        {selecting ? (
          <>
            <button className="btn primary" disabled={!selected.length} onClick={() => navigate(`/print/labels?ids=${selected.join(",")}`)}>
              {t.equipment.printSelected(selected.length)}
            </button>
            <button
              className="btn"
              onClick={() => {
                setSelecting(false);
                setSelected([]);
              }}
            >
              {t.equipment.cancelSelect}
            </button>
          </>
        ) : (
          <button className="btn" onClick={() => setSelecting(true)}>
            {t.equipment.selectForLabels}
          </button>
        )}
        {canImport && (
          <Link className="btn plain" to="/equipment/import">
            {t.equipment.import}
          </Link>
        )}
        <a className="btn plain" href="/api/export/equipment.csv">
          {t.export.equipment}
        </a>
      </div>

      {list.isLoading ? (
        <Loading />
      ) : list.error ? (
        <LoadError error={list.error} retry={() => void list.refetch()} />
      ) : (
        <>
          <p className="muted small" style={{ marginBottom: 4 }}>
            {t.equipment.count(list.data?.total ?? 0)}
          </p>
          <Rows isEmpty={!list.data?.rows.length} empty={anyFilter ? t.equipment.noMatch : t.equipment.empty}>
            {list.data?.rows.map((e) =>
              selecting ? (
                <EquipmentLine
                  key={e.id}
                  e={e}
                  selected={selected.includes(e.id)}
                  onClick={() => toggle(e.id)}
                  before={
                    <label className="row-check">
                      <input type="checkbox" aria-label={`${e.typeName} ${e.serialNumber}`} checked={selected.includes(e.id)} onChange={() => toggle(e.id)} />
                    </label>
                  }
                />
              ) : (
                <EquipmentLine key={e.id} e={e} />
              ),
            )}
          </Rows>
          {list.data && list.data.total > list.data.rows.length && (
            <div className="actions">
              <button className="btn" onClick={() => setLimit(limit + 100)}>
                {t.equipment.loadMore}
              </button>
            </div>
          )}
        </>
      )}
    </>
  );
}
