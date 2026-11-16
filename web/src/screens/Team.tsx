import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Role } from "@bmserv/shared/enums";
import { assignableRoles, canManagePerson } from "@bmserv/shared/permissions";
import { t } from "@bmserv/shared/terms";
import { errorMessage, fieldErrors, get, patch, post } from "../lib/api";
import { useCan, useMe, useTitle } from "../lib/hooks";
import { qk } from "../lib/queryKeys";
import type { DepartmentListItem, Person } from "../lib/types";
import {
  Checkbox,
  Confirm,
  LoadError,
  Loading,
  Notice,
  PageHead,
  PhoneField,
  Pill,
  RadioGroup,
  Row,
  Rows,
  SheetForm,
  TextField,
  useToast,
} from "../components/ui";

type Edit = { mode: "add" } | { mode: "edit"; person: Person } | { mode: "reset"; person: Person };

export function Team() {
  useTitle(t.team.title);
  const allowed = useCan("team.manageEngineers");
  const me = useMe();
  const q = useQuery({ queryKey: qk.team, queryFn: () => get<Person[]>("/team"), enabled: allowed });
  const depts = useQuery({ queryKey: qk.departments, queryFn: () => get<DepartmentListItem[]>("/departments"), enabled: allowed });
  const deptName = new Map((depts.data ?? []).map((d) => [d.id, d.name]));
  const [edit, setEdit] = useState<Edit | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [deactivating, setDeactivating] = useState<Person | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const qc = useQueryClient();
  const toast = useToast();

  if (!allowed) return <Notice tone="off">{t.app.noAccess}</Notice>;
  const actor = me.data?.user;
  if (!actor) return null;
  const list = (q.data ?? []).filter((p) => showInactive || p.isActive);

  return (
    <>
      <PageHead title={t.team.title}>
        <button className="btn primary" onClick={() => setEdit({ mode: "add" })}>
          {t.team.add}
        </button>
      </PageHead>
      <Checkbox checked={showInactive} onChange={setShowInactive}>
        {t.team.showInactive}
      </Checkbox>
      {q.isLoading ? (
        <Loading />
      ) : q.error ? (
        <LoadError error={q.error} retry={() => void q.refetch()} />
      ) : (
        <>
          <h2 className="sub-head">{t.team.biomedicalTeam}</h2>
          <PeopleRows
            people={list.filter((p) => p.role !== "staff")}
            actor={actor}
            flash={flash}
            onEdit={(p) => setEdit({ mode: "edit", person: p })}
            empty={t.team.empty}
          />
          {list.filter((p) => p.role !== "staff").length === 1 && (
            <p className="muted" style={{ marginTop: 12 }}>
              {t.team.empty}
            </p>
          )}
          <h2 className="sub-head" style={{ marginTop: 24 }}>
            {t.team.hospitalStaff}
          </h2>
          <PeopleRows
            people={list.filter((p) => p.role === "staff")}
            actor={actor}
            flash={flash}
            onEdit={(p) => setEdit({ mode: "edit", person: p })}
            empty={t.team.staffEmpty}
            deptName={deptName}
          />
        </>
      )}

      {edit?.mode === "add" && (
        <PersonForm
          actorRole={actor.role}
          departments={depts.data ?? []}
          onClose={() => setEdit(null)}
          onSaved={(id) => {
            setEdit(null);
            setFlash(id);
            toast(t.team.added);
          }}
        />
      )}
      {edit?.mode === "edit" && (
        <PersonForm
          actorRole={actor.role}
          departments={depts.data ?? []}
          person={edit.person}
          onClose={() => setEdit(null)}
          onSaved={(id) => {
            setEdit(null);
            setFlash(id);
            toast(t.app.saved);
          }}
          onReset={() => setEdit({ mode: "reset", person: edit.person })}
          onDeactivate={() => {
            setDeactivating(edit.person);
            setEdit(null);
          }}
        />
      )}
      {edit?.mode === "reset" && <ResetForm person={edit.person} onClose={() => setEdit(null)} />}
      {deactivating && (
        <Confirm
          message={t.team.deactivateConfirm(deactivating.name)}
          confirmLabel={t.team.deactivate}
          danger
          onCancel={() => setDeactivating(null)}
          onConfirm={async () => {
            await patch(`/team/${deactivating.id}`, { isActive: false });
            await qc.invalidateQueries({ queryKey: qk.team });
            toast(t.team.deactivated);
            setDeactivating(null);
          }}
        />
      )}
    </>
  );
}

function PersonForm({
  actorRole,
  departments,
  person,
  onClose,
  onSaved,
  onReset,
  onDeactivate,
}: {
  actorRole: Role;
  departments: DepartmentListItem[];
  person?: Person;
  onClose: () => void;
  onSaved: (id: string) => void;
  onReset?: () => void;
  onDeactivate?: () => void;
}) {
  const qc = useQueryClient();
  const roles = assignableRoles(actorRole);
  const [f, setF] = useState({
    name: person?.name ?? "",
    username: person?.username ?? "",
    phone: person?.phone ?? "",
    email: person?.email ?? "",
    role: (person?.role ?? "engineer") as Role,
    password: "",
    departmentIds: person?.departmentIds ?? [],
  });
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      const saved = person
        ? await patch<Person>(`/team/${person.id}`, {
            name: f.name,
            phone: f.phone,
            email: f.email,
            role: f.role,
            ...(f.role === "staff" ? { departmentIds: f.departmentIds } : {}),
          })
        : await post<Person>("/team", { ...f, departmentIds: f.role === "staff" ? f.departmentIds : [] });
      await qc.invalidateQueries({ queryKey: qk.team });
      onSaved(saved.id);
    } catch (e) {
      setErrs(fieldErrors(e));
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SheetForm
      title={person ? t.team.editTitle(person.name) : t.team.addTitle}
      onClose={onClose}
      onSubmit={submit}
      submitLabel={person ? t.app.saveChanges : t.team.add}
      busy={busy}
      error={Object.keys(errs).length ? null : error}
    >
      <TextField
        label={t.team.fullName}
        value={f.name}
        onChange={(v) => setF({ ...f, name: v })}
        error={errs.name}
      />
      {!person && (
        <TextField
          label={t.team.username}
          value={f.username}
          onChange={(v) => setF({ ...f, username: v })}
          error={errs.username}
          help={t.team.usernameHelp}
          autoComplete="off"
        />
      )}
      <PhoneField
        label={t.team.phone}
        value={f.phone}
        onChange={(v) => setF({ ...f, phone: v })}
        error={errs.phone}
      />
      <TextField
        label={t.team.email}
        type="email"
        inputMode="email"
        value={f.email}
        onChange={(v) => setF({ ...f, email: v })}
        error={errs.email}
      />
      <RadioGroup
        label={t.team.role}
        value={f.role}
        onChange={(v) => setF({ ...f, role: v })}
        options={roles.map((r) => ({ value: r, label: t.roles[r], help: t.roleHelp[r] }))}
        error={errs.role}
      />
      {f.role === "staff" && (
        <DepartmentsField
          departments={departments}
          value={f.departmentIds}
          onChange={(v) => setF({ ...f, departmentIds: v })}
          error={errs.departmentIds}
        />
      )}
      {!person && (
        <TextField
          label={t.team.tempPassword}
          value={f.password}
          onChange={(v) => setF({ ...f, password: v })}
          error={errs.password}
          help={t.team.tempPasswordHelp}
          autoComplete="new-password"
        />
      )}
      {person && (
        <div className="actions">
          <button type="button" className="btn" onClick={onReset}>
            {t.team.resetPassword}
          </button>
          {person.isActive ? (
            <button type="button" className="btn danger" onClick={onDeactivate}>
              {t.team.deactivate}
            </button>
          ) : (
            <button
              type="button"
              className="btn"
              onClick={async () => {
                await patch(`/team/${person.id}`, { isActive: true });
                await qc.invalidateQueries({ queryKey: qk.team });
                onSaved(person.id);
              }}
            >
              {t.team.reactivate}
            </button>
          )}
        </div>
      )}
    </SheetForm>
  );
}

/** Hospital staff: which departments' equipment they see. Several may be ticked. */
function DepartmentsField({
  departments,
  value,
  onChange,
  error,
}: {
  departments: DepartmentListItem[];
  value: string[];
  onChange: (v: string[]) => void;
  error?: string | undefined;
}) {
  const shown = departments.filter((d) => d.isActive || value.includes(d.id));
  return (
    <div className={`field${error ? " has-error" : ""}`}>
      <fieldset>
      <legend>{t.team.departments}</legend>
      <div className="help" style={{ marginBottom: 4 }}>
        {t.team.departmentsHelp}
      </div>
      {shown.length === 0 ? (
        <p className="muted">{t.team.noDepartments}</p>
      ) : (
        <div className="check-grid">
          {shown.map((d) => (
            <Checkbox
              key={d.id}
              checked={value.includes(d.id)}
              onChange={(on) => onChange(on ? [...value, d.id] : value.filter((x) => x !== d.id))}
            >
              {d.name}
            </Checkbox>
          ))}
        </div>
      )}
      </fieldset>
      {error && <div className="error">{error}</div>}
    </div>
  );
}

function ResetForm({ person, onClose }: { person: Person; onClose: () => void }) {
  const [password, setPassword] = useState("");
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);
  const toast = useToast();
  return (
    <SheetForm
      title={t.team.resetTitle(person.name)}
      onClose={onClose}
      submitLabel={t.team.resetPassword}
      onSubmit={async () => {
        try {
          await post(`/team/${person.id}/reset-password`, { password });
          setDone(true);
          toast(t.team.resetDone);
          onClose();
        } catch (e) {
          setErrs({ ...fieldErrors(e), password: fieldErrors(e).password ?? errorMessage(e) });
        }
      }}
    >
      {done && <Notice tone="ok">{t.team.resetDone}</Notice>}
      <TextField
        label={t.team.tempPassword}
        value={password}
        onChange={setPassword}
        error={errs.password}
        help={t.team.tempPasswordHelp}
        autoComplete="new-password"
      />
    </SheetForm>
  );
}

function PeopleRows({
  people,
  actor,
  flash,
  onEdit,
  empty,
  deptName,
}: {
  people: Person[];
  actor: { id: string; role: Role };
  flash: string | null;
  onEdit: (p: Person) => void;
  empty: string;
  /** Given for hospital staff: shows their departments. */
  deptName?: Map<string, string>;
}) {
  return (
    <Rows isEmpty={people.length === 0} empty={empty}>
      {people.map((p) => {
        const manage = p.id !== actor.id && canManagePerson(actor.role, p.role);
        return (
          <Row
            key={p.id}
            flash={flash === p.id}
            {...(manage ? { onClick: () => onEdit(p) } : {})}
            title={
              <>
                {p.name} {p.id === actor.id && <span className="muted secondary">({t.team.you})</span>}
              </>
            }
            lines={[
              <>
                {t.roles[p.role]}
                <span className="sep">{p.username}</span>
              </>,
              <>
                {p.phone}
                <span className="sep">{p.email}</span>
              </>,
              deptName &&
                (p.departmentIds.length
                  ? `${t.team.departments}: ${p.departmentIds.map((id) => deptName.get(id) ?? "").filter(Boolean).join(", ")}`
                  : t.team.departmentsNone),
            ]}
            side={!p.isActive ? <Pill tone="off">{t.status.deactivated}</Pill> : undefined}
          />
        );
      })}
    </Rows>
  );
}
