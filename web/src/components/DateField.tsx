// Date picker in the calendar chosen in Settings: Nepali (BS) selects, or a plain AD date field. Value is AD YYYY-MM-DD.
import { useEffect, useId, useState } from "react";
import { adToBs, bsMonthNames, bsToAd, bsYearRange, daysInBsMonth, todayNepal } from "@bmserv/shared/dates";
import { t } from "@bmserv/shared/terms";
import { dateMode } from "../lib/dates";

type Parts = { year: string; month: string; day: string };

function partsOf(ad: string | null): Parts {
  const bs = ad ? adToBs(ad) : null;
  return bs ? { year: String(bs.year), month: String(bs.month), day: String(bs.day) } : { year: "", month: "", day: "" };
}

export function DateField({
  label,
  value,
  onChange,
  error,
  help,
  optional,
  minYearsBack = 40,
  yearsAhead = 15,
}: {
  label: string;
  value: string | null;
  onChange: (ad: string | null) => void;
  error?: string | undefined;
  help?: string;
  optional?: boolean;
  minYearsBack?: number;
  yearsAhead?: number;
}) {
  const id = useId();
  const [p, setP] = useState<Parts>(() => partsOf(value));
  useEffect(() => {
    // Follow outside changes (e.g. form reset) without fighting the user's partial input.
    const current = p.year && p.month && p.day ? bsToAd({ year: +p.year, month: +p.month, day: +p.day }) : null;
    if (value !== current && (value || (p.year && p.month && p.day))) setP(partsOf(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the value changes from outside
  }, [value]);

  if (dateMode() === "ad") {
    return (
      <div className={`field${error ? " has-error" : ""}`}>
        <label htmlFor={id}>
          {label} {optional && <span className="opt">({t.app.optional})</span>}
        </label>
        <input id={id} type="date" className="input" value={value ?? ""} onChange={(e) => onChange(e.target.value || null)} aria-describedby={`${id}-msg`} />
        {error ? <div className="error" id={`${id}-msg`}>{error}</div> : help ? <div className="help" id={`${id}-msg`}>{help}</div> : null}
      </div>
    );
  }

  const thisYear = adToBs(todayNepal())?.year ?? 2083;
  const first = Math.max(bsYearRange.first, thisYear - minYearsBack);
  const last = Math.min(bsYearRange.last, thisYear + yearsAhead);
  const years = Array.from({ length: last - first + 1 }, (_, i) => last - i);
  const days = p.year && p.month ? daysInBsMonth(+p.year, +p.month) : 32;

  function update(next: Parts) {
    const max = next.year && next.month ? daysInBsMonth(+next.year, +next.month) : 32;
    if (next.day && +next.day > max) next = { ...next, day: String(max) };
    setP(next);
    if (next.year && next.month && next.day) onChange(bsToAd({ year: +next.year, month: +next.month, day: +next.day }));
    else onChange(null);
  }

  return (
    <div className={`field${error ? " has-error" : ""}`}>
      <fieldset aria-describedby={`${id}-msg`}>
        <legend>
          {label} {optional && <span className="opt">({t.app.optional})</span>}
        </legend>
        <div className="date-field">
          <select aria-label={`${label}: ${t.dates.nepaliDay}`} value={p.day} onChange={(e) => update({ ...p, day: e.target.value })}>
            <option value="">{t.dates.nepaliDay}</option>
            {Array.from({ length: days }, (_, i) => i + 1).map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <select aria-label={`${label}: ${t.dates.nepaliMonth}`} value={p.month} onChange={(e) => update({ ...p, month: e.target.value })}>
            <option value="">{t.dates.nepaliMonth}</option>
            {bsMonthNames.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
          <select aria-label={`${label}: ${t.dates.nepaliYear}`} value={p.year} onChange={(e) => update({ ...p, year: e.target.value })}>
            <option value="">{t.dates.nepaliYear}</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          {optional && value && (
            <button type="button" className="btn plain" onClick={() => update({ year: "", month: "", day: "" })}>
              {t.dates.clear}
            </button>
          )}
        </div>
      </fieldset>
      {error ? (
        <div className="error" id={`${id}-msg`}>
          {error}
        </div>
      ) : help ? (
        <div className="help" id={`${id}-msg`}>
          {help}
        </div>
      ) : null}
    </div>
  );
}
