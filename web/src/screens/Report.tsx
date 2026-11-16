// Reporting a problem from a BMServ label: what hospital staff use (and the team, when they want).
import { useState } from "react";
import { Link } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Phone as PhoneIcon, ScanLine } from "lucide-react";
import { telHref } from "@bmserv/shared/phone";
import { t } from "@bmserv/shared/terms";
import { errorMessage, fieldErrors, get, post } from "../lib/api";
import { useMe, useOnline, useTitle } from "../lib/hooks";
import { qk } from "../lib/queryKeys";
import type { MyEquipment, MyReport, ReportInfo, ReportResult } from "../lib/types";
import { MomentText } from "../lib/dates";
import { ModelThumb } from "../components/ModelPhoto";
import {
  BreakdownStatusPill,
  EquipmentStatusPill,
  iconProps,
  LoadError,
  Loading,
  Notice,
  PageHead,
  Row,
  Rows,
  Section,
  TextArea,
  useCountryCode,
  WhatsAppButton,
} from "../components/ui";

function CallDepartment() {
  const me = useMe();
  const code = useCountryCode();
  const phone = me.data?.hospital.departmentPhone;
  if (!phone) return null;
  return (
    <a className="btn" href={telHref(phone, code)}>
      <PhoneIcon {...iconProps} size={18} />
      {t.report.callTeam}
    </a>
  );
}

/** Staff home: scan a label; recent reports below. */
export function ReportStart() {
  useTitle(t.report.title);
  const me = useMe();
  const mine = useQuery({ queryKey: qk.myReports, queryFn: () => get<MyReport[]>("/my-reports") });
  const off = me.data && !me.data.hospital.staffReports;
  return (
    <>
      <PageHead title={t.report.title} />
      {off ? (
        <Notice tone="off">{t.report.off}</Notice>
      ) : (
        <div className="report-start">
          <p className="lead-text">{t.report.intro}</p>
          <Link className="btn primary big" to="/scan">
            <ScanLine {...iconProps} size={22} />
            {t.report.scan}
          </Link>
        </div>
      )}
      <div className="actions">
        <CallDepartment />
      </div>
      <Section title={t.report.myReports} action={<Link to="/my-reports">{t.app.more}</Link>}>
        {mine.isLoading ? <Loading /> : <ReportRows rows={(mine.data ?? []).slice(0, 3)} />}
      </Section>
    </>
  );
}

/** Hospital staff: equipment in their departments now; tapping one opens Report a problem for it. */
export function StaffEquipment() {
  useTitle(t.staffEquipment.title);
  const q = useQuery({ queryKey: qk.myEquipment, queryFn: () => get<MyEquipment>("/my-equipment") });
  const [search, setSearch] = useState("");
  const [dept, setDept] = useState("");

  if (q.isLoading) return <Loading />;
  if (q.error || !q.data) return <LoadError error={q.error} retry={() => void q.refetch()} />;
  const { departments, equipment } = q.data;
  const words = search.trim().toLowerCase().split(/s+/).filter(Boolean);
  const rows = equipment.filter(
    (e) =>
      (!dept || e.departmentId === dept) &&
      words.every((w) =>
        [e.typeName, e.manufacturer, e.model, e.serialNumber, e.hospitalTag ?? ""].some((v) => v.toLowerCase().includes(w)),
      ),
  );

  return (
    <>
      <PageHead title={t.staffEquipment.title} />
      {!departments.length ? (
        <>
          <Notice tone="off">{t.staffEquipment.noDepartments}</Notice>
          <div className="actions">
            <Link className="btn primary" to="/scan">
              <ScanLine {...iconProps} size={18} />
              {t.report.scan}
            </Link>
          </div>
        </>
      ) : (
        <>
          <p className="muted" style={{ marginBottom: 12 }}>
            {t.staffEquipment.intro}
          </p>
          <div className="search-bar">
            <label className="visually-hidden" htmlFor="staff-eq-search">
              {t.staffEquipment.search}
            </label>
            <input
              id="staff-eq-search"
              className="input"
              type="search"
              placeholder={t.staffEquipment.search}
              value={search}
              onChange={(ev) => setSearch(ev.target.value)}
            />
            {departments.length > 1 && (
              <div className="filters">
                <select aria-label={t.team.departments} value={dept} onChange={(ev) => setDept(ev.target.value)}>
                  <option value="">{t.staffEquipment.all}</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <Rows isEmpty={!rows.length} empty={equipment.length ? t.staffEquipment.noMatch : t.staffEquipment.empty}>
            {rows.map((e) => (
              <Row
                key={e.id}
                to={`/e/${encodeURIComponent(e.qrCode)}`}
                thumb={<ModelThumb fileId={e.photoFileId} name={`${e.manufacturer} ${e.model}`} />}
                title={e.typeName}
                lines={[
                  `${e.manufacturer} ${e.model}`,
                  <>
                    {t.equipment.serialShort} <span className="serial">{e.serialNumber}</span>
                    {e.hospitalTag && <span className="sep">{e.hospitalTag}</span>}
                    <span className="sep">{e.departmentName}</span>
                  </>,
                  e.openBreakdown && t.staffEquipment.openBreakdown(e.openBreakdown),
                ]}
                side={<EquipmentStatusPill status={e.status} />}
              />
            ))}
          </Rows>
        </>
      )}
    </>
  );
}

function ReportRows({ rows }: { rows: MyReport[] }) {
  return (
    <Rows isEmpty={!rows.length} empty={t.report.myReportsEmpty}>
      {rows.map((r) => (
        <Row
          key={r.id}
          thumb={
            <ModelThumb
              fileId={r.equipment?.photoFileId}
              name={r.equipment ? `${r.equipment.manufacturer} ${r.equipment.model}` : r.numberText}
            />
          }
          title={
            r.equipment
              ? `${r.equipment.typeName}, ${r.equipment.manufacturer} ${r.equipment.model}`
              : r.numberText
          }
          lines={[
            <>
              <span className="serial">{r.numberText}</span>
              {r.equipment && <span className="sep">{r.equipment.currentDepartmentName}</span>}
              <span className="sep">{r.assignedName}</span>
            </>,
            r.problem,
            <>
              {t.report.reportedOn} <MomentText ms={r.reportedAt} />
              {r.closedAt && (
                <span className="sep">
                  {t.report.fixedOn} <MomentText ms={r.closedAt} />
                </span>
              )}
            </>,
          ]}
          side={<BreakdownStatusPill status={r.status} />}
        />
      ))}
    </Rows>
  );
}

export function MyReports() {
  useTitle(t.report.myReports);
  const q = useQuery({
    queryKey: qk.myReports,
    queryFn: () => get<MyReport[]>("/my-reports"),
    refetchInterval: 60_000,
  });
  return (
    <>
      <PageHead title={t.report.myReports} />
      {q.isLoading ? (
        <Loading />
      ) : q.error ? (
        <LoadError error={q.error} retry={() => void q.refetch()} />
      ) : (
        <ReportRows rows={q.data ?? []} />
      )}
    </>
  );
}

/** /e/:qrCode for hospital staff: what this label is, and the problem form. */
export function ReportForm({ qrCode }: { qrCode: string }) {
  useTitle(t.report.title);
  const info = useQuery({
    queryKey: qk.report(qrCode),
    queryFn: () => get<ReportInfo>(`/report/${encodeURIComponent(qrCode)}`),
    retry: false,
  });
  const [problem, setProblem] = useState("");
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<ReportResult | null>(null);
  const online = useOnline();
  const qc = useQueryClient();

  if (info.isLoading) return <Loading />;
  if (info.error || !info.data) return <LoadError error={info.error} />;
  const { equipment: e, open } = info.data;
  const name = `${e.typeName}, ${e.manufacturer} ${e.model}`;

  if (done) {
    return (
      <>
        <PageHead title={t.report.sent} />
        <Notice tone="ok">
          {done.again ? t.report.addedToExisting(done.numberText) : t.report.sentHelp}
        </Notice>
        <div className="facts" style={{ marginTop: 16 }}>
          <div>
            <div className="fact-label">{t.report.number}</div>
            <div className="fact-value serial">{done.numberText}</div>
          </div>
          <div>
            <div className="fact-label">{t.equipment.title}</div>
            <div className="fact-value">{name}</div>
          </div>
        </div>
        {done.whatsapp.contacts.length > 0 && (
          <Section title={t.whatsapp.sendTitle}>
            <p className="muted" style={{ marginBottom: 8 }}>
              {t.report.alsoWhatsApp}
            </p>
            <Rows isEmpty={false} empty="">
              {done.whatsapp.contacts.map((c) => (
                <Row
                  key={`${c.name}-${c.phone}`}
                  title={c.name}
                  lines={[`${t.roles[c.role]}, ${c.phone}`]}
                  side={<WhatsAppButton phone={c.phone} text={done.whatsapp.text} />}
                />
              ))}
            </Rows>
            <p className="help" style={{ marginTop: 8 }}>
              {t.whatsapp.help}
            </p>
          </Section>
        )}
        <div className="actions">
          <Link className="btn primary" to="/scan">
            {t.report.another}
          </Link>
          <Link className="btn" to="/my-reports">
            {t.report.myReports}
          </Link>
        </div>
      </>
    );
  }

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!problem.trim()) {
      setErrs({ problem: t.fields.required });
      return;
    }
    setBusy(true);
    try {
      const r = await post<ReportResult>("/report", { qrCode, problem });
      setDone(r);
      await qc.invalidateQueries({ queryKey: qk.myReports });
      await qc.invalidateQueries({ queryKey: qk.myEquipment });
    } catch (err) {
      setErrs(fieldErrors(err));
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHead title={t.report.title} />
      <div className="report-equipment">
        <ModelThumb fileId={e.photoFileId} name={name} size={72} />
        <div>
          <div className="row-title">{name}</div>
          <div className="row-line">
            <span className="serial">S.N. {e.serialNumber}</span>
            {e.hospitalTag && <span className="sep">{e.hospitalTag}</span>}
            <span className="sep">{e.currentDepartmentName}</span>
          </div>
        </div>
      </div>
      {e.status === "out_of_service" ? (
        <Notice tone="off">{t.report.outOfService}</Notice>
      ) : (
        <form className="form" onSubmit={submit} noValidate>
          {open && (
            <Notice tone="wait">
              {t.report.alreadyOpen(open.numberText, t.status.breakdown[open.status])}
            </Notice>
          )}
          {error && !Object.keys(errs).length && <Notice tone="bad">{error}</Notice>}
          <TextArea
            label={t.report.problem}
            value={problem}
            onChange={setProblem}
            error={errs.problem}
            help={t.report.problemHelp}
            rows={4}
          />
          <div>
            <button className="btn primary" type="submit" disabled={!online || busy}>
              {t.report.submit}
            </button>
          </div>
        </form>
      )}
      <div className="actions">
        <CallDepartment />
      </div>
    </>
  );
}
