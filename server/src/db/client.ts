import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import { env } from "../env";
import * as schema from "./schema";

export type DB = LibSQLDatabase<typeof schema>;
/** A database or an open transaction: services accept either. */
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
export type Conn = DB | Tx;

let db: DB | null = null;
let client: Client | null = null;

/** The live Turso database. */
export function getDb(): DB {
  if (!db) {
    const e = env();
    client = createClient({ url: e.TURSO_DATABASE_URL, authToken: e.TURSO_AUTH_TOKEN });
    db = drizzle(client, { schema });
  }
  return db;
}

export function getClient(): Client {
  getDb();
  return client as Client;
}

/** Tests only: use an in-memory libSQL database. */
export function useDb(next: DB, nextClient: Client): void {
  db = next;
  client = nextClient;
}

export function createDb(c: Client): DB {
  return drizzle(c, { schema });
}

export { schema };
