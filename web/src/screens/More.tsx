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
        <Row to="/manuals" title={t.nav.manuals} />
        <Row to="/models" title={t.nav.setup} lines={[t.nav.setupHelp]} />
        <Row to="/reports" title={t.nav.reports} />
        {can(role, "settings.edit") && <Row to="/settings" title={t.nav.settings} />}
        <Row
          to="/account"
          title={t.nav.account}
          lines={[me.data ? `${me.data.user.name}, ${t.roles[me.data.user.role]}` : null]}
        />
        <Row onClick={() => void signOut()} title={t.nav.signOut} />
      </Rows>
    </>
  );
}
