import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { t } from "@bmserv/shared/terms";
import { get } from "../lib/api";
import { useDebounced, useTitle } from "../lib/hooks";
import { qk } from "../lib/queryKeys";
import type { ManualRow } from "../lib/types";
import { formatBytes } from "../lib/upload";
import { FileActions, FileIcon, fileTypeLabel } from "../components/files";
import { LoadError, Loading, Notice, PageHead, Row, Rows } from "../components/ui";

export function Manuals() {
  useTitle(t.manuals.title);
  const [params] = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const dq = useDebounced(q.trim());
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
              className="file-row"
              thumb={<FileIcon mimeType={m.mimeType} />}
              title={m.title}
              lines={[
                <>
                  {t.fileKind[m.kind]}
                  <span className="sep">
                    <Link to={`/models/${m.modelId}`}>
                      {m.typeName}, {m.manufacturer} {m.model}
                    </Link>
                  </span>
                </>,
                <>
                  {fileTypeLabel(m.mimeType)}, {formatBytes(m.sizeBytes)}
                  {m.note && <span className="sep">{m.note}</span>}
                  <span className="sep">{t.manuals.usedBy(m.equipmentCount)}</span>
                </>,
              ]}
              side={<FileActions id={m.id} title={m.title} onError={setError} />}
            />
          ))}
        </Rows>
      )}
    </>
  );
}
