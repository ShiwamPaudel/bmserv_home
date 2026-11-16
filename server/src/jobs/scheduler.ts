import { NEPAL_TZ } from "@bmserv/shared/dates";
import { tick } from "./tick";

/** In-process hourly tick for always-on hosts. Off on Vercel (ENABLE_SCHEDULER=false). */
export async function startScheduler(): Promise<void> {
  const cron = await import("node-cron");
  cron.schedule(
    "5 * * * *",
    () => {
      void tick().then((r) => console.log("tick", JSON.stringify(r)));
    },
    { timezone: NEPAL_TZ },
  );
  console.log("Scheduler on: hourly tick");
}
