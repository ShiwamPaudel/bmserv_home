// Node entry for always-on hosts and local production runs: migrations, API, built web app, scheduler.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { createApp } from "./app";
import { env, loadEnvFiles } from "./env";
import { getDb } from "./db/client";
import { runMigrations } from "./db/migrate";
import { startScheduler } from "./jobs/scheduler";

loadEnvFiles();

async function main() {
  const e = env(); // refuses to start, naming any missing value
  console.log("BMServ starting: applying migrations to Turso…");
  await runMigrations(getDb());
  console.log("BMServ starting: migrations done");
  const app = createApp();

  const webDist = [resolve(process.cwd(), "web/dist"), resolve(process.cwd(), "../web/dist")].find((p) => existsSync(p));
  if (webDist) {
    const indexHtml = readFileSync(resolve(webDist, "index.html"), "utf8");
    app.use("/*", serveStatic({ root: webDist }));
    app.get("*", (c) => c.html(indexHtml));
  }

  const server = serve({ fetch: app.fetch, port: e.PORT }, (info) => console.log(`BMServ listening on ${info.port}`));
  server.on("error", (err: NodeJS.ErrnoException) => {
    console.error(
      err.code === "EADDRINUSE"
        ? `Port ${e.PORT} is already in use. Stop the other BMServ (or whatever uses it) and start again.`
        : err.message,
    );
    process.exit(1);
  });
  if (e.ENABLE_SCHEDULER) await startScheduler();
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
