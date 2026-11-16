// Hospital setup: the lists each hospital fills in for itself (models, departments, service providers, team),
// as tabs under one menu item, like the Settings tabs.
import { NavLink } from "react-router";
import { can } from "@bmserv/shared/permissions";
import { t } from "@bmserv/shared/terms";
import { useMe } from "../lib/hooks";

export const setupPaths = ["/models", "/departments", "/service-providers", "/team"];

export function SetupTabs() {
  const role = useMe().data?.user.role;
  const items = [
    { to: "/models", label: t.nav.models },
    { to: "/departments", label: t.nav.departments },
    { to: "/service-providers", label: t.nav.serviceProviders },
    ...(can(role, "team.manageEngineers") ? [{ to: "/team", label: t.nav.team }] : []),
  ];
  return (
    <nav className="tabs" aria-label={t.nav.setup}>
      {items.map((i) => (
        <NavLink key={i.to} to={i.to} end>
          {i.label}
        </NavLink>
      ))}
    </nav>
  );
}
