import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addDays, addMonths, todayNepal } from "@bmserv/shared/dates";
import { importTemplate } from "@bmserv/shared/csv";
import { breakdowns, files } from "../db/schema";
import { applyRedirect } from "../emails/send";
import { setEnvForTests } from "../env";
import { autoResume, isDailyEmailDue, sendDueDailyEmails } from "../services/breakdowns";
import { sendDuePmsReminders } from "../services/pms";
import { basicEquipment, setupTest, type TestCtx } from "./setup";

type Obj = Record<string, unknown>;
type Any = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- loose JSON in tests

/** A moment at a Nepal date and time. */
const atNepal = (date: string, hhmm: string) => Date.parse(`${date}T${hhmm}:00+05:45`);

let ctx: TestCtx;
let base: Awaited<ReturnType<typeof basicEquipment>>;
const today = todayNepal();

beforeAll(async () => {
  ctx = await setupTest();
  base = await basicEquipment(ctx);
});
afterAll(() => ctx.close());

describe("equipment register (F3, F5, F8)", () => {
  it("refuses a duplicate serial number, ignoring case and spaces, with a link", async () => {
    const r = await ctx.lead.call<Any>("POST", "/equipment", {
      modelId: base.modelId,
      serialNumber: " askl-00 93 ",
      hospitalTag: null,
      serviceProviderId: base.providerId,
      homeDepartmentId: base.departmentId,
      installedOn: "2024-03-15",
      notes: null,
      serviceEngineerIds: [],
      lastPmsDoneOn: null,
    });
    expect(r.status).toBe(409);
    expect(r.json.error.equipmentId).toBe(base.equipmentId);
  });

  it("an Engineer cannot add equipment", async () => {
    const r = await ctx.engineer.call("POST", "/equipment", {});
    expect(r.status).toBe(403);
  });

  it("finds equipment by text and shows designated service engineers", async () => {
    const list = await ctx.engineer.call<Any>("GET", "/equipment?q=savina");
    expect(list.json.total).toBe(1);
    const detail = await ctx.engineer.call<Any>("GET", `/equipment/${base.equipmentId}`);
    expect(detail.json.designated[0].name).toBe("Ram Field");
    expect(detail.json.coverage.current).toBeNull();
    expect(detail.json.nextPms).toBeNull();
  });

  it("temporary move by anyone; permanent only by Lead/Admin; label needs reprinting", async () => {
    const tmp = await ctx.engineer.call<Obj>("POST", `/equipment/${base.equipmentId}/moves`, {
      toDepartmentId: base.department2Id,
      type: "temporary",
      reason: "Needed in Emergency",
      expectedReturnOn: addDays(today, -1),
    });
    expect(tmp.status).toBe(201);
    const dept = await ctx.engineer.call<Any>("GET", `/departments/${base.departmentId}`);
    expect(dept.json.elsewhere).toHaveLength(1);
    expect(dept.json.elsewhere[0].move.expectedReturnOn).toBe(addDays(today, -1));
    const home = await ctx.engineer.call<Any>("GET", "/home");
    expect(home.json.toReturn).toHaveLength(1);

    const back = await ctx.engineer.call("POST", `/moves/${tmp.json.id}/return`);
    expect(back.status).toBe(200);
    const detail = await ctx.engineer.call<Any>("GET", `/equipment/${base.equipmentId}`);
    expect(detail.json.equipment.away).toBe(false);

    const perm = await ctx.engineer.call("POST", `/equipment/${base.equipmentId}/moves`, {
      toDepartmentId: base.department2Id,
      type: "permanent",
      reason: "Reallocated",
      expectedReturnOn: null,
    });
    expect(perm.status).toBe(403);
    const perm2 = await ctx.lead.call("POST", `/equipment/${base.equipmentId}/moves`, {
      toDepartmentId: base.department2Id,
      type: "permanent",
      reason: "Reallocated",
      expectedReturnOn: null,
    });
    expect(perm2.status).toBe(201);
    const after = await ctx.engineer.call<Any>("GET", `/equipment/${base.equipmentId}`);
    expect(after.json.equipment.labelOutdated).toBe(true);
    expect(after.json.equipment.homeDepartmentId).toBe(base.department2Id);
    await ctx.engineer.call("POST", "/equipment/labels-printed", { ids: [base.equipmentId] });
    const printed = await ctx.engineer.call<Any>("GET", `/equipment/${base.equipmentId}`);
    expect(printed.json.equipment.labelOutdated).toBe(false);
  });
});

describe("files (F6)", () => {
  const upload = (over: Obj = {}) => ({
    ownerType: "model",
    ownerId: base.modelId,
    kind: "service_manual",
    title: "Service manual",
    note: null,
    fileName: "savina-service.pdf",
    mimeType: "application/pdf",
    sizeBytes: 150 * 1024 * 1024,
    ...over,
  });

  it("a 150 MB manual gets an upload link; 250 MB is refused", async () => {
    const ok = await ctx.engineer.call<Any>("POST", "/files/upload", upload());
    expect(ok.status).toBe(201);
    expect(ok.json.uploadUrl).toContain("X-Amz-Signature");
    const big = await ctx.engineer.call("POST", "/files/upload", upload({ sizeBytes: 250 * 1024 * 1024 }));
    expect(big.status).toBe(400);
  });

  it("documents are limited to 20 MB and allowed types", async () => {
    const doc = upload({ ownerType: "equipment", ownerId: base.equipmentId, kind: "installation_report", sizeBytes: 25 * 1024 * 1024 });
    expect((await ctx.engineer.call("POST", "/files/upload", doc)).status).toBe(400);
    const exe = upload({ mimeType: "application/x-msdownload", fileName: "x.exe" });
    expect((await ctx.engineer.call("POST", "/files/upload", exe)).status).toBe(400);
    const wrongKind = upload({ kind: "contract" }); // contracts belong to coverage, not to a model
    expect((await ctx.engineer.call("POST", "/files/upload", wrongKind)).status).toBe(400);
  });

  it("a manual uploaded once shows on every equipment of that model; only Lead/Admin remove", async () => {
    const ok = await ctx.engineer.call<Any>("POST", "/files/upload", upload({ sizeBytes: 1000 }));
    await ctx.db.update(files).set({ status: "ready" }).where(eq(files.id, ok.json.fileId));
    const second = await ctx.lead.call<Any>("POST", "/equipment", {
      modelId: base.modelId,
      serialNumber: "ASKL-0094",
      hospitalTag: "BME-2",
      serviceProviderId: base.providerId,
      homeDepartmentId: base.departmentId,
      installedOn: "2024-03-15",
      notes: null,
      serviceEngineerIds: [],
      lastPmsDoneOn: "2025-01-10",
    });
    const d = await ctx.engineer.call<Any>("GET", `/equipment/${second.json.id}`);
    expect(d.json.manuals.map((m: Obj) => m.id)).toContain(ok.json.fileId);
    expect(d.json.lastPms.doneOn).toBe("2025-01-10");
    const manuals = await ctx.engineer.call<Any>("GET", "/manuals?q=savina");
    expect(manuals.json.length).toBeGreaterThan(0);
    expect((await ctx.engineer.call("POST", `/files/${ok.json.fileId}/remove`)).status).toBe(403);
    expect((await ctx.lead.call("POST", `/files/${ok.json.fileId}/remove`)).status).toBe(200);
  });
});

describe("coverage and PMS (F9, F10)", () => {
  let coverageId = "";
  const startsOn = addDays(today, -10);
  const endsOn = addMonths(startsOn, 12);

  it("an Engineer cannot add coverage", async () => {
    const r = await ctx.engineer.call("POST", `/equipment/${base.equipmentId}/coverage`, {});
    expect(r.status).toBe(403);
  });

  it("creates numbered PMS dates and refuses overlaps", async () => {
    const r = await ctx.lead.call<Any>("POST", `/equipment/${base.equipmentId}/coverage`, {
      type: "amc",
      serviceProviderId: base.providerId,
      startsOn,
      endsOn,
      pmsEvery: 3,
      pmsUnit: "months",
      contractNo: "AMC-1",
      notes: null,
    });
    expect(r.status).toBe(201);
    expect(r.json.pmsCount).toBe(4);
    coverageId = r.json.id;
    const overlap = await ctx.lead.call("POST", `/equipment/${base.equipmentId}/coverage`, {
      type: "warranty",
      serviceProviderId: base.providerId,
      startsOn: addDays(endsOn, -5),
      endsOn: addDays(endsOn, 300),
      pmsEvery: null,
      contractNo: null,
      notes: null,
    });
    expect(overlap.status).toBe(409);
    const d = await ctx.engineer.call<Any>("GET", `/equipment/${base.equipmentId}`);
    expect(d.json.nextPms.number).toBe(1);
    expect(d.json.nextPms.total).toBe(4);
  });

  it("reminder goes once, grouped per provider and due date", async () => {
    // Second equipment with coverage from the same provider, same due date.
    const eq2 = await ctx.lead.call<Any>("POST", "/equipment", {
      modelId: base.modelId,
      serialNumber: "ASKL-0095",
      hospitalTag: null,
      serviceProviderId: base.providerId,
      homeDepartmentId: base.departmentId,
      installedOn: "2024-03-15",
      notes: null,
      serviceEngineerIds: [base.serviceEngineerId],
      lastPmsDoneOn: null,
    });
    await ctx.lead.call("POST", `/equipment/${eq2.json.id}/coverage`, {
      type: "cmc",
      serviceProviderId: base.providerId,
      startsOn,
      endsOn,
      pmsEvery: 6,
      contractNo: null,
      notes: null,
    });
    const due = addDays(today, 2);
    const visits1 = await ctx.lead.call<Any>("GET", `/pms?filter=due&equipment=${base.equipmentId}`);
    const visits2 = await ctx.lead.call<Any>("GET", `/pms?filter=due&equipment=${eq2.json.id}`);
    expect((await ctx.engineer.call("PATCH", `/pms/${visits1.json[0].id}`, { dueOn: due })).status).toBe(403);
    expect((await ctx.lead.call("PATCH", `/pms/${visits1.json[0].id}`, { dueOn: due })).status).toBe(200);
    expect((await ctx.lead.call("PATCH", `/pms/${visits2.json[0].id}`, { dueOn: due })).status).toBe(200);

    // The PMS screen splits "due" into Due soon (Settings window) and Upcoming (after it, up to a year).
    const soonDays = (await ctx.admin.call<Any>("GET", "/settings")).json.pmsSoonDays as number;
    const soon = await ctx.lead.call<Any[]>("GET", `/pms?filter=soon&equipment=${eq2.json.id}`);
    const upcoming = await ctx.lead.call<Any[]>("GET", `/pms?filter=upcoming&equipment=${eq2.json.id}`);
    expect(soon.json.map((v) => v.dueOn)).toEqual([due]);
    expect(upcoming.json.length).toBeGreaterThan(0);
    for (const v of upcoming.json) {
      expect(v.dueOn > addDays(today, soonDays) && v.dueOn <= addDays(today, 365)).toBe(true);
    }

    const before = ctx.sent.length;
    const early = await sendDuePmsReminders(atNepal(today, "07:00"));
    expect(early.sent).toBe(0);
    const r = await sendDuePmsReminders(atNepal(today, "08:30"));
    expect(r).toEqual({ groups: 1, sent: 1 });
    expect(ctx.sent.length).toBe(before + 1);
    const email = ctx.sent[ctx.sent.length - 1]!;
    expect(email.subject).toContain("2 equipment");
    expect(email.to).toEqual(expect.arrayContaining(["service@shrestha.test", "ram@shrestha.test"]));
    expect(email.cc ?? []).toEqual([]); // no CC addresses in settings here
    const again = await sendDuePmsReminders(atNepal(today, "09:30"));
    expect(again.sent).toBe(0);

    // Send again by hand
    const manual = await ctx.engineer.call<Any>("POST", `/pms/${visits1.json[0].id}/remind`);
    expect(manual.json.status).toBe("sent");
  });

  it("marking PMS 1 done makes PMS 2 the next PMS", async () => {
    const visits = await ctx.lead.call<Any>("GET", `/pms?filter=due&equipment=${base.equipmentId}`);
    const first = visits.json.find((v: Any) => v.number === 1);
    const done = await ctx.engineer.call("POST", `/pms/${first.id}/done`, { doneOn: today, serviceEngineerName: "Ram Field", remarks: "OK" });
    expect(done.status).toBe(200);
    const d = await ctx.engineer.call<Any>("GET", `/equipment/${base.equipmentId}`);
    expect(d.json.nextPms.number).toBe(2);
    expect(d.json.lastPms.doneOn).toBe(today);
  });

  it("ending coverage early leaves no upcoming PMS", async () => {
    const r = await ctx.lead.call("POST", `/coverage/${coverageId}/end`, { endedOn: addDays(today, -1) });
    expect(r.status).toBe(200);
    const d = await ctx.engineer.call<Any>("GET", `/equipment/${base.equipmentId}`);
    expect(d.json.coverage.current).toBeNull();
    expect(d.json.nextPms).toBeNull();
    const visits = await ctx.lead.call<Any>("GET", `/pms?filter=due&equipment=${base.equipmentId}`);
    expect(visits.json).toHaveLength(0);
  });
});

describe("breakdowns and daily emails (F11)", () => {
  let bdId = "";

  it("records a breakdown and the equipment becomes Breakdown", async () => {
    const r = await ctx.engineer.call<Any>("POST", "/breakdowns", {
      equipmentId: base.equipmentId,
      problem: "Alarm sounds, no ventilation",
      reportedByName: "Sister Gita",
      reportedAt: Date.now() - 60_000,
    });
    expect(r.status).toBe(201);
    expect(r.json.numberText).toBe("BD-0001");
    bdId = r.json.id;
    const d = await ctx.engineer.call<Any>("GET", `/equipment/${base.equipmentId}`);
    expect(d.json.equipment.status).toBe("breakdown");
  });

  it("default recipients: service department emails and designated service engineers", async () => {
    const r = await ctx.engineer.call<Any>("GET", `/breakdowns/${bdId}/recipients/default`);
    expect(r.json.defaults.map((x: Obj) => x.email).sort()).toEqual(["ram@shrestha.test", "service@shrestha.test"]);
    expect(r.json.preview.subject).toContain("needs service");
  });

  it("first request sends once; Send now at most once an hour", async () => {
    const defaults = await ctx.engineer.call<Any>("GET", `/breakdowns/${bdId}/recipients/default`);
    const before = ctx.sent.length;
    const r = await ctx.engineer.call<Any>("POST", `/breakdowns/${bdId}/ask-provider`, { recipients: defaults.json.defaults });
    expect(r.json.status).toBe("sent");
    expect(ctx.sent.length).toBe(before + 1);
    const again = await ctx.engineer.call("POST", `/breakdowns/${bdId}/ask-provider`, { recipients: defaults.json.defaults });
    expect(again.status).toBe(400);
    const tooSoon = await ctx.engineer.call("POST", `/breakdowns/${bdId}/send-now`);
    expect(tooSoon.status).toBe(400);
    await ctx.db.update(breakdowns).set({ lastEmailAt: Date.now() - 2 * 3_600_000 }).where(eq(breakdowns.id, bdId));
    const now = await ctx.engineer.call<Any>("POST", `/breakdowns/${bdId}/send-now`);
    expect(now.json.status).toBe("sent");
    expect(ctx.sent[ctx.sent.length - 1]!.subject).toMatch(/^Day \d+:/);
  });

  it("no daily email on the same day; once a day after the daily email time", async () => {
    expect((await sendDueDailyEmails(Date.now())).sent).toBe(0);
    const day2 = addDays(today, 2);
    expect((await sendDueDailyEmails(atNepal(day2, "07:59"))).sent).toBe(0);
    expect((await sendDueDailyEmails(atNepal(day2, "08:00"))).sent).toBe(1);
    expect((await sendDueDailyEmails(atNepal(day2, "12:00"))).sent).toBe(0);
    const last = ctx.sent[ctx.sent.length - 1]!;
    expect(last.subject).toContain("still not working");
    expect(last.text).toContain("has been down for");
  });

  it("pausing stops daily emails; the resume date restarts them", async () => {
    const bad = await ctx.engineer.call("POST", `/breakdowns/${bdId}/pause`, { reason: "other", note: null, resumeOn: null });
    expect(bad.status).toBe(400); // "Other" needs a written reason
    const resumeOn = addDays(today, 4);
    const p = await ctx.engineer.call("POST", `/breakdowns/${bdId}/pause`, { reason: "spare_parts", note: "Valve ordered", resumeOn });
    expect(p.status).toBe(200);
    expect((await sendDueDailyEmails(atNepal(addDays(today, 3), "08:30"))).sent).toBe(0);
    const paused = await ctx.engineer.call<Any>("GET", "/breakdowns?paused=1");
    expect(paused.json).toHaveLength(1);
    expect(await autoResume(atNepal(resumeOn, "08:05"))).toBe(1);
    expect((await sendDueDailyEmails(atNepal(resumeOn, "08:10"))).sent).toBe(1);
  });

  it("manual pause and resume are recorded", async () => {
    await ctx.engineer.call("POST", `/breakdowns/${bdId}/pause`, { reason: "quotation", note: null, resumeOn: null });
    const r = await ctx.engineer.call("POST", `/breakdowns/${bdId}/resume`);
    expect(r.status).toBe(200);
    const d = await ctx.engineer.call<Any>("GET", `/breakdowns/${bdId}`);
    expect(d.json.pauses).toHaveLength(2);
    expect(d.json.currentPause).toBeNull();
  });

  it("daily email due rule (unit)", () => {
    const now = atNepal(addDays(today, 1), "09:00");
    const b = { status: "with_provider" as const, lastEmailOn: today, sentToProviderAt: now - 13 * 3_600_000 };
    expect(isDailyEmailDue(b, { paused: false, now, dailyEmailTime: "08:00" })).toBe(true);
    expect(isDailyEmailDue(b, { paused: true, now, dailyEmailTime: "08:00" })).toBe(false);
    expect(isDailyEmailDue({ ...b, sentToProviderAt: now - 11 * 3_600_000 }, { paused: false, now, dailyEmailTime: "08:00" })).toBe(false);
    expect(isDailyEmailDue(b, { paused: false, now, dailyEmailTime: "10:00" })).toBe(false);
    expect(isDailyEmailDue({ ...b, status: "fixed" }, { paused: false, now, dailyEmailTime: "08:00" })).toBe(false);
  });

  it("an Engineer cannot close as cannot be repaired", async () => {
    const r = await ctx.engineer.call("POST", `/breakdowns/${bdId}/close`, { outcome: "not_repairable", reason: "Board burnt" });
    expect(r.status).toBe(403);
  });

  it("fixing stops daily emails and sends the closed notice; equipment returns to Working", async () => {
    const before = ctx.sent.length;
    const r = await ctx.engineer.call<Any>("POST", `/breakdowns/${bdId}/close`, {
      outcome: "fixed",
      fixedBy: "service_provider",
      serviceEngineerName: "Ram Field",
      workDone: "Replaced exhalation valve",
      partsReplaced: "Exhalation valve",
    });
    expect(r.status).toBe(200);
    expect(ctx.sent.length).toBe(before + 1);
    expect(ctx.sent[ctx.sent.length - 1]!.subject).toContain("Working again");
    expect((await sendDueDailyEmails(atNepal(addDays(today, 9), "08:30"))).sent).toBe(0);
    const d = await ctx.engineer.call<Any>("GET", `/equipment/${base.equipmentId}`);
    expect(d.json.equipment.status).toBe("working");
    const h = await ctx.engineer.call<Any>("GET", `/equipment/${base.equipmentId}/history`);
    expect(h.json.some((e: Any) => String(e.title).startsWith("Breakdown BD-0001"))).toBe(true);
  });

  it("cannot be repaired makes the equipment Out of service (Lead)", async () => {
    const r = await ctx.engineer.call<Any>("POST", "/breakdowns", {
      equipmentId: base.equipmentId,
      problem: "No power",
      reportedByName: "Ward staff",
      reportedAt: Date.now() - 1000,
    });
    const c = await ctx.lead.call("POST", `/breakdowns/${r.json.id}/close`, { outcome: "not_repairable", reason: "Board burnt" });
    expect(c.status).toBe(200);
    const d = await ctx.engineer.call<Any>("GET", `/equipment/${base.equipmentId}`);
    expect(d.json.equipment.status).toBe("out_of_service");
  });

  it("a failed email is logged and can be retried", async () => {
    // New equipment so this breakdown is independent.
    const e = await ctx.lead.call<Any>("POST", "/equipment", {
      modelId: base.modelId,
      serialNumber: "RETRY-1",
      hospitalTag: null,
      serviceProviderId: base.providerId,
      homeDepartmentId: base.departmentId,
      installedOn: "2024-03-15",
      notes: null,
      serviceEngineerIds: [],
      lastPmsDoneOn: null,
    });
    const b = await ctx.engineer.call<Any>("POST", "/breakdowns", { equipmentId: e.json.id, problem: "x", reportedByName: "y", reportedAt: Date.now() - 1000 });
    ctx.failNextEmail();
    const r = await ctx.engineer.call<Any>("POST", `/breakdowns/${b.json.id}/ask-provider`, {
      recipients: [{ source: "extra", sourceId: null, email: "someone@shrestha.test", name: null }],
    });
    expect(r.json.status).toBe("failed");
    const d = await ctx.engineer.call<Any>("GET", `/breakdowns/${b.json.id}`);
    expect(d.json.emails[0].status).toBe("failed");
  });
});

describe("email redirect", () => {
  it("while EMAIL_REDIRECT_TO is set, everything goes only there", () => {
    setEnvForTests({ EMAIL_REDIRECT_TO: "owner@test.example" });
    const out = applyRedirect({ to: ["service@shrestha.test"], cc: ["head@hospital.test"], subject: "S", text: "Body", html: "<p>Body</p>" });
    expect(out.to).toEqual(["owner@test.example"]);
    expect(out.cc).toBeUndefined();
    expect(out.text.startsWith("Test copy. Would have gone to: service@shrestha.test")).toBe(true);
    setEnvForTests({ EMAIL_REDIRECT_TO: undefined });
  });
});

describe("CSV import (F14)", () => {
  it("previews problems and saves nothing until confirmed", async () => {
    const tpl = importTemplate();
    const bad = await ctx.lead.call<Any>("POST", "/equipment/import/preview", { csv: tpl });
    expect(bad.json.bad).toBe(1); // template sample: provider and department exist? department ICU yes, serial exists
    const csv = tpl.split("\r\n")[0] + "\r\nMonitor,Mindray,uMEC12,MR-001,,Shrestha Medical,ICU,2023-01-01,,\r\nMonitor,Mindray,uMEC12,MR-002,,Shrestha Medical,Nowhere,2023-01-01,,\r\n";
    const p = await ctx.lead.call<Any>("POST", "/equipment/import/preview", { csv });
    expect(p.json.ok).toBe(1);
    expect(p.json.rows[1].problems[0]).toContain("Nowhere");
    expect((await ctx.lead.call("POST", "/equipment/import", { csv })).status).toBe(400);
    const good = csv.split("\r\n").slice(0, 2).join("\r\n");
    const r = await ctx.lead.call<Any>("POST", "/equipment/import", { csv: good });
    expect(r.json.count).toBe(1);
    expect((await ctx.engineer.call("POST", "/equipment/import/preview", { csv })).status).toBe(403);
  });
});
