import { timingSafeEqual } from "node:crypto";
import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";
import { getAuth } from "./auth";
import { env } from "./env";
import { getClient } from "./db/client";
import { tick } from "./jobs/tick";
import { AppError } from "./lib/errors";
import { requireSession, staffGate, type AppEnv } from "./lib/http";
import { breakdownRoutes } from "./routes/breakdowns";
import { core } from "./routes/core";
import { register } from "./routes/register";
import { reportRoutes } from "./routes/report";

function sameSecret(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function createApp() {
  const app = new Hono<AppEnv>();
  app.use("*", secureHeaders({ crossOriginResourcePolicy: false, crossOriginOpenerPolicy: false }));

  app.get("/health", async (c) => {
    await getClient().execute("select 1");
    return c.json({ ok: true });
  });

  // Sign-in (Better Auth). Public sign-up is off.
  app.on(["GET", "POST"], "/api/auth/*", (c) => getAuth().handler(c.req.raw));

  // Scheduled work: Vercel Cron sends GET with CRON_SECRET; other crons POST with JOB_SECRET.
  app.on(["GET", "POST"], "/api/jobs/tick", async (c) => {
    const header = c.req.header("authorization") ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    const e = env();
    const ok = !!token && (sameSecret(token, e.JOB_SECRET) || (!!e.CRON_SECRET && sameSecret(token, e.CRON_SECRET)));
    if (!ok) return c.json({ error: { code: "unauthorized", message: "Not allowed." } }, 401);
    return c.json(await tick());
  });

  const api = new Hono<AppEnv>();
  api.use("*", requireSession);
  api.use("*", staffGate);
  api.route("/", reportRoutes);
  api.route("/", core);
  api.route("/", register);
  api.route("/breakdowns", breakdownRoutes);
  app.route("/api", api);

  app.all("/api/*", (c) => c.json({ error: { code: "not_found", message: "This was not found." } }, 404));

  app.onError((err, c) => {
    if (err instanceof AppError) {
      return c.json(
        { error: { code: err.code, message: err.message, ...(err.fields ? { fields: err.fields } : {}), ...(err.extra ?? {}) } },
        err.status,
      );
    }
    // No request bodies, passwords or tokens in logs.
    console.error(`${c.req.method} ${new URL(c.req.url).pathname} failed:`, err instanceof Error ? err.message : err);
    return c.json({ error: { code: "server_error", message: "Something went wrong. Try again, or reload the page." } }, 500);
  });

  return app;
}
