import { useState } from "react";
import { useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { t } from "@bmserv/shared/terms";
import { get } from "../lib/api";
import { useDebounced, useOnline, useTitle } from "../lib/hooks";
import { qk } from "../lib/queryKeys";
import type { ManualRow } from "../lib/types";
import { MomentText } from "../lib/dates";
import { formatBytes, openFile } from "../lib/upload";
import { LoadError, Loading, Notice, PageHead, Row, Rows } from "../components/ui";

export function Manuals() {
  useTitle(t.manuals.title);
  const [params] = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const dq = useDebounced(q.trim());
  const online = useOnline();
  const [error, setError] = useState<string | null>(null);
  const list = useQuery({ queryKey: qk.manuals(dq), queryFn: () => get<ManualRow[]>(`/manuals?q=${encodeURIComponent(dq)}`), placeholderData: (p) => p });
  return (
    <>
      <PageHead title={t.manuals.title} />
      <div className="search-bar">
        <label className="visually-hidden" htmlFor="manual-search">
          {t.manuals.searchLabel}
        </label>
        <input id="manual-search" className="input" type="search" placeholder={t.manuals.searchPlaceholder} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {error && <Notice tone="bad">{error}</Notice>}
      {list.isLoading ? (
        <Loading />
      ) : list.error ? (
        <LoadError error={list.error} retry={() => void list.refetch()} />
      ) : (
        <Rows isEmpty={!list.data?.length} empty={dq ? t.manuals.noMatch : t.manuals.empty}>
          {list.data?.map((m) => (
            <Row
              key={m.id}
              onClick={() => (online ? openFile(m.id).catch((e: Error) => setError(e.message)) : setError(t.app.noConnection))}
              title={t.manuals.rowTitle(t.fileKind[m.kind], `${m.manufacturer} ${m.model}`)}
              lines={[
                <>
                  {m.title}
                  {m.note && <span className="sep">{m.note}</span>}
                </>,
                <>
                  {formatBytes(m.sizeBytes)}
                  <span className="sep">
                    {t.files.addedOn} <MomentText ms={m.createdAt} />
                  </span>
                </>,
              ]}
            />
          ))}
        </Rows>
      )}
    </>
  );
}
