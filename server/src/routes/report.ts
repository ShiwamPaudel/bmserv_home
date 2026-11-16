// Report a problem from a label (hospital staff and team), my reports, equipment in my departments (staff), and push notification devices.
import { Hono } from "hono";
import { pushEndpointSchema, pushSubscriptionSchema, reportSchema } from "@bmserv/shared/schemas/report";
import { t } from "@bmserv/shared/terms";
import { body, requireAction, type AppEnv } from "../lib/http";
import { AppError } from "../lib/errors";
import * as push from "../services/push";
import * as report from "../services/report";

export const reportRoutes = new Hono<AppEnv>();

reportRoutes.get("/report/:qrCode", requireAction("breakdown.report"), async (c) =>
  c.json(await report.reportInfo(c.get("actor"), c.req.param("qrCode"))),
);
reportRoutes.post("/report", requireAction("breakdown.report"), async (c) =>
  c.json(await report.reportProblem(c.get("actor"), await body(c, reportSchema)), 201),
);
reportRoutes.get("/my-reports", async (c) => c.json(await report.myReports(c.get("actor"))));
reportRoutes.get("/my-equipment", async (c) => c.json(await report.myEquipment(c.get("actor"))));

// ---- Notifications on this device (everyone) ----
reportRoutes.get("/push", async (c) =>
  c.json({ publicKey: push.pushPublicKey(), devices: await push.subscriptionCount(c.get("actor").id) }),
);
reportRoutes.post("/push/subscriptions", async (c) => {
  if (!push.pushPublicKey()) throw new AppError(503, "push_off", t.notifications.notConfigured);
  const sub = await body(c, pushSubscriptionSchema);
  return c.json(await push.saveSubscription(c.get("actor"), sub, c.req.header("user-agent") ?? null), 201);
});
reportRoutes.post("/push/subscriptions/remove", async (c) =>
  c.json(await push.removeSubscription(c.get("actor"), (await body(c, pushEndpointSchema)).endpoint)),
);
reportRoutes.post("/push/test", async (c) => {
  const sent = await push.sendPush([c.get("actor").id], {
    title: t.notifications.testTitle,
    body: t.notifications.testBody,
    url: "/account",
    tag: "test",
  });
  return c.json({ sent });
});
