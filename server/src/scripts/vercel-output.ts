// npm run vercel:output — writes .vercel/output (Build Output API v3): static web app, one API function,
// routes with SPA fallback, and the daily cron (08:00 Nepal time = 02:15 UTC).
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const out = resolve(root, ".vercel/output");
const webDist = resolve(root, "web/dist");

async function main() {
  if (!existsSync(webDist)) throw new Error("web/dist is missing. Run npm run build -w web first.");
  rmSync(out, { recursive: true, force: true });
  mkdirSync(resolve(out, "static"), { recursive: true });
  cpSync(webDist, resolve(out, "static"), { recursive: true });

  const fn = resolve(out, "functions/api.func");
  mkdirSync(fn, { recursive: true });
  await build({
    entryPoints: [resolve(root, "server/src/vercel.ts")],
    bundle: true,
    platform: "node",
    target: "node22",
    format: "esm",
    outfile: resolve(fn, "index.mjs"),
    tsconfig: resolve(root, "server/tsconfig.json"),
    // Remote Turso only on Vercel: the web client needs no native binary.
    alias: { "@libsql/client": "@libsql/client/web" },
    banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
    logLevel: "warning",
  });
  writeFileSync(
    resolve(fn, ".vc-config.json"),
    JSON.stringify({ runtime: "nodejs22.x", handler: "index.mjs", launcherType: "Nodejs", shouldAddHelpers: false, maxDuration: 60 }, null, 2),
  );

  writeFileSync(
    resolve(out, "config.json"),
    JSON.stringify(
      {
        version: 3,
        routes: [
          { src: "^/(api/.*|health)$", dest: "/api" },
          { src: "^/sw\\.js$", headers: { "cache-control": "no-cache" }, continue: true },
          { src: "^/assets/(.*)$", headers: { "cache-control": "public, max-age=31536000, immutable" }, continue: true },
          { handle: "filesystem" },
          { src: "/(.*)", dest: "/index.html" },
        ],
        crons: [{ path: "/api/jobs/tick", schedule: "15 2 * * *" }],
      },
      null,
      2,
    ),
  );
  console.log(`ok  ${out}`);
}

main().catch((err: unknown) => {
  console.error("FAIL", err instanceof Error ? err.message : err);
  process.exit(1);
});
