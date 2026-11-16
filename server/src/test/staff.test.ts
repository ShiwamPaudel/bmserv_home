import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { basicEquipment, setupTest, type TestCtx } from "./setup";

type Any = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- loose JSON in tests

let ctx: TestCtx;
let base: Awaited<ReturnType<typeof basicEquipment>>;
let qr: string;

beforeAll(async () => {
  ctx = await setupTest();
  base = await basicEquipment(ctx);
  qr = (await ctx.lead.call<Any>("GET", `/equipment/${base.equipmentId}`)).json.equipment.qrCode;
});
afterAll(() => ctx.close());

describe("counts in lists", () => {
  it("departments, models and providers count their equipment", async () => {
    const depts = await ctx.engineer.call<Any[]>("GET", "/departments");
    expect(depts.json.find((d) => d.id === base.departmentId)?.hereNow).toBe(1);
    expect(depts.json.find((d) => d.id === base.department2Id)?.hereNow).toBe(0);
    const models = await ctx.engineer.call<Any[]>("GET", "/models");
    expect(models.json[0]?.equipmentCount).toBe(1);
    expect(models.json[0]?.pmsEvery).toBe(6);
    const providers = await ctx.engineer.call<Any[]>("GET", "/service-providers");
    expect(providers.json[0]).toMatchObject({ equipmentCount: 1, engineerCount: 1, emailCount: 1 });
  });
});

describe("service providers", () => {
  it("need the service department's phone and email, and an engineer with name, phone and email", async () => {
    const r = await ctx.lead.call<Any>("POST", "/service-providers", {
      name: "No Contacts Ltd",
      address: null,
      companyPhone: null,
      companyEmail: null,
      notes: null,
      contacts: [],
      engineer: { name: "", phone: "", email: "" },
    });
    expect(r.status).toBe(400);
    expect(Object.keys(r.json.error.fields)).toEqual(expect.arrayContaining(["servicePhone", "serviceEmail", "engineer.name", "engineer.phone", "engineer.email"]));
  });
});

describe("hospital staff", () => {
  it("cannot see the register, breakdowns, team or settings", async () => {
    for (const path of ["/equipment", "/breakdowns", "/team", "/settings", "/departments", "/home", `/equipment/by-qr/${qr}`]) {
      expect((await ctx.staff.call("GET", path)).status, path).toBe(403);
    }
    expect((await ctx.staff.call("GET", "/me")).status).toBe(200);
  });

  it("sees what a label belongs to; turning notifications on is refused plainly without VAPID keys", async () => {
    const info = await ctx.staff.call<Any>("GET", `/report/${qr}`);
    expect(info.status).toBe(200);
    expect(info.json.open).toBeNull();
    expect(info.json.equipment.typeName).toBe("Ventilator");
    for (const p of [ctx.lead, ctx.engineer, ctx.admin]) {
      const r = await p.call("POST", "/push/subscriptions", {
        endpoint: `https://push.example.com/${p.username}`,
        keys: { p256dh: "p256dh-key-for-test-123", auth: "auth-key-123" },
      });
      expect(r.status).toBe(503); // no VAPID keys in tests: refused plainly
    }
  });
});

describe("hospital staff with notifications on", () => {
  it("reports, adds to an open report instead of a second breakdown, and sees My reports", async () => {
    const { setEnvForTests } = await import("../env");
    setEnvForTests({ VAPID_PUBLIC_KEY: "BPublicKeyForTests", VAPID_PRIVATE_KEY: "private-key-for-tests" });
    for (const p of [ctx.lead, ctx.engineer, ctx.staff]) {
      const r = await p.call("POST", "/push/subscriptions", {
        endpoint: `https://push.example.com/${p.username}`,
        keys: { p256dh: "p256dh-key-for-test-123", auth: "auth-key-123" },
      });
      expect(r.status).toBe(201);
    }
    ctx.sent.length = 0;
    ctx.pushed.length = 0;

    const r = await ctx.staff.call<Any>("POST", "/report", { qrCode: qr, problem: "Alarm keeps sounding" });
    expect(r.status).toBe(201);
    expect(r.json.again).toBe(false);
    expect(r.json.whatsapp.contacts.length).toBeGreaterThan(0);
    expect(r.json.whatsapp.contacts[0].name).toBe(ctx.lead.name); // responsible first

    const bd = await ctx.lead.call<Any>("GET", `/breakdowns/${r.json.id}`);
    expect(bd.json.breakdown.assignedTo).toBe(ctx.lead.id);
    expect(bd.json.breakdown.reportedByName).toBe(ctx.staff.name);
    expect(bd.json.phoneContacts.serviceEngineers[0]).toMatchObject({ name: "Ram Field", designated: true });

    // Push to the team (not the reporter), email to the team only (no provider CC).
    const pushedTo = ctx.pushed.map((p) => p.userId).sort();
    expect(pushedTo).toEqual([ctx.engineer.id, ctx.lead.id].sort());
    expect(ctx.sent).toHaveLength(1);
    expect(ctx.sent[0]?.subject).toContain("Problem reported");
    expect(ctx.sent[0]?.to).toEqual(expect.arrayContaining(["lead@hospital.test", "engineer@hospital.test", "admin@hospital.test"]));
    expect(ctx.sent[0]?.to).not.toContain("nurse@hospital.test");

    // Same equipment again: a note on the same breakdown.
    const again = await ctx.staff.call<Any>("POST", "/report", { qrCode: qr, problem: "Now it does not switch on" });
    expect(again.json.again).toBe(true);
    expect(again.json.id).toBe(r.json.id);
    expect(ctx.sent).toHaveLength(1);

    const mine = await ctx.staff.call<Any[]>("GET", "/my-reports");
    expect(mine.json).toHaveLength(1);
    expect(mine.json[0]?.status).toBe("open");

    // Fixed: the person who reported it hears about it.
    ctx.pushed.length = 0;
    const close = await ctx.engineer.call("POST", `/breakdowns/${r.json.id}/close`, {
      outcome: "fixed",
      fixedBy: "in_house",
      serviceEngineerName: null,
      workDone: "Replaced the flow sensor",
      partsReplaced: null,
    });
    expect(close.status).toBe(200);
    expect(ctx.pushed.map((p) => p.userId)).toEqual([ctx.staff.id]);
    expect(ctx.pushed[0]?.payload.url).toBe("/my-reports");
  });

  it("a team-recorded breakdown notifies the rest of the team", async () => {
    ctx.pushed.length = 0;
    ctx.sent.length = 0;
    const r = await ctx.engineer.call<Any>("POST", "/breakdowns", {
      equipmentId: base.equipmentId,
      problem: "Screen flickers",
      reportedByName: "Sita, ICU nurse",
      reportedAt: Date.now(),
    });
    expect(r.status).toBe(201);
    expect(ctx.pushed.map((p) => p.userId)).toEqual([ctx.lead.id]);
    expect(ctx.sent).toHaveLength(0); // the team email is only for staff reports
  });

  it("staff reporting can be turned off in Settings", async () => {
    expect((await ctx.admin.call("PATCH", "/settings", { staffReports: false })).status).toBe(200);
    expect((await ctx.staff.call("GET", `/report/${qr}`)).status).toBe(403);
    expect((await ctx.admin.call("PATCH", "/settings", { staffReports: true })).status).toBe(200);
  });
});

describe("model photo", () => {
  const photo = (over: Record<string, unknown> = {}) => ({
    ownerType: "model",
    ownerId: base.modelId,
    kind: "photo",
    title: "Photo",
    note: null,
    fileName: "savina.jpg",
    mimeType: "image/jpeg",
    sizeBytes: 300_000,
    ...over,
  });

  it("only Lead or Admin set it, and only as an image", async () => {
    expect((await ctx.engineer.call("POST", "/files/upload", photo())).status).toBe(403);
    expect((await ctx.lead.call("POST", "/files/upload", photo({ mimeType: "application/pdf", fileName: "x.pdf" }))).status).toBe(400);
    const ok = await ctx.lead.call<Any>("POST", "/files/upload", photo());
    expect(ok.status).toBe(201);
    expect(ok.json.uploadUrl).toContain("models/");
  });

  it("models and equipment rows carry the photo id; staff may load photos but nothing else under files", async () => {
    const models = await ctx.engineer.call<Any[]>("GET", "/models");
    expect(models.json[0]).toHaveProperty("photoFileId", null);
    const list = await ctx.engineer.call<Any>("GET", "/equipment");
    expect(list.json.rows[0]).toHaveProperty("modelPhotoFileId", null);
    expect((await ctx.staff.call("GET", "/files/unknownphoto1/image")).status).toBe(404);
    expect((await ctx.staff.call("GET", "/files/unknownphoto1/link")).status).toBe(403);
  });
});

describe("model page", () => {
  it("one model: its manuals (stored once) and every equipment of that model", async () => {
    const r = await ctx.engineer.call<Any>("GET", `/models/${base.modelId}`);
    expect(r.status).toBe(200);
    expect(r.json.model).toMatchObject({ id: base.modelId, manualCount: 0, pmsEvery: 6 });
    expect(r.json.manuals).toEqual([]);
    expect(r.json.equipment.map((e: Any) => e.id)).toContain(base.equipmentId);
    expect((await ctx.staff.call("GET", `/models/${base.modelId}`)).status).toBe(403);
  });
});

describe("settings by tab", () => {
  it("saves only the fields sent and checks them", async () => {
    const before = (await ctx.admin.call<Any>("GET", "/settings")).json;
    const r = await ctx.admin.call<Any>("PATCH", "/settings", { countryCode: "+91", pmsSoonDays: 14 });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ countryCode: "+91", pmsSoonDays: 14, hospitalName: before.hospitalName });
    expect((await ctx.admin.call("PATCH", "/settings", { countryCode: "91" })).status).toBe(400);
    expect((await ctx.admin.call("PATCH", "/settings", { staffReportAssigneeId: ctx.staff.id })).status).toBe(400);
    expect((await ctx.lead.call("PATCH", "/settings", { pmsSoonDays: 3 })).status).toBe(403);
  });
});
