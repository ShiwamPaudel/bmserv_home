import { useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { t } from "@bmserv/shared/terms";
import { authClient } from "../lib/auth";
import { installAfterSignIn } from "../lib/install";
import { useMe, useTitle } from "../lib/hooks";
import { qk } from "../lib/queryKeys";
import { Notice, TextField } from "../components/ui";

export function SignIn() {
  useTitle(t.signIn.title);
  const [params] = useSearchParams();
  const next = params.get("next") ?? "/";
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";
  const me = useMe();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (me.data) return <Navigate to={safeNext} replace />;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError(t.signIn.wrong);
      return;
    }
    setBusy(true);
    setError(null);
    const res = await authClient.signIn.username({ username: username.trim().toLowerCase(), password });
    setBusy(false);
    if (res.error) {
      // Only say "deactivated" when the server says so; a 403 can also be an untrusted web address.
      const { status, message } = res.error;
      setError(
        message === t.signIn.deactivated
          ? t.signIn.deactivated
          : status === 429
            ? t.signIn.tooMany
            : status === 403
              ? t.signIn.badOrigin
              : status === 401 || status === 400
                ? t.signIn.wrong
                : t.app.somethingWrong,
      );
      return;
    }
    installAfterSignIn();
    await qc.invalidateQueries({ queryKey: qk.me });
    navigate(safeNext, { replace: true });
  }

  return (
    <div className="signin-page">
      <div className="signin-hero" role="img" aria-label={t.signIn.heroAlt} />
      <div className="signin">
        <form className="signin-box form" onSubmit={submit} noValidate>
          <img className="logo" src="/brand/logo-colour.png" alt="BMServ by Infobytes Nepal" />
          <div>
            <h1>{t.signIn.title}</h1>
            <p className="muted">{safeNext.startsWith("/e/") ? t.signIn.afterScan : t.signIn.welcome}</p>
          </div>
          {error && <Notice tone="bad">{error}</Notice>}
          <TextField
            label={t.signIn.username}
            value={username}
            onChange={setUsername}
            autoComplete="username"
          />
          <TextField
            label={t.signIn.password}
            value={password}
            onChange={setPassword}
            type="password"
            revealable
            autoComplete="current-password"
          />
          <button className="btn primary block" type="submit" disabled={busy}>
            {t.signIn.submit}
          </button>
        </form>
      </div>
    </div>
  );
}
