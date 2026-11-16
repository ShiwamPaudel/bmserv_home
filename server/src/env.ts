import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { z } from "zod";

/** Reads `.env.local` then `.env` from the project root (first found walking up). Existing values win. */
export function loadEnvFiles(start = process.cwd()): void {
  let dir = resolve(start);
  for (let i = 0; i < 4; i++) {
    for (const name of [".env.local", ".env"]) {
      const file = join(dir, name);
      if (existsSync(file)) applyEnvText(readFileSync(file, "utf8"));
    }
    if (existsSync(join(dir, "package.json")) && existsSync(join(dir, "shared"))) return;
    dir = dirname(dir);
  }
}

function applyEnvText(text: string): void {
  for (const raw of text.split(/\r?\n/)) {
    const m = raw.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    const key = m[1] as string;
    let value = (m[2] ?? "").trim();
    const quote = value[0];
    if ((quote === '"' || quote === "'") && value.indexOf(quote, 1) > 0) {
      value = value.slice(1, value.indexOf(quote, 1));
    } else {
      value = value.replace(/\s+#.*$/, "").trim();
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

const required = z.string().trim().min(1);
const optional = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : undefined));

const envSchema = z.object({
  APP_URL: required.transform((v) => v.replace(/\/+$/, "")),
  PORT: z.coerce.number().int().default(3000),
  TURSO_DATABASE_URL: required,
  TURSO_AUTH_TOKEN: optional,
  BETTER_AUTH_SECRET: required,
  BETTER_AUTH_URL: required.transform((v) => v.replace(/\/+$/, "")),
  R2_ACCOUNT_ID: required,
  R2_ACCESS_KEY_ID: required,
  R2_SECRET_ACCESS_KEY: required,
  R2_BUCKET: required,
  RESEND_API_KEY: required,
  MAIL_FROM: required,
  EMAIL_REDIRECT_TO: optional,
  JOB_SECRET: required,
  CRON_SECRET: optional,
  ENABLE_SCHEDULER: optional.transform((v) => v !== "false"),
  // Web Push (PWA notifications). Optional: without them notifications stay off.
  VAPID_PUBLIC_KEY: optional,
  VAPID_PRIVATE_KEY: optional,
  VAPID_SUBJECT: optional,
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

/** Validated environment. Throws naming every missing value. */
export function env(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const names = [...new Set(parsed.error.issues.map((i) => String(i.path[0])))];
    throw new Error(`Missing or empty environment values: ${names.join(", ")}. See .env.example.`);
  }
  cached = parsed.data;
  return cached;
}

/** For tests only. */
export function setEnvForTests(values: Partial<Env>): void {
  cached = {
    APP_URL: "http://localhost:5173",
    PORT: 3000,
    TURSO_DATABASE_URL: ":memory:",
    TURSO_AUTH_TOKEN: undefined,
    BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret-123",
    BETTER_AUTH_URL: "http://localhost:5173",
    R2_ACCOUNT_ID: "test",
    R2_ACCESS_KEY_ID: "test",
    R2_SECRET_ACCESS_KEY: "test",
    R2_BUCKET: "test",
    RESEND_API_KEY: "test",
    MAIL_FROM: "Test <test@example.com>",
    EMAIL_REDIRECT_TO: undefined,
    JOB_SECRET: "job-secret",
    CRON_SECRET: undefined,
    ENABLE_SCHEDULER: false,
    VAPID_PUBLIC_KEY: undefined,
    VAPID_PRIVATE_KEY: undefined,
    VAPID_SUBJECT: undefined,
    ...values,
  };
}
