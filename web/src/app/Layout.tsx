import { useEffect, useState, type ReactNode } from "react";
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate, useRouteError } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  BookOpen,
  Boxes,
  Building2,
  CalendarCheck,
  ClipboardList,
  Home as HomeIcon,
  LogOut,
  Menu,
  Package,
  ScanLine,
  Settings,
  User,
  Users,
  Wrench,
  Handshake,
} from "lucide-react";
import { registerSW } from "virtual:pwa-register";
import { can } from "@bmserv/shared/permissions";
import { t } from "@bmserv/shared/terms";
import { ApiError } from "../lib/api";
import { authClient } from "../lib/auth";
import { useMe, useOnline } from "../lib/hooks";
import { clearCache } from "../lib/offlineCache";
import { setDateMode } from "../lib/dates";
import { iconProps, Loading } from "../components/ui";

export function RequireAuth({ children }: { children: ReactNode }) {
  const me = useMe();
  const loc = useLocation();
  if (me.isLoading) return <Loading />;
  if (me.error instanceof ApiError && me.error.status === 401) {
    return <Navigate to={`/sign-in?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  }
  if (!me.data) {
    // Offline with nothing cached yet, or a server problem.
    return (
      <div className="main">
        <p>{me.error instanceof Error ? me.error.message : t.app.somethingWrong}</p>
        <button className="btn" onClick={() => void me.refetch()}>
          {t.app.retry}
        </button>
      </div>
    );
  }
  setDateMode(me.data.hospital.dateDisplay);
  return <>{children}</>;
}

/** Pages for the Biomedical team only: hospital staff go back to Report a problem. */
export function TeamOnly() {
  const me = useMe();
  if (me.data?.user.role === "staff") return <Navigate to="/" replace />;
  return <Outlet />;
}

export function TeamOr({ team, staff }: { team: ReactNode; staff: ReactNode }) {
  const me = useMe();
  return <>{me.data?.user.role === "staff" ? staff : team}</>;
}

export function useSignOut() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  return async () => {
    await authClient.signOut().catch(() => undefined);
    qc.clear();
    clearCache();
    navigate("/sign-in", { replace: true });
  };
}

type BeforeInstall = Event & { prompt: () => Promise<void> };

function usePwa() {
  const [needRefresh, setNeedRefresh] = useState(false);
  const [update, setUpdate] = useState<(() => Promise<void>) | null>(null);
  const [install, setInstall] = useState<BeforeInstall | null>(null);
  useEffect(() => {
    const updateSW = registerSW({ onNeedRefresh: () => setNeedRefresh(true) });
    setUpdate(() => () => updateSW(true));
    const onPrompt = (e: Event) => {
      e.preventDefault();
      try {
        if (localStorage.getItem("bmserv-install-dismissed")) return;
      } catch {
        /* ignore */
      }
      setInstall(e as BeforeInstall);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);
  return {
    needRefresh,
    reload: () => void update?.(),
    install,
    doInstall: async () => {
      await install?.prompt();
      setInstall(null);
    },
    dismissInstall: () => {
      try {
        localStorage.setItem("bmserv-install-dismissed", "1");
      } catch {
        /* ignore */
      }
      setInstall(null);
    },
  };
}

export function Layout() {
  const me = useMe();
  const online = useOnline();
  const signOut = useSignOut();
  const pwa = usePwa();
  const role = me.data?.user.role;
  const loc = useLocation();
  useEffect(() => {
    // Braces matter: newer browsers return a promise from scrollTo, which React would treat as a cleanup.
    window.scrollTo(0, 0);
  }, [loc.pathname]);

  if (role === "staff") return <StaffLayout />;

  const main = [
    { to: "/", label: t.nav.home, icon: HomeIcon, end: true },
    { to: "/equipment", label: t.nav.equipment, icon: Package },
    { to: "/breakdowns", label: t.nav.breakdowns, icon: Wrench },
    { to: "/pms", label: t.nav.pms, icon: CalendarCheck },
  ];
  const secondary = [
    { to: "/models", label: t.nav.models, icon: Boxes, show: true },
    { to: "/manuals", label: t.nav.manuals, icon: BookOpen, show: true },
    { to: "/departments", label: t.nav.departments, icon: Building2, show: true },
    { to: "/service-providers", label: t.nav.serviceProviders, icon: Handshake, show: true },
    { to: "/team", label: t.nav.team, icon: Users, show: can(role, "team.manageEngineers") },
    { to: "/settings", label: t.nav.settings, icon: Settings, show: can(role, "settings.edit") },
  ];
  const moreActive = [
    "/models",
    "/manuals",
    "/departments",
    "/service-providers",
    "/team",
    "/settings",
    "/account",
    "/more",
  ].some((p) => loc.pathname.startsWith(p));

  return (
    <>
      <a href="#main" className="visually-hidden">
        Skip to content
      </a>
      <header className="topbar on-navy no-print">
        <Link to="/" aria-label={t.nav.home}>
          <img className="logo" src="/brand/logo-white.png" alt="BMServ" />
        </Link>
        <span className="spacer" />
        <Link className="icon-btn" to="/scan" aria-label={t.app.scan}>
          <ScanLine {...iconProps} />
          <span className="small">{t.app.scan}</span>
        </Link>
        <Link className="icon-btn" to="/account" aria-label={t.app.me}>
          <User {...iconProps} />
        </Link>
      </header>

      <aside className="sidebar on-navy no-print">
        <Link to="/" aria-label={t.nav.home}>
          <img className="logo" src="/brand/logo-white.png" alt="BMServ" />
        </Link>
        <nav aria-label="Main">
          {main.map((i) => (
            <NavLink key={i.to} to={i.to} end={i.end}>
              <i.icon {...iconProps} />
              {i.label}
            </NavLink>
          ))}
          <NavLink to="/models">
            <Boxes {...iconProps} />
            {t.nav.models}
          </NavLink>
          <NavLink to="/manuals">
            <BookOpen {...iconProps} />
            {t.nav.manuals}
          </NavLink>
          <NavLink to="/scan">
            <ScanLine {...iconProps} />
            {t.app.scan}
          </NavLink>
          <div className="group-gap" />
          {secondary
            .filter((i) => i.show && i.to !== "/manuals" && i.to !== "/models")
            .map((i) => (
              <NavLink key={i.to} to={i.to}>
                <i.icon {...iconProps} />
                {i.label}
              </NavLink>
            ))}
        </nav>
        <span className="spacer" />
        <nav aria-label="Account">
          <NavLink to="/account">
            <User {...iconProps} />
            {t.nav.account}
          </NavLink>
          <button type="button" onClick={() => void signOut()}>
            <LogOut {...iconProps} />
            {t.nav.signOut}
          </button>
        </nav>
      </aside>

      <div className="no-print" style={{ position: "sticky", top: 0, zIndex: 15 }}>
        {!online && (
          <div className="notice off" role="status" style={{ paddingLeft: "var(--s4)" }}>
            {t.app.offline}
          </div>
        )}
        {me.data?.user.mustChangePassword && !loc.pathname.startsWith("/account") && (
          <div className="notice wait">
            <span>{t.account.tempPasswordNotice}</span>
            <Link className="notice-action" to="/account">
              {t.account.changePassword}
            </Link>
          </div>
        )}
        {pwa.needRefresh && (
          <div className="notice ok">
            <span>{t.pwa.updated}</span>
            <button className="link-btn notice-action" onClick={pwa.reload}>
              {t.pwa.reload}
            </button>
          </div>
        )}
        {pwa.install && (
          <div className="notice ok">
            <span>{t.pwa.install}</span>
            <span className="notice-action" style={{ display: "flex", gap: 12 }}>
              <button className="link-btn" onClick={() => void pwa.doInstall()}>
                {t.pwa.installButton}
              </button>
              <button className="link-btn" onClick={pwa.dismissInstall}>
                {t.pwa.later}
              </button>
            </span>
          </div>
        )}
      </div>

      <main id="main" className="main">
        <div className="page">
          <Outlet />
        </div>
      </main>

      <nav className="bottombar no-print" aria-label="Main">
        {main.map((i) => (
          <NavLink key={i.to} to={i.to} end={i.end}>
            <i.icon {...iconProps} />
            {i.label}
          </NavLink>
        ))}
        <NavLink to="/more" className={moreActive ? "active" : undefined}>
          <Menu {...iconProps} />
          {t.nav.more}
        </NavLink>
      </nav>
    </>
  );
}

/** Hospital staff: report a problem, the equipment in their departments, and their reports. Nothing else. */
function StaffLayout() {
  const online = useOnline();
  const signOut = useSignOut();
  const pwa = usePwa();
  const me = useMe();
  const items = [
    { to: "/", label: t.nav.report, icon: ScanLine, end: true },
    { to: "/my-equipment", label: t.nav.staffEquipment, icon: Package },
    { to: "/my-reports", label: t.nav.myReports, icon: ClipboardList },
    { to: "/account", label: t.nav.account, icon: User },
  ];
  return (
    <>
      <header className="topbar on-navy no-print">
        <Link to="/" aria-label={t.nav.report}>
          <img className="logo" src="/brand/logo-white.png" alt="BMServ" />
        </Link>
        <span className="spacer" />
        <Link className="icon-btn" to="/account" aria-label={t.app.me}>
          <User {...iconProps} />
        </Link>
      </header>
      <aside className="sidebar on-navy no-print">
        <Link to="/" aria-label={t.nav.report}>
          <img className="logo" src="/brand/logo-white.png" alt="BMServ" />
        </Link>
        <nav aria-label="Main">
          {items.map((i) => (
            <NavLink key={i.to} to={i.to} end={i.end}>
              <i.icon {...iconProps} />
              {i.label}
            </NavLink>
          ))}
        </nav>
        <span className="spacer" />
        <nav aria-label="Account">
          <button type="button" onClick={() => void signOut()}>
            <LogOut {...iconProps} />
            {t.nav.signOut}
          </button>
        </nav>
      </aside>
      <div className="no-print" style={{ position: "sticky", top: 0, zIndex: 15 }}>
        {!online && (
          <div className="notice off" role="status" style={{ paddingLeft: "var(--s4)" }}>
            {t.app.offline}
          </div>
        )}
        {me.data?.user.mustChangePassword && (
          <div className="notice wait">
            <span>{t.account.tempPasswordNotice}</span>
            <Link className="notice-action" to="/account">
              {t.account.changePassword}
            </Link>
          </div>
        )}
        {pwa.needRefresh && (
          <div className="notice ok">
            <span>{t.pwa.updated}</span>
            <button className="link-btn notice-action" onClick={pwa.reload}>
              {t.pwa.reload}
            </button>
          </div>
        )}
      </div>
      <main id="main" className="main main-narrow">
        <div className="page">
          <Outlet />
        </div>
      </main>
      <nav className="bottombar no-print" aria-label="Main">
        {items.map((i) => (
          <NavLink key={i.to} to={i.to} end={i.end}>
            <i.icon {...iconProps} />
            {i.label}
          </NavLink>
        ))}
      </nav>
    </>
  );
}

/** Shown instead of a crash: a plain message and a way back. Details go to the console for us. */
export function RouteError() {
  const err = useRouteError();
  useEffect(() => {
    console.error(err);
  }, [err]);
  return (
    <main className="main" style={{ maxWidth: "var(--w-form)", margin: "0 auto" }}>
      <h1>{t.app.somethingWrong}</h1>
      <div className="actions" style={{ marginTop: 16 }}>
        <button className="btn primary" onClick={() => window.location.reload()}>
          {t.pwa.reload}
        </button>
        <a className="btn" href="/">
          {t.app.goHome}
        </a>
      </div>
    </main>
  );
}

export function NotFound() {
  return (
    <>
      <h1>{t.app.notFound}</h1>
      <p style={{ marginTop: 16 }}>
        <Link to="/">{t.app.goHome}</Link>
      </p>
    </>
  );
}
