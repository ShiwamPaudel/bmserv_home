import { useState } from "react";
import { Link, useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { daysBetween, formatAd, formatBs, nepalDateOf, todayNepal } from "@bmserv/shared/dates";
import type { FixedBy, PauseReason } from "@bmserv/shared/enums";
import { t } from "@bmserv/shared/terms";
import { errorMessage, fieldErrors, get, patch, post, put } from "../../lib/api";
import { useCan, useMe, useOnline, useSave, useTitle } from "../../lib/hooks";
import { qk } from "../../lib/queryKeys";
import type { BreakdownDetail, Person, Recipient, RecipientOptions } from "../../lib/types";
import { DateText, MomentText, downFor } from "../../lib/dates";
import { DateField } from "../../components/DateField";
import { EmailRows } from "../../components/EmailRows";
import { EquipmentLine } from "../../components/EquipmentLine";
import { UploadSheet } from "../../components/files";
import {
  BreakdownStatusPill,
  Confirm,
  Fact,
  LoadError,
  Loading,
  Notice,
  PageHead,
  Phone,
  RadioGroup,
  Row,
  Rows,
  Section,
  SelectField,
  SheetForm,
  TextArea,
  TextField,
  useToast,
  WhatsAppButton,
} from "../../components/ui";
import { RecipientsEditor } from "./RecipientsEditor";

type Open = null | "pause" | "fixed" | "notRepairable" | "recipients" | "assign" | { report: string };

export function BreakdownPage() {
  const { id = "" } = useParams();
  const q = useQuery({ queryKey: qk.breakdown(id), queryFn: () => get<BreakdownDetail>(`/breakdowns/${id}`) });
  const canNotRepairable = useCan("breakdown.notRepairable");
  const online = useOnline();
  const toast = useToast();
  const [open, setOpen] = useState<Open>(null);
  const [note, setNote] = useState("");
  const [noteErr, setNoteErr] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const extra = [qk.breakdown(id)];
  const addNote = useSave(() => post(`/breakdowns/${id}/notes`, { note }), extra);
  const resume = useSave(() => post(`/breakdowns/${id}/resume`), extra);
  const sendNow = useSave(() => post<{ status: string; error?: string }>(`/breakdowns/${id}/send-now`), extra);
  useTitle(q.data ? `${q.data.breakdown.numberText}` : t.breakdowns.title);

  if (q.isLoading) return <Loading />;
  if (q.error || !q.data) return <LoadError error={q.error} retry={() => void q.refetch()} />;
  const { breakdown: b, equipment: e, currentPause: p } = q.data;
  const unresolved = b.status === "open" || b.status === "with_provider";
  const pausedDays = p ? Math.max(0, daysBetween(nepalDateOf(p.pausedAt), todayNepal())) : 0;

  return (
    <>
      <PageHead
        title={
          <>
            {t.history.breakdown("")}
            <span className="serial">{b.numberText}</span>
          </>
        }
        back={{ to: "/breakdowns", label: t.breakdowns.title }}
      >
        <BreakdownStatusPill status={b.status} paused={!!p} />
      </PageHead>

      {p && (
        <Notice
          tone="wait"
          action={
            <button className="link-btn" disabled={!online || resume.isPending} onClick={() => resume.mutate(undefined, { onSuccess: () => toast(t.breakdowns.resumed) })}>
              {t.breakdowns.resume}
            </button>
          }
        >
          {t.breakdowns.pausedStrip(
            formatBs(nepalDateOf(p.pausedAt)) ?? formatAd(nepalDateOf(p.pausedAt)),
            pausedDays,
            p.reason === "other" ? (p.note ?? t.pauseReason.other) : t.pauseReason[p.reason as PauseReason],
          )}
          {p.resumeOn && (
            <>
              {" "}
              {t.breakdowns.resumesOn("")}
              <DateText ad={p.resumeOn} />
            </>
          )}
        </Notice>
      )}
      {error && <Notice tone="bad">{error}</Notice>}

      <Rows isEmpty={false} empty="">
        <EquipmentLine e={e} side={<span />} />
      </Rows>

      <div className="facts">
        <Fact label={t.breakdowns.timeDown}>{downFor(b.reportedAt, b.closedAt)}</Fact>
        <Fact label={t.breakdowns.responsible}>
          {b.assignedName} <Phone value={b.assignedPhone} />
          {unresolved && (
            <div>
              <button className="link-btn secondary" onClick={() => setOpen("assign")}>
                {t.breakdowns.giveTo}
              </button>
            </div>
          )}
        </Fact>
        <Fact label={t.breakdowns.problem}>
          <span className="pre-line">{b.problem}</span>
        </Fact>
        <Fact label={t.breakdowns.reportedBy}>
          {b.reportedByName}, <MomentText ms={b.reportedAt} />
        </Fact>
        {b.lastEmailAt && b.status === "with_provider" && (
          <Fact label={t.breakdowns.emailsSent}>
            {t.breakdowns.lastEmail("")}
            <MomentText ms={b.lastEmailAt} />
          </Fact>
        )}
        {b.closedAt && (
          <Fact label={t.breakdowns.closedAt}>
            <MomentText ms={b.closedAt} />
            {b.closedName && `, ${b.closedName}`}
          </Fact>
        )}
        {b.status === "fixed" && (
          <Fact label={t.fixedBy[b.fixedBy ?? "in_house"]}>
            {b.serviceEngineerName && <div>{b.serviceEngineerName}</div>}
            <div className="pre-line">{b.workDone}</div>
            {b.partsReplaced && (
              <div className="secondary muted">
                {t.breakdowns.partsReplaced}: {b.partsReplaced}
              </div>
            )}
          </Fact>
        )}
        {b.status === "not_repairable" && (
          <Fact label={t.status.breakdown.not_repairable}>
            <span className="pre-line">{b.workDone}</span>
          </Fact>
        )}
      </div>

      {unresolved && (
        <div className="actions">
          {b.status === "open" && (
            <Link className="btn primary" to={`/breakdowns/${id}/ask`}>
              {t.breakdowns.askProvider}
            </Link>
          )}
          <button className={`btn${b.status === "with_provider" ? " primary" : ""}`} onClick={() => setOpen("fixed")}>
            {t.breakdowns.markFixed}
          </button>
          {b.status === "with_provider" &&
            (p ? null : (
              <button className="btn" onClick={() => setOpen("pause")}>
                {t.breakdowns.pause}
              </button>
            ))}
          {b.status === "with_provider" && (
            <button
              className="btn"
              disabled={!online || sendNow.isPending}
              onClick={() =>
                sendNow.mutate(undefined, {
                  onSuccess: (r) => toast(r.status === "sent" ? t.breakdowns.sendNowDone : `${t.status.failed}: ${r.error ?? ""}`),
                  onError: (er) => setError(errorMessage(er)),
                })
              }
            >
              {t.breakdowns.sendNow}
            </button>
          )}
          {canNotRepairable && (
            <button className="btn danger" onClick={() => setOpen("notRepairable")}>
              {t.breakdowns.notRepairable}
            </button>
          )}
        </div>
      )}

      {(b.status === "with_provider" || q.data.recipients.length > 0) && (
        <Section
          title={t.breakdowns.recipients}
          action={
            unresolved && b.status === "with_provider" ? (
              <button className="btn plain" onClick={() => setOpen("recipients")}>
                {t.breakdowns.editRecipients}
              </button>
            ) : undefined
          }
        >
          <Rows isEmpty={!q.data.recipients.length} empty={t.breakdowns.emailsEmpty}>
            {q.data.recipients.map((r) => (
              <Row key={r.id} title={<span style={{ fontSize: "var(--fs-body)" }}>{r.email}</span>} lines={[r.name]} />
            ))}
          </Rows>
        </Section>
      )}

      {unresolved && <WhatsAppSection d={q.data} />}

      <Section title={t.breakdowns.notes}>
        {unresolved && (
          <form
            className="form"
            style={{ marginBottom: 12 }}
            onSubmit={(ev) => {
              ev.preventDefault();
              if (!note.trim()) return setNoteErr(t.fields.required);
              addNote.mutate(undefined, {
                onSuccess: () => {
                  setNote("");
                  setNoteErr(null);
                  toast(t.breakdowns.noteAdded);
                },
                onError: (er) => setNoteErr(fieldErrors(er).note ?? errorMessage(er)),
              });
            }}
          >
            <TextArea label={t.breakdowns.addNote} value={note} onChange={setNote} error={noteErr ?? undefined} rows={3} help={t.breakdowns.notePlaceholder} />
            <div>
              <button className="btn" type="submit" disabled={!online || addNote.isPending}>
                {t.breakdowns.addNote}
              </button>
            </div>
          </form>
        )}
        <Rows isEmpty={!q.data.notes.length} empty={t.breakdowns.notesEmpty}>
          {q.data.notes.map((n) => (
            <Row
              key={n.id}
              title={<span className="pre-line" style={{ fontSize: "var(--fs-body)", fontWeight: 400 }}>{n.note}</span>}
              lines={[
                <>
                  {n.byName}, <MomentText ms={n.createdAt} />
                </>,
              ]}
            />
          ))}
        </Rows>
      </Section>

      <Section title={t.breakdowns.emailsSent}>
        <EmailRows emails={q.data.emails} empty={t.breakdowns.emailsEmpty} />
      </Section>

      <Section title={t.breakdowns.history}>
        <BreakdownHistory d={q.data} />
      </Section>

      {open === "pause" && <PauseSheet id={id} onClose={() => setOpen(null)} />}
      {open === "fixed" && <FixedSheet d={q.data} onClose={() => setOpen(null)} onDone={(reportFor) => setOpen(reportFor ? { report: reportFor } : null)} />}
      {open === "notRepairable" && <NotRepairableSheet id={id} onClose={() => setOpen(null)} />}
      {open === "recipients" && <RecipientsSheet id={id} onClose={() => setOpen(null)} />}
      {open === "assign" && <AssignSheet id={id} current={b.assignedTo} onClose={() => setOpen(null)} />}
      {open && typeof open === "object" && (
        <UploadSheet title={t.breakdowns.report} ownerType="breakdown" ownerId={open.report} kinds={["service_report", "photo", "other"]} defaultTitle={`${t.breakdowns.report}, ${b.numberText}`} onClose={() => setOpen(null)} />
      )}
    </>
  );
}


function BreakdownHistory({ d }: { d: BreakdownDetail }) {
  type Ev = { at: number; text: string; by: string | null };
  const ev: Ev[] = [{ at: d.breakdown.reportedAt, text: t.breakdowns.event.recorded, by: d.breakdown.recordedName }];
  if (d.breakdown.sentToProviderAt) ev.push({ at: d.breakdown.sentToProviderAt, text: t.breakdowns.event.asked, by: null });
  for (const p of d.pauses) {
    ev.push({ at: p.pausedAt, text: `${t.breakdowns.event.paused}: ${p.reason === "other" ? p.note : t.pauseReason[p.reason]}`, by: p.pausedByName });
    if (p.resumedAt) ev.push({ at: p.resumedAt, text: p.resumedBy ? t.breakdowns.event.resumed : t.breakdowns.event.autoResumed, by: p.resumedByName });
  }
  for (const a of d.assignments) {
    if (a.action === "breakdown.assigned") ev.push({ at: a.createdAt, text: `${t.breakdowns.event.assigned} ${a.summary}`, by: a.byName });
    if (a.action === "breakdown.recipients") ev.push({ at: a.createdAt, text: t.breakdowns.event.recipients, by: a.byName });
  }
  for (const m of d.emails) ev.push({ at: m.createdAt, text: `${m.status === "failed" ? t.breakdowns.event.emailFailed : t.breakdowns.event.emailed}: ${m.subject}`, by: m.byName });
  if (d.breakdown.closedAt)
    ev.push({ at: d.breakdown.closedAt, text: d.breakdown.status === "fixed" ? t.breakdowns.event.fixed : t.breakdowns.event.notRepairable, by: d.breakdown.closedName });
  ev.sort((a, b) => b.at - a.at);
  return (
    <div style={{ borderTop: "1px solid var(--line)" }}>
      {ev.map((x, i) => (
        <div className="history-entry" key={i}>
          <div className="when muted">
            <MomentText ms={x.at} />
          </div>
          <div className="wrap-anywhere">
            {x.text}
            {x.by && <span className="muted secondary"> {t.history.by(x.by)}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

function PauseSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const [f, setF] = useState<{ reason: PauseReason | ""; note: string; resumeOn: string | null }>({ reason: "", note: "", resumeOn: null });
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const save = useSave(() => post(`/breakdowns/${id}/pause`, { ...f, note: f.note || null }), [qk.breakdown(id)]);
  return (
    <SheetForm
      title={t.breakdowns.pauseTitle}
      onClose={onClose}
      submitLabel={t.breakdowns.pause}
      busy={save.isPending}
      error={Object.keys(errs).length ? null : error}
      onSubmit={() => {
        if (!f.reason) return setErrs({ reason: t.fields.choose });
        save.mutate(undefined, {
          onSuccess: () => {
            toast(t.breakdowns.paused);
            onClose();
          },
          onError: (e) => {
            setErrs(fieldErrors(e));
            setError(errorMessage(e));
          },
        });
      }}
    >
      <RadioGroup
        label={t.breakdowns.pauseReason}
        value={f.reason}
        onChange={(v) => setF({ ...f, reason: v })}
        options={(["spare_parts", "quotation", "engineer_working", "other"] as const).map((r) => ({ value: r, label: t.pauseReason[r] }))}
        error={errs.reason}
      />
      <TextField
        label={f.reason === "other" ? t.breakdowns.pauseOther : t.breakdowns.pauseNote}
        value={f.note}
        onChange={(v) => setF({ ...f, note: v })}
        error={errs.note}
        optional={f.reason !== "other"}
      />
      <DateField label={t.breakdowns.resumeOn} value={f.resumeOn} onChange={(v) => setF({ ...f, resumeOn: v })} error={errs.resumeOn} help={t.breakdowns.resumeOnHelp} optional />
    </SheetForm>
  );
}

function FixedSheet({ d, onClose, onDone }: { d: BreakdownDetail; onClose: () => void; onDone: (reportFor: string | null) => void }) {
  const [f, setF] = useState<{ fixedBy: FixedBy; serviceEngineerName: string; workDone: string; partsReplaced: string }>({
    fixedBy: d.breakdown.status === "with_provider" ? "service_provider" : "in_house",
    serviceEngineerName: "",
    workDone: "",
    partsReplaced: "",
  });
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const toast = useToast();
  const id = d.breakdown.id;
  const save = useSave(
    () => post(`/breakdowns/${id}/close`, { outcome: "fixed", ...f, serviceEngineerName: f.serviceEngineerName || null, partsReplaced: f.partsReplaced || null }),
    [qk.breakdown(id)],
  );
  if (confirm) {
    return (
      <Confirm
        message={t.breakdowns.fixedConfirm(d.breakdown.status === "with_provider")}
        confirmLabel={t.breakdowns.markFixed}
        busy={save.isPending}
        onCancel={() => setConfirm(false)}
        onConfirm={() =>
          save.mutate(undefined, {
            onSuccess: () => {
              toast(t.breakdowns.fixed);
              onDone(f.fixedBy === "service_provider" ? id : null);
            },
            onError: (e) => {
              setConfirm(false);
              setErrs(fieldErrors(e));
              setError(errorMessage(e));
            },
          })
        }
      />
    );
  }
  return (
    <SheetForm
      title={t.breakdowns.fixedTitle}
      onClose={onClose}
      submitLabel={t.breakdowns.markFixed}
      error={Object.keys(errs).length ? null : error}
      onSubmit={() => (f.workDone.trim() ? setConfirm(true) : setErrs({ workDone: t.fields.required }))}
    >
      <RadioGroup
        label={t.breakdowns.fixedBy}
        value={f.fixedBy}
        onChange={(v) => setF({ ...f, fixedBy: v })}
        options={(["in_house", "service_provider"] as const).map((v) => ({ value: v, label: t.fixedBy[v] }))}
      />
      {f.fixedBy === "service_provider" && (
        <TextField label={t.breakdowns.serviceEngineer} value={f.serviceEngineerName} onChange={(v) => setF({ ...f, serviceEngineerName: v })} />
      )}
      <TextArea label={t.breakdowns.workDone} value={f.workDone} onChange={(v) => setF({ ...f, workDone: v })} error={errs.workDone} />
      <TextArea label={t.breakdowns.partsReplaced} value={f.partsReplaced} onChange={(v) => setF({ ...f, partsReplaced: v })} optional rows={2} />
      {f.fixedBy === "service_provider" && <p className="help">{t.breakdowns.report}: {t.files.limitOther}. {t.app.optional}.</p>}
    </SheetForm>
  );
}

function NotRepairableSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const toast = useToast();
  const save = useSave(() => post(`/breakdowns/${id}/close`, { outcome: "not_repairable", reason }), [qk.breakdown(id)]);
  if (confirm) {
    return (
      <Confirm
        message={t.breakdowns.notRepairableConfirm}
        confirmLabel={t.breakdowns.notRepairable}
        danger
        busy={save.isPending}
        onCancel={() => setConfirm(false)}
        onConfirm={() =>
          save.mutate(undefined, {
            onSuccess: () => {
              toast(t.breakdowns.closedNotRepairable);
              onClose();
            },
            onError: (e) => {
              setConfirm(false);
              setErr(errorMessage(e));
            },
          })
        }
      />
    );
  }
  return (
    <SheetForm
      title={t.breakdowns.notRepairableTitle}
      onClose={onClose}
      submitLabel={t.breakdowns.notRepairable}
      danger
      onSubmit={() => (reason.trim() ? setConfirm(true) : setErr(t.fields.required))}
    >
      <p className="help">{t.breakdowns.notRepairableHelp}</p>
      <TextArea label={t.breakdowns.reason} value={reason} onChange={setReason} error={err ?? undefined} />
    </SheetForm>
  );
}

function RecipientsSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const q = useQuery({ queryKey: qk.recipientOptions(id), queryFn: () => get<RecipientOptions>(`/breakdowns/${id}/recipients/default`) });
  const [value, setValue] = useState<Recipient[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const save = useSave(() => put(`/breakdowns/${id}/recipients`, { recipients: value ?? [] }), [qk.breakdown(id), qk.recipientOptions(id)]);
  const current = value ?? q.data?.saved ?? null;
  return (
    <SheetForm
      title={t.breakdowns.editRecipients}
      onClose={onClose}
      submitLabel={t.app.save}
      busy={save.isPending}
      error={error}
      onSubmit={() =>
        save.mutate(undefined, {
          onSuccess: () => {
            toast(t.breakdowns.recipientsSaved);
            onClose();
          },
          onError: (e) => setError(errorMessage(e)),
        })
      }
    >
      {q.data && current ? <RecipientsEditor options={q.data} value={current} onChange={setValue} /> : <Loading />}
    </SheetForm>
  );
}

function AssignSheet({ id, current, onClose }: { id: string; current: string; onClose: () => void }) {
  const team = useQuery({ queryKey: qk.team, queryFn: () => get<Person[]>("/team") });
  const [userId, setUserId] = useState(current);
  const toast = useToast();
  const save = useSave(() => patch(`/breakdowns/${id}/assign`, { userId }), [qk.breakdown(id)]);
  const people = (team.data ?? []).filter((p) => p.isActive);
  return (
    <SheetForm
      title={t.breakdowns.giveTo}
      onClose={onClose}
      submitLabel={t.app.save}
      busy={save.isPending}
      onSubmit={() =>
        save.mutate(undefined, {
          onSuccess: () => {
            toast(t.breakdowns.givenTo(people.find((p) => p.id === userId)?.name ?? ""));
            onClose();
          },
        })
      }
    >
      <SelectField label={t.breakdowns.responsible} value={userId} onChange={setUserId} options={people.map((p) => ({ value: p.id, label: `${p.name}, ${t.roles[p.role]}` }))} />
    </SheetForm>
  );
}

/** WhatsApp the service provider or someone on the team with a short message about this breakdown. */
function WhatsAppSection({ d }: { d: BreakdownDetail }) {
  const me = useMe();
  if (!me.data?.hospital.whatsappButtons) return null;
  const { breakdown: b, equipment: e, phoneContacts: c } = d;
  const equipment = `${e.typeName} ${e.manufacturer} ${e.model}`;
  const contact = [b.assignedName, b.assignedPhone].filter(Boolean).join(", ");
  const toProvider = t.whatsapp.breakdownToProvider({
    hospital: me.data.hospital.name,
    bd: b.numberText,
    equipment,
    serial: e.serialNumber,
    department: e.currentDepartmentName,
    problem: b.problem,
    contact,
  });
  const toTeam = t.whatsapp.toTeamMember({
    bd: b.numberText,
    equipment: `${equipment}, S.N. ${e.serialNumber}`,
    department: e.currentDepartmentName,
    problem: b.problem,
    link: `${me.data.appUrl}/breakdowns/${b.id}`,
  });
  const provider = [
    ...c.serviceDesk.map((x) => ({ key: `d-${x.phone}`, name: x.name || t.providers.serviceDepartment, line: x.phone, phone: x.phone })),
    ...c.serviceEngineers.map((x) => ({
      key: `e-${x.phone}`,
      name: x.name,
      line: x.designated ? `${t.providers.firstEngineer}, ${x.phone}` : x.phone,
      phone: x.phone,
    })),
  ];
  const team = c.team.filter((x) => x.id !== me.data?.user.id);
  if (!provider.length && !team.length) return null;
  return (
    <Section title={t.whatsapp.sendTitle}>
      <p className="help" style={{ marginBottom: 8 }}>
        {t.whatsapp.help}
      </p>
      {provider.length > 0 && (
        <>
          <h3 className="sub-head">{c.providerName || t.whatsapp.serviceSide}</h3>
          <Rows isEmpty={false} empty="">
            {provider.map((x) => (
              <Row key={x.key} title={x.name} lines={[x.line]} side={<WhatsAppButton phone={x.phone} text={toProvider} />} />
            ))}
          </Rows>
        </>
      )}
      {team.length > 0 && (
        <>
          <h3 className="sub-head">{t.whatsapp.team}</h3>
          <Rows isEmpty={false} empty="">
            {team.map((x) => (
              <Row
                key={x.id}
                title={x.name}
                lines={[`${t.roles[x.role]}, ${x.phone}`]}
                side={<WhatsAppButton phone={x.phone} text={toTeam} plain />}
              />
            ))}
          </Rows>
        </>
      )}
    </Section>
  );
}
