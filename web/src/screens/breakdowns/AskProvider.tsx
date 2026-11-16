import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { t } from "@bmserv/shared/terms";
import { errorMessage, get, post } from "../../lib/api";
import { useOnline, useSave, useTitle } from "../../lib/hooks";
import { qk } from "../../lib/queryKeys";
import type { Recipient, RecipientOptions } from "../../lib/types";
import { Confirm, LoadError, Loading, Notice, PageHead, Section, useToast } from "../../components/ui";
import { RecipientsEditor } from "./RecipientsEditor";

/** Ask service provider for help: recipients, a preview, then "Send email to {n} recipients". */
export function AskProvider() {
  const { id = "" } = useParams();
  useTitle(t.breakdowns.askTitle);
  const q = useQuery({ queryKey: qk.recipientOptions(id), queryFn: () => get<RecipientOptions>(`/breakdowns/${id}/recipients/default`) });
  const [value, setValue] = useState<Recipient[] | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const online = useOnline();
  const toast = useToast();
  const navigate = useNavigate();
  const send = useSave(() => post<{ status: string; error?: string }>(`/breakdowns/${id}/ask-provider`, { recipients: value ?? [] }), [qk.breakdown(id)]);

  useEffect(() => {
    if (q.data && value === null) setValue(q.data.saved.length ? q.data.saved : q.data.defaults);
  }, [q.data, value]);

  if (q.isLoading || !value) return q.error ? <LoadError error={q.error} /> : <Loading />;
  const o = q.data!;

  return (
    <>
      <PageHead title={t.breakdowns.askTitle} back={{ to: `/breakdowns/${id}`, label: t.app.back }} />
      <p className="muted">{o.provider.name}</p>
      {error && <Notice tone="bad">{error}</Notice>}
      <Section title={t.breakdowns.recipients}>
        <p className="help" style={{ marginBottom: 12 }}>
          {t.breakdowns.recipientsHelp}
        </p>
        <RecipientsEditor options={o} value={value} onChange={setValue} />
      </Section>
      <Section title={t.breakdowns.preview}>
        <p style={{ fontWeight: 500, marginBottom: 8 }} className="wrap-anywhere">
          {o.preview.subject}
        </p>
        <div className="preview-box">{o.preview.text}</div>
      </Section>
      <div className="actions">
        <button className="btn primary" disabled={!value.length || !online || send.isPending} onClick={() => setConfirm(true)}>
          {t.breakdowns.sendTo(value.length)}
        </button>
      </div>
      {!value.length && <Notice tone="wait">{t.breakdowns.noRecipients(o.provider.name)}</Notice>}
      {confirm && (
        <Confirm
          message={t.breakdowns.sendConfirm}
          confirmLabel={t.breakdowns.sendTo(value.length)}
          busy={send.isPending}
          onCancel={() => setConfirm(false)}
          onConfirm={() =>
            send.mutate(undefined, {
              onSuccess: (r) => {
                setConfirm(false);
                toast(r.status === "sent" ? t.breakdowns.sent : `${t.status.failed}: ${r.error ?? ""}`);
                navigate(`/breakdowns/${id}`, { replace: true });
              },
              onError: (e) => {
                setConfirm(false);
                setError(errorMessage(e));
              },
            })
          }
        />
      )}
    </>
  );
}
