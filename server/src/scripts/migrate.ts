// npm run db:migrate — applies new migrations to the live Turso database. Never edits applied ones.
import { loadEnvFiles } from "../env";
import { getDb } from "../db/client";
import { runMigrations } from "../db/migrate";

loadEnvFiles();

runMigrations(getDb())
  .then(() => {
    console.log("ok  migrations applied");
    process.exit(0);
  })
  .catch((err: unknown) => {
    console.error("FAIL", err instanceof Error ? err.message : err);
    process.exit(1);
  });
