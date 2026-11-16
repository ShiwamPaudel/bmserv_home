import { useState } from "react";
import { z } from "zod";
import { t } from "@bmserv/shared/terms";
import type { Recipient, RecipientOptions } from "../../lib/types";
import { Checkbox } from "../../components/ui";

const key = (r: Recipient) => r.email.toLowerCase();

/**
 * Checklist grouped "Service department" and "Designated service engineers", then
 * "Add another service engineer" and "Add an email address" (DESIGN.md section 6).
 */
export function RecipientsEditor({
  options,
  value,
  onChange,
}: {
  options: RecipientOptions;
  value: Recipient[];
  onChange: (next: Recipient[]) => void;
}) {
  const [addEngineer, setAddEngineer] = useState(false);
  const [extra, setExtra] = useState("");
  const [extraErr, setExtraErr] = useState<string | null>(null);

  // Everything that can be ticked: defaults, anything saved, anything added here.
  const all: Recipient[] = [];
  for (const r of [...options.defaults, ...options.saved, ...value]) if (!all.some((x) => key(x) === key(r))) all.push(r);
  const dept = all.filter((r) => r.source === "contact");
  const engineers = all.filter((r) => r.source === "service_engineer");
  const others = all.filter((r) => r.source === "extra");
  const isOn = (r: Recipient) => value.some((x) => key(x) === key(r));
  const toggle = (r: Recipient, on: boolean) => onChange(on ? [...value, r] : value.filter((x) => key(x) !== key(r)));
  const moreEngineers = options.engineers.filter((e) => e.email && !all.some((x) => x.email.toLowerCase() === e.email?.toLowerCase()));

  const group = (title: string, list: Recipient[]) =>
    list.length > 0 && (
      <div className="recipient-group">
        <h3>{title}</h3>
        {list.map((r) => (
          <Checkbox key={key(r)} checked={isOn(r)} onChange={(on) => toggle(r, on)}>
            {r.name && r.source !== "contact" ? `${r.name}, ` : ""}
            {r.email}
            {r.source === "contact" && r.name && <span className="muted secondary"> {r.name}</span>}
          </Checkbox>
        ))}
      </div>
    );

  return (
    <div>
      {group(t.breakdowns.groupDepartment, dept)}
      {group(t.breakdowns.groupEngineers, engineers)}
      {group(t.breakdowns.groupOthers, others)}
      {!dept.length && <p className="muted secondary">{t.breakdowns.noRecipients(options.provider.name)}</p>}

      {addEngineer ? (
        <div className="recipient-group">
          <h3>{t.breakdowns.addEngineer}</h3>
          {moreEngineers.length ? (
            moreEngineers.map((e) => (
              <button
                key={e.id}
                type="button"
                className="btn plain"
                style={{ display: "flex" }}
                onClick={() => {
                  onChange([...value, { source: "service_engineer", sourceId: e.id, email: e.email as string, name: e.name }]);
                  setAddEngineer(false);
                }}
              >
                {e.name}, {e.email}
              </button>
            ))
          ) : (
            <p className="muted secondary">{t.providers.engineersEmpty}</p>
          )}
        </div>
      ) : (
        <button type="button" className="btn plain" onClick={() => setAddEngineer(true)}>
          {t.breakdowns.addEngineer}
        </button>
      )}

      <div className={`field${extraErr ? " has-error" : ""}`} style={{ marginTop: 8 }}>
        <label htmlFor="extra-email">{t.breakdowns.addAddress}</label>
        <div className="repeat-line">
          <input id="extra-email" className="input" type="email" value={extra} onChange={(e) => setExtra(e.target.value)} />
          <button
            type="button"
            className="btn"
            onClick={() => {
              const email = extra.trim().toLowerCase();
              if (!z.email().safeParse(email).success) return setExtraErr(t.fields.email);
              setExtraErr(null);
              setExtra("");
              if (!value.some((x) => x.email === email)) onChange([...value, { source: "extra", sourceId: null, email, name: null }]);
            }}
          >
            {t.breakdowns.addAddress}
          </button>
        </div>
        {extraErr && <div className="error">{extraErr}</div>}
      </div>
    </div>
  );
}
