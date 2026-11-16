// Test harness: in-memory libSQL, migrations, a fake email transport, and signed-in clients per role.
import { createClient } from "@libsql/client";
import type { Role } from "@bmserv/shared/enums";
import { createApp } from "../app";
import { createAuth, useAuth } from "../auth";
import { createDb, useDb } from "../db/client";
import { runMigrations } from "../db/migrate";
import { seedSettings } from "../db/seed";
import { setTransportForTests, type OutgoingEmail } from "../emails/send";
import { setEnvForTests } from "../env";
import { createPersonUnchecked } from "../services/team";
import { sentForTests, setPushTransportForTests } from "../services/push";

export type Sent = OutgoingEmail;

let ip = 1;
const nextIp = () => `10.0.${Math.floor(ip / 250)}.${(ip++ % 250) + 1}`;

export async function setupTest() {
  setEnvForTests({ EMAIL_REDIRECT_TO: undefined });
  const client = createClient({ url: ":memory:" });
  const db = createDb(client);
  useDb(db, client);
  useAuth(createAuth(db));
  await runMigrations(db);
  await seedSettings({ email: "biomed@hospital.test", phone: "01-5555555" });

  const sent: Sent[] = [];
  let failNext = false;
  setTransportForTests(async (email) => {
    if (failNext) {
      failNext = false;
      return { ok: false, error: "Simulated failure" };
    }
    sent.push(email);
    return { ok: true, id: `test-${sent.length}` };
  });

  sentForTests.length = 0;
  setPushTransportForTests(async () => 201);
  const app = createApp();

  async function signIn(username: string, password: string) {
    const res = await app.request("/api/auth/sign-in/username", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:5173", "x-forwarded-for": nextIp() },
      body: JSON.stringify({ username, password }),
    });
    const cookie = (res.headers.getSetCookie?.() ?? [res.headers.get("set-cookie") ?? ""]).map((c) => c.split(";")[0]).join("; ");
    return { res, cookie };
  }

  async function person(role: Role, username: string) {
    const p = await createPersonUnchecked(
      { name: `${role} ${username}`, username, email: `${username}@hospital.test`, phone: "9800000000", role, password: "password123" },
      { mustChangePassword: false },
    );
    const { cookie } = await signIn(username, "password123");
    const call = async <T = unknown>(method: string, path: string, body?: unknown) => {
      const res = await app.request(`/api${path}`, {
        method,
        headers: { cookie, "content-type": "application/json", origin: "http://localhost:5173", "x-forwarded-for": nextIp() },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
      const text = await res.text();
      let json: unknown;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = text;
      }
      return { status: res.status, json: json as T };
    };
    return { ...p, cookie, call };
  }

  const admin = await person("admin", "admin");
  const lead = await person("lead", "lead");
  const engineer = await person("engineer", "engineer");
  const staff = await person("staff", "nurse");

  return {
    app,
    db,
    sent,
    pushed: sentForTests,
    failNextEmail: () => {
      failNext = true;
    },
    signIn,
    person,
    admin,
    lead,
    engineer,
    staff,
    close: () => {
      setTransportForTests(null);
      setPushTransportForTests(null);
      client.close();
    },
  };
}

export type TestCtx = Awaited<ReturnType<typeof setupTest>>;

type Obj = Record<string, unknown>;

/** Builds a department, provider (with an email), engineer and one equipment. */
export async function basicEquipment(ctx: TestCtx) {
  const dept = await ctx.lead.call<Obj>("POST", "/departments", { name: "ICU", shortName: null });
  const dept2 = await ctx.lead.call<Obj>("POST", "/departments", { name: "Emergency", shortName: null });
  const provider = await ctx.lead.call<Obj>("POST", "/service-providers", {
    name: "Shrestha Medical",
    address: null,
    companyPhone: null,
    companyEmail: null,
    notes: null,
    contacts: [
      { kind: "phone", value: "+977 9801234567", label: "Service desk" },
      { kind: "email", value: "service@shrestha.test", label: "Service desk" },
    ],
    engineer: { name: "Ram Field", phone: "+977 9811111111", email: "ram@shrestha.test" },
  });
  const providerId = provider.json.id as string;
  const detail = await ctx.lead.call<{ engineers: { id: string }[] }>("GET", `/service-providers/${providerId}`);
  const se = { json: { id: detail.json.engineers[0]?.id } };
  const model = await ctx.lead.call<Obj>("POST", "/models", {
    typeName: "Ventilator",
    manufacturer: "Dräger",
    model: "Savina 300",
    category: null,
    pmsEvery: 6,
    pmsUnit: "months",
  });
  const eq = await ctx.lead.call<Obj>("POST", "/equipment", {
    modelId: model.json.id,
    serialNumber: "ASKL-0093",
    hospitalTag: null,
    serviceProviderId: providerId,
    homeDepartmentId: dept.json.id,
    installedOn: "2024-03-15",
    notes: null,
    serviceEngineerIds: [se.json.id],
    lastPmsDoneOn: null,
  });
  return {
    departmentId: dept.json.id as string,
    department2Id: dept2.json.id as string,
    providerId,
    serviceEngineerId: se.json.id as string,
    modelId: model.json.id as string,
    equipmentId: eq.json.id as string,
  };
}
