import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, BellOff, KeyRound, LogOut, UserRound } from "lucide-react";
import { t } from "@bmserv/shared/terms";
import { errorMessage, fieldErrors, get, patch, post } from "../lib/api";
import { useMe, useOnline, useTitle } from "../lib/hooks";
import { pushState, turnOff, turnOn, type PushState } from "../lib/push";
import { qk } from "../lib/queryKeys";
import type { PushInfo } from "../lib/types";
import { iconProps, Notice, PageHead, PhoneField, Pill, TextField, useToast } from "../components/ui";
import { useSignOut } from "../app/Layout";

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export function Account() {
  useTitle(t.account.title);
  const me = useMe();
  const signOut = useSignOut();
  const u = me.data?.user;
  if (!u) return null;

  return (
    <>
      <PageHead title={t.account.title} />
      <div className="profile-card">
        <div className="avatar" aria-hidden="true">
          {initials(u.name)}
        </div>
        <div className="profile-text">
          <div className="profile-name">{u.name}</div>
          <div className="muted secondary">{t.account.signedInAs(u.username)}</div>
          <div className="profile-pills">
            <Pill tone="ok">{t.roles[u.role]}</Pill>
          </div>
        </div>
      </div>
      {u.mustChangePassword && <Notice tone="wait">{t.account.tempPasswordNotice}</Notice>}

      <div className="account-grid">
        <Card icon={<KeyRound {...iconProps} />} title={t.account.security}>
          <PasswordForm />
        </Card>
        <Card icon={<Bell {...iconProps} />} title={t.notifications.title}>
          <Notifications />
        </Card>
        <Card icon={<UserRound {...iconProps} />} title={t.account.details}>
          <DetailsForm />
        </Card>
      </div>
      <button className="btn danger account-signout" type="button" onClick={() => void signOut()}>
        <LogOut {...iconProps} />
        {t.app.signOut}
      </button>
    </>
  );
}

function Card({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="card">
      <div className="card-head card-head-plain">
        <span className="card-icon">{icon}</span>
        <h2>{title}</h2>
      </div>
      {children}
    </section>
  );
}

function PasswordForm() {
  const qc = useQueryClient();
  const toast = useToast();
  const online = useOnline();
  const [pw, setPw] = useState({ current: "", next: "", again: "" });
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pw.next !== pw.again) {
      setErrs({ again: t.account.mismatch });
      return;
    }
    try {
      await post("/me/password", { currentPassword: pw.current, newPassword: pw.next });
      setErrs({});
      setPw({ current: "", next: "", again: "" });
      await qc.invalidateQueries({ queryKey: qk.me });
      setMsg(t.account.passwordChanged);
      toast(t.account.passwordChanged);
    } catch (err) {
      setErrs({ ...fieldErrors(err), _: errorMessage(err) });
    }
  }

  return (
    <form className="form" onSubmit={submit} noValidate>
      {msg && <Notice tone="ok">{msg}</Notice>}
      {errs._ && !errs.currentPassword && !errs.newPassword && <Notice tone="bad">{errs._}</Notice>}
      <TextField label={t.account.currentPassword} type="password" revealable autoComplete="current-password" value={pw.current} onChange={(v) => setPw({ ...pw, current: v })} error={errs.currentPassword} />
      <TextField label={t.account.newPassword} type="password" revealable autoComplete="new-password" value={pw.next} onChange={(v) => setPw({ ...pw, next: v })} error={errs.newPassword} help={t.account.newPasswordHelp} />
      <TextField label={t.account.repeatPassword} type="password" revealable autoComplete="new-password" value={pw.again} onChange={(v) => setPw({ ...pw, again: v })} error={errs.again} />
      <div>
        <button className="btn primary" type="submit" disabled={!online}>
          {t.account.changePassword}
        </button>
      </div>
    </form>
  );
}

function DetailsForm() {
  const me = useMe();
  const qc = useQueryClient();
  const toast = useToast();
  const online = useOnline();
  const u = me.data?.user;
  const [d, setD] = useState({ name: u?.name ?? "", phone: u?.phone ?? "", email: u?.email ?? "" });
  const [errs, setErrs] = useState<Record<string, string>>({});

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await patch("/me", d);
      setErrs({});
      await qc.invalidateQueries({ queryKey: qk.me });
      toast(t.app.saved);
    } catch (err) {
      setErrs({ ...fieldErrors(err), _: errorMessage(err) });
    }
  }

  return (
    <form className="form" onSubmit={submit} noValidate>
      {errs._ && !Object.keys(errs).some((k) => k !== "_") && <Notice tone="bad">{errs._}</Notice>}
      <TextField label={t.team.fullName} value={d.name} onChange={(v) => setD({ ...d, name: v })} error={errs.name} autoComplete="name" />
      <PhoneField label={t.team.phone} value={d.phone} onChange={(v) => setD({ ...d, phone: v })} error={errs.phone} />
      <TextField label={t.team.email} type="email" inputMode="email" value={d.email} onChange={(v) => setD({ ...d, email: v })} error={errs.email} autoComplete="email" />
      <div>
        <button className="btn" type="submit" disabled={!online}>
          {t.app.saveChanges}
        </button>
      </div>
    </form>
  );
}

function Notifications() {
  const me = useMe();
  const toast = useToast();
  const online = useOnline();
  const info = useQuery({ queryKey: qk.push, queryFn: () => get<PushInfo>("/push") });
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void pushState().then(setState);
  }, []);

  const key = info.data?.publicKey ?? me.data?.pushPublicKey ?? null;
  const otherDevices = Math.max(0, (info.data?.devices ?? 0) - (state === "on" ? 1 : 0));

  async function run(fn: () => Promise<PushState>, done: string) {
    setBusy(true);
    setError(null);
    try {
      const next = await fn();
      setState(next);
      if (next === "on" || next === "off") toast(done);
      void info.refetch();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    try {
      await post("/push/test");
      toast(t.notifications.testSent);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (!key) return <Notice tone="off">{t.notifications.notConfigured}</Notice>;
  if (state === null) return null;
  if (state === "unsupported") return <Notice tone="off">{t.notifications.unsupported}</Notice>;
  if (state === "ios-install") return <Notice tone="wait">{t.notifications.iosInstall}</Notice>;

  return (
    <div className="form">
      <div className="notify-status">
        {state === "on" ? <Bell {...iconProps} /> : <BellOff {...iconProps} />}
        <span>{t.notifications.onThisDevice}</span>
        <Pill tone={state === "on" ? "ok" : "off"}>{state === "on" ? t.notifications.on : t.notifications.off}</Pill>
      </div>
      {state === "blocked" && <Notice tone="bad">{t.notifications.blocked}</Notice>}
      {error && <Notice tone="bad">{error}</Notice>}
      {otherDevices > 0 && <p className="muted secondary">{t.notifications.otherDevices(otherDevices)}</p>}
      <div className="actions" style={{ margin: 0 }}>
        {state === "on" ? (
          <>
            <button className="btn primary" disabled={busy || !online} onClick={() => void test()}>
              {t.notifications.test}
            </button>
            <button className="btn" disabled={busy || !online} onClick={() => void run(turnOff, t.notifications.turnedOff)}>
              {t.notifications.turnOff}
            </button>
          </>
        ) : (
          <button className="btn primary" disabled={busy || !online || state === "blocked"} onClick={() => void run(() => turnOn(key), t.notifications.turnedOn)}>
            {t.notifications.turnOn}
          </button>
        )}
      </div>
    </div>
  );
}
