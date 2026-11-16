// npm run services:check — verifies Turso, R2 (put/get/delete) and Resend with the values in .env.
import { createClient } from "@libsql/client";
import { env, loadEnvFiles } from "../env";
import { deleteObject, getObjectText, putObject } from "../lib/r2";
import { deliver } from "../emails/send";

loadEnvFiles();

type Result = { name: string; ok: boolean; detail: string };
const results: Result[] = [];

function explain(err: unknown): string {
  const e = err as { name?: string; message?: string; Code?: string; $metadata?: { httpStatusCode?: number } };
  const status = e.$metadata?.httpStatusCode ? ` (HTTP ${e.$metadata.httpStatusCode})` : "";
  return `${e.name ?? "Error"}: ${e.message ?? String(err)}${status}`;
}

async function main() {
  let e;
  try {
    e = env();
  } catch (err) {
    console.error((err as Error).message);
    process.exit(1);
  }

  // Turso
  try {
    const db = createClient({ url: e.TURSO_DATABASE_URL, authToken: e.TURSO_AUTH_TOKEN });
    const r = await db.execute("select 1 as ok");
    results.push({ name: "Turso", ok: r.rows.length === 1, detail: "query ran" });
    db.close();
  } catch (err) {
    results.push({
      name: "Turso",
      ok: false,
      detail: `${explain(err)}. Check TURSO_DATABASE_URL (libsql://…) and TURSO_AUTH_TOKEN.`,
    });
  }

  // R2
  const key = `_checks/services-check-${Date.now()}.txt`;
  try {
    await putObject(key, "BMServ services check", "text/plain");
    const back = await getObjectText(key);
    await deleteObject(key);
    results.push({ name: "R2", ok: back === "BMServ services check", detail: "put, get and delete worked" });
  } catch (err) {
    results.push({
      name: "R2",
      ok: false,
      detail: `${explain(err)}. Check R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET and that the token has Object Read & Write on this bucket.`,
    });
  }

  // Resend
  if (!e.EMAIL_REDIRECT_TO) {
    results.push({ name: "Resend", ok: false, detail: "EMAIL_REDIRECT_TO is empty; set it to your address before testing." });
  } else {
    const r = await deliver({
      to: [e.EMAIL_REDIRECT_TO],
      subject: "BMServ services check",
      text: "This is a test email from BMServ. Resend is working.",
      html: "<p>This is a test email from BMServ. Resend is working.</p>",
    });
    results.push(
      r.ok
        ? { name: "Resend", ok: true, detail: "test email sent to EMAIL_REDIRECT_TO" }
        : {
            name: "Resend",
            ok: false,
            detail: `${r.error}. Check RESEND_API_KEY and MAIL_FROM (domain must be verified in Resend, or use onboarding@resend.dev while testing).`,
          },
    );
  }

  for (const r of results) console.log(`${r.ok ? "ok  " : "FAIL"}  ${r.name.padEnd(7)} ${r.detail}`);
  process.exit(results.every((r) => r.ok) ? 0 : 1);
}

void main();
