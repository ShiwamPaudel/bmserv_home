import { useId } from "react";
import { pmsUnits, type PmsUnit } from "@bmserv/shared/enums";
import { t } from "@bmserv/shared/terms";

/** "PMS frequency: [ 6 ] [ Months ▾ ]". Months is the usual unit. Empty number = no PMS (when allowed). */
export function PmsFrequencyField({
  label,
  every,
  unit,
  onChange,
  error,
  help,
  optional,
}: {
  label: string;
  every: string;
  unit: PmsUnit;
  onChange: (every: string, unit: PmsUnit) => void;
  error?: string | undefined;
  help?: string;
  optional?: boolean;
}) {
  const id = useId();
  return (
    <div className={`field${error ? " has-error" : ""}`}>
      <label htmlFor={id}>
        {label} {optional && <span className="opt">({t.app.optional})</span>}
      </label>
      <div className="pms-line">
        <span className="pms-every-word">{t.models.everyWord}</span>
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={1}
          max={999}
          value={every}
          onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, "").slice(0, 3), unit)}
          aria-invalid={!!error}
          aria-describedby={`${id}-msg`}
        />
        <select aria-label={t.models.pmsEvery} value={unit} onChange={(e) => onChange(every, e.target.value as PmsUnit)}>
          {pmsUnits.map((u) => (
            <option key={u} value={u}>
              {t.pmsUnit[u]}
            </option>
          ))}
        </select>
      </div>
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
