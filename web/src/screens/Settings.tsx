import { useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Building2, CalendarDays, ClipboardList, Mail, TriangleAlert } from "lucide-react";
import { HOSPITAL_OWNER_ID } from "@bmserv/shared/enums";
import { countryCodes } from "@bmserv/shared/phone";
import { t } from "@bmserv/shared/terms";
import { errorMessage, fieldErrors, get, patch, post } from "../lib/api";
import { shrinkImage } from "../lib/image";
import { uploadFile } from "../lib/upload";
import { checkModelPhoto } from "../components/ModelFields";
import { useCan, useMe, useOnline, useTitle } from "../lib/hooks";
import { qk } from "../lib/queryKeys";
import type { Person, Settings } from "../lib/types";
import { MomentText } from "../lib/dates";
import { iconProps, LoadError, Loading, Notice, PageHead, PhoneField, RadioGroup, SelectField, Switch, TextField, useToast } from "../components/ui";

type Tab = keyof typeof t.settings.tabs;
const tabs: { id: Tab; icon: typeof Bell }[] = [
  { id: "hospital", icon: Building2 },
  { id: "region", icon: CalendarDays },
  { id: "emails", icon: Mail },
  { id: "alerts", icon: TriangleAlert },
  { id: "reporting", icon: ClipboardList },
  { id: "notifications", icon: Bell },
];

/** Hospital-wide settings, one tab at a time. Admin only. */
export function SettingsScreen() {
  useTitle(t.settings.title);
  const allowed = useCan("settings.edit");
  const me = useMe();
  const [params, setParams] = useSearchParams();
  const tab = (tabs.find((x) => x.id === params.get("tab"))?.id ?? "hospital") as Tab;
  const q = useQuery({ queryKey: qk.settings, queryFn: () => get<Settings>("/settings"), enabled: allowed });

  if (!allowed) return <Notice tone="off">{t.app.noAccess}</Notice>;
  if (q.isLoading || !q.data) return q.error ? <LoadError error={q.error} /> : <Loading />;

  return (
    <>
      <PageHead title={t.settings.title} />
      <p className="muted" style={{ marginBottom: 16 }}>
        {t.settings.intro}
      </p>
      {me.data?.emailRedirectTo && <Notice tone="wait">{t.settings.redirectOn(me.data.emailRedirectTo)}</Notice>}
      <div className="settings-layout">
        <nav className="settings-tabs" role="tablist" aria-label={t.settings.title}>
          {tabs.map((x) => (
            <button
              key={x.id}
              type="button"
              role="tab"
              aria-selected={tab === x.id}
              className={tab === x.id ? "active" : undefined}
              onClick={() => setParams({ tab: x.id }, { replace: true })}
            >
              <x.icon {...iconProps} size={18} />
              {t.settings.tabs[x.id]}
            </button>
          ))}
        </nav>
        <div className="settings-panel" role="tabpanel">
          <h2>{t.settings.tabs[tab]}</h2>
          <p className="muted" style={{ margin: "4px 0 16px" }}>
            {t.settings.tabHelp[tab]}
          </p>
          {/* key: a fresh form per tab, filled from the saved settings */}
          <TabForm key={`${tab}-${q.data.updatedAt}`} tab={tab} saved={q.data} />
        </div>
      </div>
    </>
  );
}

/** The logo saves on its own (straight to R2), apart from the Save button of the form. */
function HospitalLogoField({ logoFileId }: { logoFileId: string | null }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const qc = useQueryClient();
  const toast = useToast();
  const online = useOnline();

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: qk.settings });
    await qc.invalidateQueries({ queryKey: qk.me });
  };

  async function choose(file: File | undefined) {
    if (!file) return;
    const problem = checkModelPhoto(file);
    if (problem) return setErr(problem);
    setErr(null);
    setBusy(true);
    try {
      const small = await shrinkImage(file, 800, true);
      await uploadFile(small, { ownerType: "hospital", ownerId: HOSPITAL_OWNER_ID, kind: "photo", title: t.settings.logo, note: null }, () => undefined);
      await refresh();
      toast(t.settings.logoSaved);
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function remove() {
    if (!logoFileId) return;
    setBusy(true);
    try {
      await post(`/files/${logoFileId}/remove`);
      await refresh();
      toast(t.settings.logoRemoved);
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`field${err ? " has-error" : ""}`}>
      <div className="labels-label">{t.settings.logo}</div>
      <div className="logo-field">
        <div className="logo-preview">
          {logoFileId ? <img src={`/api/files/${logoFileId}/image`} alt={t.settings.logo} /> : <span className="muted secondary">{t.settings.noLogo}</span>}
        </div>
        <div className="logo-actions">
          <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => void choose(e.target.files?.[0])} />
          <button type="button" className="btn small" disabled={busy || !online} onClick={() => input.current?.click()}>
            {busy ? t.settings.logoUploading : logoFileId ? t.settings.changeLogo : t.settings.chooseLogo}
          </button>
          {logoFileId && (
            <button type="button" className="btn small danger" disabled={busy || !online} onClick={() => void remove()}>
              {t.settings.removeLogo}
            </button>
          )}
        </div>
      </div>
      {err ? <div className="error">{err}</div> : <div className="help">{t.settings.logoHelp}</div>}
    </div>
  );
}

function TabForm({ tab, saved }: { tab: Tab; saved: Settings }) {
  const [f, setF] = useState<Settings>({ ...saved });
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  const toast = useToast();
  const online = useOnline();
  const me = useMe();
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setF({ ...f, [k]: v });

  const fields: Record<Tab, (keyof Settings)[]> = {
    hospital: ["hospitalName", "hospitalAddress", "departmentName", "departmentEmail", "departmentPhone"],
    region: ["dateDisplay", "countryCode"],
    emails: ["dailyEmailTime", "pmsReminderDays", "emailCc", "emailTeamOnReport"],
    alerts: ["pmsSoonDays", "coverageWarnDays", "pausedWarnDays"],
    reporting: ["staffReports", "staffReportAssigneeId"],
    notifications: ["pushOnBreakdown", "pushOnFixed", "whatsappButtons"],
  };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const body: Record<string, unknown> = {};
    for (const k of fields[tab]) body[k] = f[k];
    if (tab === "emails") body.emailCc = f.emailCc.map((x) => x.trim()).filter(Boolean);
    setBusy(true);
    try {
      await patch("/settings", body);
      setErrs({});
      setError(null);
      await qc.invalidateQueries({ queryKey: qk.settings });
      await qc.invalidateQueries({ queryKey: qk.me });
      await qc.invalidateQueries({ queryKey: qk.home });
      toast(t.app.saved);
      // Dates are formatted everywhere; reload so every screen uses the new calendar.
      if (saved.dateDisplay !== f.dateDisplay) window.location.reload();
    } catch (err) {
      setErrs(fieldErrors(err));
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form" onSubmit={save} noValidate>
      {error && !Object.keys(errs).length && <Notice tone="bad">{error}</Notice>}
      {tab === "hospital" && (
        <>
          <HospitalLogoField logoFileId={saved.logoFileId} />
          <TextField label={t.settings.hospitalName} value={f.hospitalName} onChange={(v) => set("hospitalName", v)} error={errs.hospitalName} />
          <TextField label={t.settings.hospitalAddress} value={f.hospitalAddress ?? ""} onChange={(v) => set("hospitalAddress", v)} error={errs.hospitalAddress} optional />
          <TextField label={t.settings.departmentName} value={f.departmentName} onChange={(v) => set("departmentName", v)} error={errs.departmentName} />
          <TextField
            label={t.settings.departmentEmail}
            type="email"
            value={f.departmentEmail}
            onChange={(v) => set("departmentEmail", v)}
            error={errs.departmentEmail}
            help={t.settings.departmentEmailHelp}
          />
          <PhoneField label={t.settings.departmentPhone} value={f.departmentPhone} onChange={(v) => set("departmentPhone", v)} error={errs.departmentPhone} />
        </>
      )}

      {tab === "region" && (
        <>
          <RadioGroup
            label={t.settings.dateDisplay}
            value={f.dateDisplay}
            onChange={(v) => set("dateDisplay", v)}
            options={[
              { value: "bs", label: t.settings.dateBs },
              { value: "ad", label: t.settings.dateAd },
            ]}
          />
          <p className="help">{t.settings.dateDisplayHelp}</p>
          <SelectField
            label={t.settings.countryCode}
            value={f.countryCode}
            onChange={(v) => set("countryCode", v)}
            options={countryCodes.map((c) => ({ value: c.code, label: `${c.code} ${c.name}` }))}
            error={errs.countryCode}
            help={t.settings.countryCodeHelp}
          />
        </>
      )}

      {tab === "emails" && (
        <>
          <TextField
            label={t.settings.dailyEmailTime}
            type="time"
            value={f.dailyEmailTime}
            onChange={(v) => set("dailyEmailTime", v)}
            error={errs.dailyEmailTime}
            help={t.settings.dailyEmailTimeHelp}
          />
          <NumberField label={t.settings.pmsReminderDays} value={f.pmsReminderDays} onChange={(v) => set("pmsReminderDays", v)} error={errs.pmsReminderDays} />
          <div className="field">
            <label>
              {t.settings.emailCc} <span className="opt">({t.app.optional})</span>
            </label>
            {f.emailCc.map((addr, i) => (
              <div className="repeat-line" key={i}>
                <input
                  type="email"
                  className="input"
                  aria-label={`${t.settings.emailCc} ${i + 1}`}
                  value={addr}
                  onChange={(e) => set("emailCc", f.emailCc.map((x, j) => (j === i ? e.target.value : x)))}
                />
                <button type="button" className="btn plain" onClick={() => set("emailCc", f.emailCc.filter((_, j) => j !== i))}>
                  {t.settings.remove}
                </button>
              </div>
            ))}
            {Object.entries(errs)
              .filter(([k]) => k.startsWith("emailCc"))
              .map(([k, v]) => (
                <div className="error" key={k}>
                  {v}
                </div>
              ))}
            <button type="button" className="btn plain" onClick={() => set("emailCc", [...f.emailCc, ""])}>
              {t.settings.addEmail}
            </button>
          </div>
          <Switch
            checked={f.emailTeamOnReport}
            onChange={(v) => set("emailTeamOnReport", v)}
            label={t.settings.emailTeamOnReport}
            help={t.settings.emailTeamOnReportHelp}
          />
        </>
      )}

      {tab === "alerts" && (
        <>
          <NumberField label={t.settings.pmsSoonDays} value={f.pmsSoonDays} onChange={(v) => set("pmsSoonDays", v)} error={errs.pmsSoonDays} />
          <NumberField label={t.settings.coverageWarnDays} value={f.coverageWarnDays} onChange={(v) => set("coverageWarnDays", v)} error={errs.coverageWarnDays} />
          <NumberField label={t.settings.pausedWarnDays} value={f.pausedWarnDays} onChange={(v) => set("pausedWarnDays", v)} error={errs.pausedWarnDays} />
        </>
      )}

      {tab === "reporting" && <ReportingFields f={f} set={set} errs={errs} />}

      {tab === "notifications" && (
        <>
          {!me.data?.pushPublicKey && <Notice tone="wait">{t.settings.pushNotConfigured}</Notice>}
          <Switch checked={f.pushOnBreakdown} onChange={(v) => set("pushOnBreakdown", v)} label={t.settings.pushOnBreakdown} help={t.settings.pushHelp} />
          <Switch checked={f.pushOnFixed} onChange={(v) => set("pushOnFixed", v)} label={t.settings.pushOnFixed} />
          <Switch checked={f.whatsappButtons} onChange={(v) => set("whatsappButtons", v)} label={t.settings.whatsappButtons} help={t.settings.whatsappButtonsHelp} />
        </>
      )}

      <div className="settings-save">
        <button className="btn primary" type="submit" disabled={!online || busy}>
          {t.app.saveChanges}
        </button>
        <span className="muted secondary">
          {t.settings.lastChanged}: <MomentText ms={saved.updatedAt} />
        </span>
      </div>
    </form>
  );
}

function ReportingFields({
  f,
  set,
  errs,
}: {
  f: Settings;
  set: <K extends keyof Settings>(k: K, v: Settings[K]) => void;
  errs: Record<string, string>;
}) {
  const team = useQuery({ queryKey: qk.team, queryFn: () => get<Person[]>("/team") });
  const people = (team.data ?? []).filter((p) => p.isActive && p.role !== "staff");
  return (
    <>
      <Switch checked={f.staffReports} onChange={(v) => set("staffReports", v)} label={t.settings.staffReports} help={t.settings.staffReportsHelp} />
      <SelectField
        label={t.settings.staffReportAssignee}
        value={f.staffReportAssigneeId ?? ""}
        onChange={(v) => set("staffReportAssigneeId", v || null)}
        options={[{ value: "", label: t.settings.staffReportAssigneeAuto }, ...people.map((p) => ({ value: p.id, label: `${p.name}, ${t.roles[p.role]}` }))]}
        error={errs.staffReportAssigneeId}
        help={t.settings.staffReportAssigneeHelp}
      />
    </>
  );
}

function NumberField({ label, value, onChange, error, help }: { label: string; value: number; onChange: (v: number) => void; error?: string | undefined; help?: ReactNode }) {
  const [text, setText] = useState(String(value));
  return (
    <TextField
      label={label}
      type="number"
      inputMode="numeric"
      value={text}
      onChange={(v) => {
        setText(v);
        onChange(Number(v) || 0);
      }}
      error={error}
      help={help}
    />
  );
}
