import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTest, type TestCtx } from "./setup";

let ctx: TestCtx;
beforeAll(async () => {
  ctx = await setupTest();
});
afterAll(() => ctx.close());

describe("sign in and team (F1)", () => {
  it("wrong password is refused", async () => {
    const { res } = await ctx.signIn("engineer", "wrong-password");
    expect(res.status).toBe(401);
  });

  it("public sign-up is off", async () => {
    const res = await ctx.app.request("/api/auth/sign-up/email", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:5173", "x-forwarded-for": "10.9.9.9" },
      body: JSON.stringify({ email: "x@y.test", password: "password123", name: "X", username: "intruder" }),
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("every /api route needs a session", async () => {
    const res = await ctx.app.request("/api/equipment");
    expect(res.status).toBe(401);
  });

  it("me returns the signed-in person", async () => {
    const r = await ctx.engineer.call<{ user: { role: string; username: string } }>("GET", "/me");
    expect(r.status).toBe(200);
    expect(r.json.user.role).toBe("engineer");
  });

  it("an Engineer cannot manage the team", async () => {
    const r = await ctx.engineer.call("POST", "/team", {
      name: "New",
      username: "newone",
      phone: "9800000001",
      email: "new@hospital.test",
      role: "engineer",
      password: "password123",
    });
    expect(r.status).toBe(403);
  });

  it("a Lead adds engineers but not leads or admins", async () => {
    const ok = await ctx.lead.call<{ id: string }>("POST", "/team", {
      name: "Sita Engineer",
      username: "sita",
      phone: "9800000002",
      email: "sita@hospital.test",
      role: "engineer",
      password: "temporary1",
    });
    expect(ok.status).toBe(201);
    const no = await ctx.lead.call("POST", "/team", {
      name: "Other Lead",
      username: "lead2",
      phone: "9800000003",
      email: "lead2@hospital.test",
      role: "lead",
      password: "temporary1",
    });
    expect(no.status).toBe(403);
  });

  it("phone is required and usernames are unique", async () => {
    const r = await ctx.admin.call<{ error: { fields: Record<string, string> } }>("POST", "/team", {
      name: "X",
      username: "sita",
      phone: "",
      email: "x@hospital.test",
      role: "engineer",
      password: "temporary1",
    });
    expect(r.status).toBe(400);
    expect(r.json.error.fields.phone).toBeTruthy();
    const dup = await ctx.admin.call("POST", "/team", {
      name: "X",
      username: "sita",
      phone: "9800000009",
      email: "x@hospital.test",
      role: "engineer",
      password: "temporary1",
    });
    expect(dup.status).toBe(409);
  });

  it("new person signs in with the temporary password and must change it", async () => {
    const { res, cookie } = await ctx.signIn("sita", "temporary1");
    expect(res.status).toBe(200);
    const me = await ctx.app.request("/api/me", { headers: { cookie } });
    const body = (await me.json()) as { user: { mustChangePassword: boolean } };
    expect(body.user.mustChangePassword).toBe(true);
  });

  it("a deactivated person is refused and signed out", async () => {
    const team = await ctx.admin.call<{ id: string; username: string }[]>("GET", "/team");
    const sita = team.json.find((p) => p.username === "sita");
    expect(sita).toBeTruthy();
    const { cookie } = await ctx.signIn("sita", "temporary1");
    const off = await ctx.lead.call("PATCH", `/team/${sita?.id}`, { isActive: false });
    expect(off.status).toBe(200);
    const after = await ctx.app.request("/api/me", { headers: { cookie } });
    expect(after.status).toBe(401);
    const again = await ctx.signIn("sita", "temporary1");
    expect(again.res.status).toBe(403);
    const msg = (await again.res.json()) as { message?: string };
    expect(msg.message).toContain("deactivated");
  });

  it("reset password and change own password", async () => {
    const team = await ctx.admin.call<{ id: string; username: string }[]>("GET", "/team");
    const eng = team.json.find((p) => p.username === "engineer");
    const reset = await ctx.lead.call("POST", `/team/${eng?.id}/reset-password`, { password: "newtemp123" });
    expect(reset.status).toBe(200);
    const { cookie } = await ctx.signIn("engineer", "newtemp123");
    const change = await ctx.app.request("/api/me/password", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ currentPassword: "newtemp123", newPassword: "mychosen123" }),
    });
    expect(change.status).toBe(200);
    const wrong = await ctx.app.request("/api/me/password", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ currentPassword: "nope-nope", newPassword: "another123" }),
    });
    expect(wrong.status).toBe(400);
    expect((await ctx.signIn("engineer", "mychosen123")).res.status).toBe(200);
  });

  it("only Admin changes settings; daily email time defaults to 08:00", async () => {
    // (The engineer was signed out by the password reset above.)
    const s = await ctx.lead.call<{ dailyEmailTime: string }>("GET", "/settings");
    expect(s.json.dailyEmailTime).toBe("08:00");
    const input = {
      hospitalName: "ABC Hospital",
      hospitalAddress: "Kathmandu",
      departmentName: "Biomedical Department",
      departmentEmail: "biomed@hospital.test",
      departmentPhone: "01-5555555",
      dailyEmailTime: "08:00",
      pmsReminderDays: 3,
      emailCc: ["head@hospital.test"],
      dateDisplay: "bs",
    };
    expect((await ctx.lead.call("PATCH", "/settings", input)).status).toBe(403);
    expect((await ctx.admin.call("PATCH", "/settings", input)).status).toBe(200);
  });

  it("job route needs the secret", async () => {
    expect((await ctx.app.request("/api/jobs/tick", { method: "POST" })).status).toBe(401);
    const ok = await ctx.app.request("/api/jobs/tick", { method: "POST", headers: { authorization: "Bearer job-secret" } });
    expect(ok.status).toBe(200);
  });
});
