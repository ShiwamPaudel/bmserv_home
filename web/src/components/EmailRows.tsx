import { t } from "@bmserv/shared/terms";
import { MomentText } from "../lib/dates";
import type { EmailLogRow } from "../lib/types";
import { Pill, Row, Rows } from "./ui";

/** Emails sent, with sent or failed (PRD section 6: every email is logged and shown). */
export function EmailRows({ emails, empty }: { emails: EmailLogRow[]; empty: string }) {
  return (
    <Rows isEmpty={!emails.length} empty={empty}>
      {emails.map((e) => (
        <Row
          key={e.id}
          title={<span className="wrap-anywhere" style={{ fontSize: "var(--fs-body)" }}>{e.subject}</span>}
          lines={[
            <>
              <MomentText ms={e.createdAt} />
              <span className="sep">{e.byName ? t.emailLog.by(e.byName) : t.emailLog.automatic}</span>
            </>,
            <span className="wrap-anywhere">
              {t.emailLog.to}: {e.toAddresses}
              {e.ccAddresses ? `. ${t.emailLog.cc}: ${e.ccAddresses}` : ""}
            </span>,
            e.status === "failed" && e.error ? `${t.emailLog.error}: ${e.error}` : null,
          ]}
          side={<Pill tone={e.status === "sent" ? "ok" : e.status === "failed" ? "bad" : "off"}>{e.status === "failed" ? t.status.failed : t.status.sent}</Pill>}
        />
      ))}
    </Rows>
  );
}
