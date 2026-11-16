import { Hono } from "hono";
import { assignSchema, breakdownSchema, closeSchema, noteSchema, pauseSchema, recipientsSchema } from "@bmserv/shared/schemas/breakdowns";
import { body, query, requireAction, type AppEnv } from "../lib/http";
import * as bd from "../services/breakdowns";

export const breakdownRoutes = new Hono<AppEnv>();
const work = requireAction("breakdown.work");

breakdownRoutes.get("/", async (c) =>
  c.json(
    await bd.listBreakdowns(c.get("actor"), {
      status: query(c, "status"),
      mine: query(c, "mine") === "1",
      paused: query(c, "paused") === "1",
      equipmentId: query(c, "equipment"),
    }),
  ),
);
breakdownRoutes.post("/", work, async (c) => c.json(await bd.recordBreakdown(c.get("actor"), await body(c, breakdownSchema)), 201));
breakdownRoutes.get("/:id", async (c) => c.json(await bd.getBreakdown(c.req.param("id"))));
breakdownRoutes.post("/:id/notes", work, async (c) =>
  c.json(await bd.addNote(c.get("actor"), c.req.param("id"), (await body(c, noteSchema)).note), 201),
);
breakdownRoutes.get("/:id/recipients/default", async (c) => c.json(await bd.recipientOptions(c.req.param("id"))));
breakdownRoutes.post("/:id/ask-provider", work, async (c) =>
  c.json(await bd.askProvider(c.get("actor"), c.req.param("id"), (await body(c, recipientsSchema)).recipients)),
);
breakdownRoutes.put("/:id/recipients", work, async (c) =>
  c.json(await bd.updateRecipients(c.get("actor"), c.req.param("id"), (await body(c, recipientsSchema)).recipients)),
);
breakdownRoutes.post("/:id/send-now", work, async (c) => c.json(await bd.sendNow(c.get("actor"), c.req.param("id"))));
breakdownRoutes.post("/:id/pause", work, async (c) =>
  c.json(await bd.pauseDailyEmails(c.get("actor"), c.req.param("id"), await body(c, pauseSchema))),
);
breakdownRoutes.post("/:id/resume", work, async (c) => c.json(await bd.resumeDailyEmails(c.get("actor"), c.req.param("id"))));
breakdownRoutes.post("/:id/close", work, async (c) =>
  // "Cannot be repaired" additionally needs Lead or Admin (checked in the service).
  c.json(await bd.closeBreakdown(c.get("actor"), c.req.param("id"), await body(c, closeSchema))),
);
breakdownRoutes.patch("/:id/assign", work, async (c) =>
  c.json(await bd.assignBreakdown(c.get("actor"), c.req.param("id"), (await body(c, assignSchema)).userId)),
);
