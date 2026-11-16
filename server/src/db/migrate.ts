import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { migrate } from "drizzle-orm/libsql/migrator";
import type { DB } from "./client";

/** Finds the migrations folder whether running from src (tsx) or the bundled dist. */
export function migrationsFolder(): string {
  const candidates = ["./migrations", "../src/db/migrations", "./db/migrations"].map((p) =>
    fileURLToPath(new URL(p, import.meta.url)),
  );
  const found = candidates.find((p) => existsSync(p));
  if (!found) throw new Error("Migrations folder not found");
  return found;
}

export async function runMigrations(db: DB, folder = migrationsFolder()): Promise<void> {
  await migrate(db, { migrationsFolder: folder });
}
