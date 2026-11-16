// The scheduled work. Safe to run any number of times and on more than one instance (dedupe keys).
// On Vercel it runs from a daily cron at 08:00 Nepal time; elsewhere node-cron runs it hourly.
import { autoResume, sendDueDailyEmails } from "../services/breakdowns";
import { processEndedCoverage } from "../services/coverage";
import { cleanupFiles } from "../services/files";
import { sendDuePmsReminders } from "../services/pms";

export async function tick(now = Date.now()) {
  const result: Record<string, unknown> = {};
  const step = async (name: string, fn: () => Promise<unknown>) => {
    try {
      result[name] = await fn();
    } catch (err) {
      result[name] = { error: err instanceof Error ? err.message : "failed" };
      console.error(`tick ${name} failed:`, err instanceof Error ? err.message : err);
    }
  };
  await step("autoResumed", () => autoResume(now));
  await step("dailyEmails", () => sendDueDailyEmails(now));
  await step("pmsReminders", () => sendDuePmsReminders(now));
  await step("coverageEnded", () => processEndedCoverage());
  await step("files", () => cleanupFiles(now));
  return result;
}
