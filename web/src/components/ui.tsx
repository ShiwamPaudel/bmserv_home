import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router";
import { ArrowLeft, Eye, EyeOff, MessageCircle, X } from "lucide-react";
import type { BreakdownStatus, EquipmentStatus } from "@bmserv/shared/enums";
import { countryCodes, DEFAULT_COUNTRY_CODE, isCountryCode, joinPhone, splitPhone, telHref, whatsAppLink } from "@bmserv/shared/phone";
import { t } from "@bmserv/shared/terms";
import { useMe, useOnline } from "../lib/hooks";

export const iconProps = { size: 20, strokeWidth: 1.5, "aria-hidden": true } as const;

// ---------- Status pill: always a word; colour supports it ----------
export type Tone = "ok" | "bad" | "wait" | "off";

export function Pill({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={`pill ${tone}`}>{children}</span>;
}

export function EquipmentStatusPill({ status }: { status: EquipmentStatus }) {
  const tone: Tone = status === "working" ? "ok" : status === "breakdown" ? "bad" : "off";
  return <Pill tone={tone}>{t.status.equipment[status]}</Pill>;
}

export function BreakdownStatusPill({ status, paused }: { status: BreakdownStatus; paused?: boolean }) {
  if (paused && status === "with_provider") return <Pill tone="wait">{t.status.paused}</Pill>;
  const tone: Tone =
    status === "open" ? "bad" : status === "with_provider" ? "wait" : status === "fixed" ? "ok" : "off";
  return <Pill tone={tone}>{t.status.breakdown[status]}</Pill>;
}

// ---------- Layout bits ----------
export function PageHead({
  title,
  back,
  children,
}: {
  title: ReactNode;
  back?: { to: string; label: string };
  children?: ReactNode;
}) {
  return (
    <>
      {back && (
        <Link className="back-link" to={back.to}>
          <ArrowLeft {...iconProps} size={18} />
          {back.label}
        </Link>
      )}
      <div className="page-head">
        <h1>{title}</h1>
        {children}
      </div>
    </>
  );
}

export function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="section">
      <div className="section-head">
        <h2>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Rows({
  children,
  empty,
  isEmpty,
}: {
  children: ReactNode;
  empty: ReactNode;
  isEmpty: boolean;
}) {
  return <ul className="rows">{isEmpty ? <li className="empty">{empty}</li> : children}</ul>;
}

export function Row({
  to,
  onClick,
  title,
  lines,
  side,
  flash,
  selected,
  before,
  thumb,
  className,
}: {
  to?: string;
  onClick?: () => void;
  title: ReactNode;
  lines?: ReactNode[];
  side?: ReactNode;
  flash?: boolean;
  selected?: boolean;
  before?: ReactNode;
  /** A small picture at the start of the row (model photo). */
  thumb?: ReactNode;
  className?: string;
}) {
  const inner = (
    <>
      {thumb}
      <div className="row-main">
        <div className="row-title">{title}</div>
        {lines?.filter(Boolean).map((l, i) => (
          <div className="row-line" key={i}>
            {l}
          </div>
        ))}
      </div>
      {side && <div className="row-side">{side}</div>}
    </>
  );
  return (
    <li
      className={`row${flash ? " flash" : ""}${selected ? " selected" : ""}${className ? ` ${className}` : ""}`}
      style={before ? { display: "flex" } : undefined}
    >
      {before}
      {to ? (
        <Link className="row-link" to={to}>
          {inner}
        </Link>
      ) : onClick ? (
        <button type="button" className="row-link" onClick={onClick}>
          {inner}
        </button>
      ) : (
        <div className="row-link" style={{ cursor: "default" }}>
          {inner}
        </div>
      )}
    </li>
  );
}

export function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="fact-label">{label}</div>
      <div className="fact-value">{children}</div>
    </div>
  );
}

/** The hospital's default country code (Settings), for numbers saved without one. */
export function useCountryCode(): string {
  return useMe().data?.hospital.countryCode ?? DEFAULT_COUNTRY_CODE;
}

export function Phone({ value }: { value: string | null | undefined }) {
  const code = useCountryCode();
  if (!value) return null;
  return <a href={telHref(value, code)}>{value}</a>;
}

/** Opens WhatsApp (wa.me) with the message ready; nothing is sent until the person presses send. */
export function WhatsAppButton({ phone, text, label, plain }: { phone: string | null | undefined; text: string; label?: string; plain?: boolean }) {
  const me = useMe();
  const code = me.data?.hospital.countryCode ?? DEFAULT_COUNTRY_CODE;
  if (me.data && !me.data.hospital.whatsappButtons) return null;
  const href = whatsAppLink(phone, text, code);
  if (!href) return null;
  return (
    <a className={`btn whatsapp${plain ? " plain" : ""}`} href={href} target="_blank" rel="noopener noreferrer" title={t.whatsapp.help}>
      <MessageCircle {...iconProps} size={18} />
      {label ?? t.whatsapp.button}
    </a>
  );
}
export function Email({ value }: { value: string | null | undefined }) {
  if (!value) return null;
  return <a href={`mailto:${value}`}>{value}</a>;
}

export function Notice({ tone, children, action }: { tone: Tone; children: ReactNode; action?: ReactNode }) {
  return (
    <div className={`notice notice-inline ${tone}`} role={tone === "bad" ? "alert" : "status"}>
      <div>{children}</div>
      {action && <div className="notice-action">{action}</div>}
    </div>
  );
}

export function Loading() {
  return (
    <p className="muted" style={{ padding: "16px 4px" }}>
      {t.app.loading}
    </p>
  );
}

export function LoadError({ error, retry }: { error: unknown; retry?: () => void }) {
  return (
    <Notice
      tone="bad"
      action={
        retry && (
          <button className="btn" onClick={retry}>
            {t.app.retry}
          </button>
        )
      }
    >
      {error instanceof Error ? error.message : t.app.somethingWrong}
    </Notice>
  );
}

export function Tabs<T extends string>({
  value,
  onChange,
  items,
}: {
  value: T;
  onChange: (v: T) => void;
  items: { value: T; label: string }[];
}) {
  return (
    <div className="tabs" role="tablist">
      {items.map((i) => (
        <button
          key={i.value}
          role="tab"
          aria-selected={value === i.value}
          onClick={() => onChange(i.value)}
          type="button"
        >
          {i.label}
        </button>
      ))}
    </div>
  );
}

// ---------- Fields ----------
type FieldShell = { label: string; error?: string | undefined; help?: ReactNode; optional?: boolean };

function Shell({
  id,
  label,
  error,
  help,
  optional,
  children,
}: FieldShell & { id: string; children: ReactNode }) {
  return (
    <div className={`field${error ? " has-error" : ""}`}>
      <label htmlFor={id}>
        {label} {optional && <span className="opt">({t.app.optional})</span>}
      </label>
      {children}
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

export function TextField({
  value,
  onChange,
  type = "text",
  autoComplete,
  inputMode,
  serial,
  revealable,
  ...shell
}: FieldShell & {
  value: string;
  onChange: (v: string) => void;
  type?: string;
  autoComplete?: string;
  inputMode?: "text" | "tel" | "email" | "numeric" | "search";
  serial?: boolean;
  /** Password with an eye button to show or hide it. */
  revealable?: boolean;
}) {
  const id = useId();
  const [shown, setShown] = useState(false);
  const input = (
    <input
      id={id}
      type={revealable && shown ? "text" : type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      autoComplete={autoComplete}
      inputMode={inputMode}
      aria-invalid={!!shell.error}
      aria-describedby={`${id}-msg`}
      className={serial ? "serial" : undefined}
    />
  );
  return (
    <Shell id={id} {...shell}>
      {revealable ? (
        <div className="input-reveal">
          {input}
          <button
            type="button"
            className="icon-btn"
            onClick={() => setShown(!shown)}
            aria-label={shown ? t.signIn.hidePassword : t.signIn.showPassword}
            aria-pressed={shown}
            aria-controls={id}
          >
            {shown ? <EyeOff {...iconProps} /> : <Eye {...iconProps} />}
          </button>
        </div>
      ) : (
        input
      )}
    </Shell>
  );
}

export function TextArea({
  value,
  onChange,
  rows = 4,
  ...shell
}: FieldShell & { value: string; onChange: (v: string) => void; rows?: number }) {
  const id = useId();
  return (
    <Shell id={id} {...shell}>
      <textarea
        id={id}
        value={value}
        rows={rows}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={!!shell.error}
        aria-describedby={`${id}-msg`}
      />
    </Shell>
  );
}

export function SelectField({
  value,
  onChange,
  options,
  placeholder,
  ...shell
}: FieldShell & {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
}) {
  const id = useId();
  return (
    <Shell id={id} {...shell}>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={!!shell.error}
        aria-describedby={`${id}-msg`}
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Shell>
  );
}

export function RadioGroup<T extends string>({
  label,
  value,
  onChange,
  options,
  error,
}: {
  label: string;
  value: T | "";
  onChange: (v: T) => void;
  options: { value: T; label: string; help?: string }[];
  error?: string | undefined;
}) {
  const name = useId();
  return (
    <div className={`field${error ? " has-error" : ""}`}>
      <fieldset>
        <legend>{label}</legend>
        {options.map((o) => (
          <label className="choice" key={o.value}>
            <input type="radio" name={name} checked={value === o.value} onChange={() => onChange(o.value)} />
            <span>
              {o.label}
              {o.help && (
                <span className="help" style={{ display: "block" }}>
                  {o.help}
                </span>
              )}
            </span>
          </label>
        ))}
      </fieldset>
      {error && <div className="error">{error}</div>}
    </div>
  );
}

/** Phone with a country code chosen from a list (default from Settings) or typed. Value: "+977 9812345678". */
export function PhoneField({
  value,
  onChange,
  label,
  error,
  help,
  optional,
}: FieldShell & { value: string; onChange: (v: string) => void }) {
  const id = useId();
  const defaultCode = useCountryCode();
  const parts = splitPhone(value, defaultCode);
  const [other, setOther] = useState(!countryCodes.some((c) => c.code === parts.code));
  const [code, setCode] = useState(parts.code);
  const [number, setNumber] = useState(parts.number);
  const emit = (c: string, n: string) => onChange(joinPhone(c, n));
  return (
    <div className={`field${error ? " has-error" : ""}`}>
      <label htmlFor={id}>
        {label} {optional && <span className="opt">({t.app.optional})</span>}
      </label>
      <div className="phone-line">
        {other ? (
          <input
            className="phone-code"
            aria-label={t.phone.countryCode}
            value={code}
            inputMode="tel"
            placeholder="+61"
            onChange={(e) => {
              setCode(e.target.value);
              emit(e.target.value, number);
            }}
            aria-invalid={!!code && !isCountryCode(code)}
          />
        ) : (
          <select
            className="phone-code"
            aria-label={t.phone.countryCode}
            value={code}
            onChange={(e) => {
              if (e.target.value === "other") {
                setOther(true);
                setCode("+");
                return;
              }
              setCode(e.target.value);
              emit(e.target.value, number);
            }}
          >
            {countryCodes.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} {c.name}
              </option>
            ))}
            <option value="other">{t.phone.other}</option>
          </select>
        )}
        <input
          id={id}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          value={number}
          onChange={(e) => {
            setNumber(e.target.value);
            emit(code, e.target.value);
          }}
          aria-invalid={!!error}
          aria-describedby={`${id}-msg`}
        />
      </div>
      {error ? (
        <div className="error" id={`${id}-msg`}>
          {error}
        </div>
      ) : help || other ? (
        <div className="help" id={`${id}-msg`}>
          {help ?? t.phone.otherHelp}
        </div>
      ) : null}
    </div>
  );
}

/** On/off setting: a switch with a label and optional help. */
export function Switch({
  checked,
  onChange,
  label,
  help,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: ReactNode;
  help?: ReactNode;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="switch-row">
      <div className="switch-text">
        <label htmlFor={id}>{label}</label>
        {help && <div className="help">{help}</div>}
      </div>
      <button id={id} type="button" role="switch" aria-checked={checked} className="switch" disabled={disabled} onClick={() => onChange(!checked)}>
        <span className="switch-knob" />
      </button>
    </div>
  );
}

export function Checkbox({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: ReactNode;
}) {
  return (
    <label className="choice">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{children}</span>
    </label>
  );
}

// ---------- Sheet: full screen on phone, side sheet on desktop ----------
export function Sheet({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>("input, select, textarea, button:not(.sheet-close)")?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      prev?.focus?.();
    };
  }, [onClose]);
  return createPortal(
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <div className="sheet-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn sheet-close" onClick={onClose} aria-label={t.app.close}>
            <X {...iconProps} />
          </button>
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </>,
    document.body,
  );
}

/** A form inside a sheet: errors at the field, one primary button, offline-safe. */
export function SheetForm({
  title,
  onClose,
  onSubmit,
  submitLabel,
  busy,
  error,
  danger,
  children,
}: {
  title: string;
  onClose: () => void;
  onSubmit: () => void;
  submitLabel: string;
  busy?: boolean;
  error?: string | null | undefined;
  danger?: boolean;
  children: ReactNode;
}) {
  const online = useOnline();
  const formId = useId();
  return (
    <Sheet
      title={title}
      onClose={onClose}
      footer={
        <>
          <button
            className={`btn ${danger ? "danger" : "primary"}`}
            type="submit"
            form={formId}
            disabled={busy || !online}
          >
            {submitLabel}
          </button>
          <button className="btn" type="button" onClick={onClose}>
            {t.app.cancel}
          </button>
        </>
      }
    >
      <form
        id={formId}
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
        noValidate
      >
        {!online && <Notice tone="off">{t.app.noConnection}</Notice>}
        {error && <Notice tone="bad">{error}</Notice>}
        {children}
      </form>
    </Sheet>
  );
}

// ---------- Confirm (no modal over a modal: used only from pages) ----------
export function Confirm({
  message,
  confirmLabel,
  onConfirm,
  onCancel,
  danger,
  busy,
}: {
  message: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
  busy?: boolean;
}) {
  return createPortal(
    <>
      <div className="dialog-backdrop" onClick={onCancel} />
      <div className="dialog" role="alertdialog" aria-modal="true">
        <p style={{ marginBottom: 24 }}>{message}</p>
        <div className="actions" style={{ margin: 0 }}>
          <button
            className={`btn ${danger ? "danger" : "primary"}`}
            onClick={onConfirm}
            disabled={busy}
            autoFocus
          >
            {confirmLabel}
          </button>
          <button className="btn" onClick={onCancel}>
            {t.app.cancel}
          </button>
        </div>
      </div>
    </>,
    document.body,
  );
}

// ---------- Toast: "every save confirms" ----------
const ToastCtx = createContext<(msg: string) => void>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((m: string) => {
    setMsg(m);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMsg(null), 3000);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      <div aria-live="polite">{msg && <div className="toast">{msg}</div>}</div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  return useContext(ToastCtx);
}
