import { useState } from "react";
import { useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import type { ContactKind } from "@bmserv/shared/enums";
import { t } from "@bmserv/shared/terms";
import { errorMessage, fieldErrors, get, patch, post } from "../lib/api";
import { useCan, useMe, useSave, useTitle } from "../lib/hooks";
import { qk } from "../lib/queryKeys";
import type { Contact, ProviderDetail, ProviderListItem, ServiceEngineer } from "../lib/types";
import { EquipmentLine } from "../components/EquipmentLine";
import { EmailRows } from "../components/EmailRows";
import {
  Checkbox,
  Email,
  Fact,
  LoadError,
  Loading,
  Notice,
  PageHead,
  Phone,
  PhoneField,
  Pill,
  Row,
  Rows,
  Section,
  SheetForm,
  TextArea,
  TextField,
  useToast,
  WhatsAppButton,
} from "../components/ui";
import { SetupTabs } from "../components/SetupTabs";

export function Providers() {
  useTitle(t.providers.title);
  const q = useQuery({
    queryKey: qk.providers,
    queryFn: () => get<ProviderListItem[]>("/service-providers"),
  });
  const canEdit = useCan("provider.edit");
  const [adding, setAdding] = useState(false);
  return (
    <>
      <PageHead title={t.nav.setup}>
        {canEdit && (
          <button className="btn primary" onClick={() => setAdding(true)}>
            {t.providers.add}
          </button>
        )}
      </PageHead>
      <SetupTabs />
      {q.isLoading ? (
        <Loading />
      ) : q.error ? (
        <LoadError error={q.error} retry={() => void q.refetch()} />
      ) : (
        <Rows isEmpty={!q.data?.length} empty={t.providers.empty}>
          {q.data?.map((p) => (
            <Row
              key={p.id}
              to={`/service-providers/${p.id}`}
              title={p.name}
              lines={[
                <>
                  {t.equipment.count(p.equipmentCount)}
                  <span className="sep">
                    {p.engineerCount} {t.providers.serviceEngineers.toLowerCase()}
                  </span>
                </>,
                p.emailCount === 0 ? (
                  <span style={{ color: "var(--wait-text)" }}>{t.providers.noEmailYet(p.name)}</span>
                ) : null,
              ]}
              side={!p.isActive ? <Pill tone="off">{t.status.inactive}</Pill> : undefined}
            />
          ))}
        </Rows>
      )}
      {adding && <ProviderForm onClose={() => setAdding(false)} />}
    </>
  );
}

function ProviderForm({ provider, onClose }: { provider?: ProviderDetail["provider"]; onClose: () => void }) {
  const [f, setF] = useState({
    name: provider?.name ?? "",
    address: provider?.address ?? "",
    companyPhone: provider?.companyPhone ?? "",
    companyEmail: provider?.companyEmail ?? "",
    notes: provider?.notes ?? "",
    isActive: provider?.isActive ?? true,
  });
  const [phones, setPhones] = useState<string[]>([""]);
  const [emails, setEmails] = useState<string[]>([""]);
  const [engineer, setEngineer] = useState({ name: "", phone: "", email: "" });
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const save = useSave(async () => {
    const body = { ...f, companyPhone: f.companyPhone || null, companyEmail: f.companyEmail || null };
    if (provider) return patch(`/service-providers/${provider.id}`, body);
    const contacts = [
      ...phones
        .filter((p) => p.trim())
        .map((value, i) => ({ kind: "phone", value, label: i === 0 ? t.providers.serviceDepartment : null })),
      ...emails
        .filter((p) => p.trim())
        .map((value, i) => ({ kind: "email", value, label: i === 0 ? t.providers.serviceDepartment : null })),
    ];
    const { isActive: _a, ...rest } = body;
    return post("/service-providers", { ...rest, contacts, engineer });
  });
  const phoneCount = phones.filter((p) => p.trim()).length;
  // Server field keys are contacts.N.value, phones first then emails.
  const contactErr = (kind: ContactKind, i: number) =>
    errs[`contacts.${kind === "phone" ? i : phoneCount + i}.value`];
  return (
    <SheetForm
      title={provider ? t.providers.editTitle : t.providers.addTitle}
      onClose={onClose}
      submitLabel={provider ? t.app.saveChanges : t.providers.add}
      busy={save.isPending}
      error={Object.keys(errs).length ? null : error}
      onSubmit={() =>
        save.mutate(undefined, {
          onSuccess: () => {
            toast(t.app.saved);
            onClose();
          },
          onError: (e) => {
            setErrs(fieldErrors(e));
            setError(errorMessage(e));
          },
        })
      }
    >
      <TextField
        label={t.providers.name}
        value={f.name}
        onChange={(v) => setF({ ...f, name: v })}
        error={errs.name}
      />
      {!provider && (
        <fieldset className="form-group">
          <legend>{t.providers.serviceDepartment}</legend>
          <p className="help">{t.providers.serviceDepartmentHelp}</p>
          {phones.map((p, i) => (
            <div className="repeat-block" key={`p${i}`}>
              <PhoneField
                label={i === 0 ? t.providers.servicePhone : `${t.providers.servicePhone} ${i + 1}`}
                value={p}
                onChange={(v) => setPhones(phones.map((x, j) => (j === i ? v : x)))}
                error={(i === 0 ? errs.servicePhone : undefined) ?? contactErr("phone", i)}
              />
              {i > 0 && (
                <button
                  type="button"
                  className="btn plain"
                  onClick={() => setPhones(phones.filter((_, j) => j !== i))}
                >
                  {t.settings.remove}
                </button>
              )}
            </div>
          ))}
          <button type="button" className="btn plain" onClick={() => setPhones([...phones, ""])}>
            {t.providers.addPhone}
          </button>
          {emails.map((p, i) => (
            <div className="repeat-block" key={`e${i}`}>
              <TextField
                label={i === 0 ? t.providers.serviceEmail : `${t.providers.serviceEmail} ${i + 1}`}
                type="email"
                inputMode="email"
                value={p}
                onChange={(v) => setEmails(emails.map((x, j) => (j === i ? v : x)))}
                error={(i === 0 ? errs.serviceEmail : undefined) ?? contactErr("email", i)}
              />
              {i > 0 && (
                <button
                  type="button"
                  className="btn plain"
                  onClick={() => setEmails(emails.filter((_, j) => j !== i))}
                >
                  {t.settings.remove}
                </button>
              )}
            </div>
          ))}
          <button type="button" className="btn plain" onClick={() => setEmails([...emails, ""])}>
            {t.providers.addEmailContact}
          </button>
        </fieldset>
      )}
      {!provider && (
        <fieldset className="form-group">
          <legend>{t.providers.firstEngineer}</legend>
          <p className="help">{t.providers.firstEngineerHelp}</p>
          <TextField
            label={t.providers.engineerName}
            value={engineer.name}
            onChange={(v) => setEngineer({ ...engineer, name: v })}
            error={errs["engineer.name"]}
          />
          <PhoneField
            label={t.providers.engineerPhone}
            value={engineer.phone}
            onChange={(v) => setEngineer({ ...engineer, phone: v })}
            error={errs["engineer.phone"]}
          />
          <TextField
            label={t.providers.engineerEmail}
            type="email"
            inputMode="email"
            value={engineer.email}
            onChange={(v) => setEngineer({ ...engineer, email: v })}
            error={errs["engineer.email"]}
            help={t.providers.engineerEmailHelp}
          />
        </fieldset>
      )}
      <PhoneField
        label={t.providers.companyPhone}
        value={f.companyPhone}
        onChange={(v) => setF({ ...f, companyPhone: v })}
        error={errs.companyPhone}
        optional
      />
      <TextField
        label={t.providers.companyEmail}
        type="email"
        value={f.companyEmail}
        onChange={(v) => setF({ ...f, companyEmail: v })}
        error={errs.companyEmail}
        optional
      />
      <TextField
        label={t.providers.address}
        value={f.address}
        onChange={(v) => setF({ ...f, address: v })}
        optional
      />
      <TextArea
        label={t.providers.notes}
        value={f.notes}
        onChange={(v) => setF({ ...f, notes: v })}
        optional
      />
      {provider && (
        <Checkbox checked={!f.isActive} onChange={(v) => setF({ ...f, isActive: !v })}>
          {t.departments.makeInactive}
        </Checkbox>
      )}
    </SheetForm>
  );
}

export function ProviderPage() {
  const { id = "" } = useParams();
  const q = useQuery({
    queryKey: qk.provider(id),
    queryFn: () => get<ProviderDetail>(`/service-providers/${id}`),
  });
  const canEdit = useCan("provider.edit");
  const canEngineers = useCan("serviceEngineer.manage");
  const me = useMe();
  const [editing, setEditing] = useState(false);
  const [contactKind, setContactKind] = useState<ContactKind | null>(null);
  const [engineer, setEngineer] = useState<ServiceEngineer | "new" | null>(null);
  const toast = useToast();
  const removeContact = useSave((c: Contact) => patch(`/provider-contacts/${c.id}`, { isActive: false }));
  useTitle(q.data?.provider.name ?? t.providers.title);
  if (q.isLoading) return <Loading />;
  if (q.error || !q.data) return <LoadError error={q.error} retry={() => void q.refetch()} />;
  const { provider, contacts, engineers, equipment, emails } = q.data;
  const phones = contacts.filter((c) => c.kind === "phone");
  const hello = t.whatsapp.hello(me.data?.hospital.departmentName ?? "", me.data?.hospital.name ?? "");
  const mails = contacts.filter((c) => c.kind === "email");

  return (
    <>
      <PageHead title={provider.name} back={{ to: "/service-providers", label: t.providers.title }}>
        {canEdit && (
          <button className="btn" onClick={() => setEditing(true)}>
            {t.providers.edit}
          </button>
        )}
      </PageHead>
      {!mails.length && <Notice tone="wait">{t.providers.noEmailYet(provider.name)}</Notice>}
      <div className="facts">
        {provider.companyPhone && (
          <Fact label={t.providers.companyPhone}>
            <Phone value={provider.companyPhone} />
          </Fact>
        )}
        {provider.companyEmail && (
          <Fact label={t.providers.companyEmail}>
            <Email value={provider.companyEmail} />
          </Fact>
        )}
        {provider.address && <Fact label={t.providers.address}>{provider.address}</Fact>}
        {provider.notes && (
          <Fact label={t.providers.notes}>
            <span className="pre-line">{provider.notes}</span>
          </Fact>
        )}
      </div>

      <Section
        title={t.providers.serviceDepartment}
        action={
          canEdit && (
            <span style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              <button className="btn plain" onClick={() => setContactKind("phone")}>
                {t.providers.addPhone}
              </button>
              <button className="btn plain" onClick={() => setContactKind("email")}>
                {t.providers.addEmailContact}
              </button>
            </span>
          )
        }
      >
        <Rows isEmpty={!contacts.length} empty={t.providers.noEmailYet(provider.name)}>
          {[...phones, ...mails].map((c) => (
            <Row
              key={c.id}
              title={c.kind === "phone" ? <Phone value={c.value} /> : <Email value={c.value} />}
              lines={[c.label ? `${t.contactKind[c.kind]}, ${c.label}` : t.contactKind[c.kind]]}
              side={
                <>
                  {c.kind === "phone" && <WhatsAppButton phone={c.value} text={hello} plain />}
                  {canEdit && (
                    <button
                      className="btn plain"
                      onClick={() =>
                        removeContact.mutate(c, { onSuccess: () => toast(t.providers.contactRemoved) })
                      }
                    >
                      {t.settings.remove}
                    </button>
                  )}
                </>
              }
            />
          ))}
        </Rows>
      </Section>

      <Section
        title={t.providers.serviceEngineers}
        action={
          canEngineers && (
            <button className="btn plain" onClick={() => setEngineer("new")}>
              {t.providers.addEngineer}
            </button>
          )
        }
      >
        <Rows isEmpty={!engineers.length} empty={t.providers.engineersEmpty}>
          {engineers.map((se) => (
            <Row
              key={se.id}
              title={se.name}
              lines={[
                <>
                  <Phone value={se.phone} />
                  {se.email && (
                    <span className="sep">
                      <Email value={se.email} />
                    </span>
                  )}
                </>,
                se.notes,
              ]}
              side={
                <>
                  {!se.isActive && <Pill tone="off">{t.providers.engineerInactive}</Pill>}
                  {se.isActive && <WhatsAppButton phone={se.phone} text={hello} plain />}
                  {canEngineers && (
                    <button className="btn plain" onClick={() => setEngineer(se)}>
                      {t.providers.edit}
                    </button>
                  )}
                </>
              }
            />
          ))}
        </Rows>
      </Section>

      <Section title={t.providers.equipment}>
        <Rows isEmpty={!equipment.length} empty={t.providers.equipmentEmpty}>
          {equipment.map((e) => (
            <EquipmentLine key={e.id} e={e} />
          ))}
        </Rows>
      </Section>

      <Section title={t.providers.emailsSent}>
        <EmailRows emails={emails} empty={t.providers.emailsEmpty} />
      </Section>

      {editing && <ProviderForm provider={provider} onClose={() => setEditing(false)} />}
      {contactKind && (
        <ContactForm providerId={provider.id} kind={contactKind} onClose={() => setContactKind(null)} />
      )}
      {engineer && (
        <EngineerForm
          providerId={provider.id}
          engineer={engineer === "new" ? undefined : engineer}
          onClose={() => setEngineer(null)}
        />
      )}
    </>
  );
}

function ContactForm({
  providerId,
  kind,
  onClose,
}: {
  providerId: string;
  kind: ContactKind;
  onClose: () => void;
}) {
  const [value, setValue] = useState("");
  const [label, setLabel] = useState("");
  const [errs, setErrs] = useState<Record<string, string>>({});
  const toast = useToast();
  const save = useSave(() =>
    post(`/service-providers/${providerId}/contacts`, { kind, value, label: label || null }),
  );
  return (
    <SheetForm
      title={kind === "email" ? t.providers.addEmailContact : t.providers.addPhone}
      onClose={onClose}
      submitLabel={t.app.save}
      busy={save.isPending}
      onSubmit={() =>
        save.mutate(undefined, {
          onSuccess: () => {
            toast(t.app.saved);
            onClose();
          },
          onError: (e) => setErrs(fieldErrors(e)),
        })
      }
    >
      {kind === "phone" ? (
        <PhoneField label={t.contactKind.phone} value={value} onChange={setValue} error={errs.value} />
      ) : (
        <TextField
          label={t.contactKind.email}
          type="email"
          value={value}
          onChange={setValue}
          error={errs.value}
        />
      )}
      <TextField
        label={t.providers.label}
        value={label}
        onChange={setLabel}
        help={t.providers.labelHelp}
        optional
      />
    </SheetForm>
  );
}

export function EngineerForm({
  providerId,
  engineer,
  onClose,
  onSaved,
}: {
  providerId: string;
  engineer?: ServiceEngineer;
  onClose: () => void;
  onSaved?: (se: ServiceEngineer) => void;
}) {
  const [f, setF] = useState({
    name: engineer?.name ?? "",
    phone: engineer?.phone ?? "",
    email: engineer?.email ?? "",
    notes: engineer?.notes ?? "",
    isActive: engineer?.isActive ?? true,
  });
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const save = useSave(() =>
    engineer
      ? patch<ServiceEngineer>(`/service-engineers/${engineer.id}`, f)
      : post<ServiceEngineer>(`/service-providers/${providerId}/engineers`, {
          name: f.name,
          phone: f.phone,
          email: f.email,
          notes: f.notes,
        }),
  );
  return (
    <SheetForm
      title={engineer ? t.providers.editEngineer : t.providers.addEngineer}
      onClose={onClose}
      submitLabel={engineer ? t.app.saveChanges : t.providers.addEngineer}
      busy={save.isPending}
      error={Object.keys(errs).length ? null : error}
      onSubmit={() =>
        save.mutate(undefined, {
          onSuccess: (se) => {
            toast(t.app.saved);
            onSaved?.(se);
            onClose();
          },
          onError: (e) => {
            setErrs(fieldErrors(e));
            setError(errorMessage(e));
          },
        })
      }
    >
      <TextField
        label={t.providers.engineerName}
        value={f.name}
        onChange={(v) => setF({ ...f, name: v })}
        error={errs.name}
      />
      <PhoneField
        label={t.providers.engineerPhone}
        value={f.phone}
        onChange={(v) => setF({ ...f, phone: v })}
        error={errs.phone}
      />
      <TextField
        label={t.providers.engineerEmail}
        type="email"
        value={f.email}
        onChange={(v) => setF({ ...f, email: v })}
        error={errs.email}
        help={t.providers.engineerEmailHelp}
      />
      <TextArea
        label={t.providers.engineerNotes}
        value={f.notes}
        onChange={(v) => setF({ ...f, notes: v })}
        optional
        rows={3}
      />
      {engineer && (
        <Checkbox checked={!f.isActive} onChange={(v) => setF({ ...f, isActive: !v })}>
          {t.providers.engineerInactive}
        </Checkbox>
      )}
    </SheetForm>
  );
}
