import { can } from "@bmserv/shared/permissions";
import { t } from "@bmserv/shared/terms";
import { useMe, useTitle } from "../lib/hooks";
import { PageHead, Row, Rows } from "../components/ui";
import { useSignOut } from "../app/Layout";

export function More() {
  useTitle(t.nav.more);
  const me = useMe();
  const role = me.data?.user.role;
  const signOut = useSignOut();
  return (
    <>
      <PageHead title={t.nav.more} />
      <Rows isEmpty={false} empty="">
        <Row to="/models" title={t.nav.models} />
        <Row to="/manuals" title={t.nav.manuals} />
        <Row to="/departments" title={t.nav.departments} />
        <Row to="/service-providers" title={t.nav.serviceProviders} />
        {can(role, "team.manageEngineers") && <Row to="/team" title={t.nav.team} />}
        {can(role, "settings.edit") && <Row to="/settings" title={t.nav.settings} />}
        <Row to="/account" title={t.nav.account} lines={[me.data ? `${me.data.user.name}, ${t.roles[me.data.user.role]}` : null]} />
        <Row onClick={() => void signOut()} title={t.nav.signOut} />
      </Rows>
    </>
  );
}
