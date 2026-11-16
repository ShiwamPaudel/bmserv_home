// Equipment, moves, files, coverage, PMS, import, export, home.
import { Hono } from "hono";
import { z } from "zod";
import { todayNepal } from "@bmserv/shared/dates";
import { coverageEndSchema, coverageSchema, pmsDateSchema, pmsDoneSchema } from "@bmserv/shared/schemas/coverage";
import { designateSchema, equipmentCreateSchema, equipmentUpdateSchema, labelsPrintedSchema, moveSchema } from "@bmserv/shared/schemas/equipment";
import { uploadRequestSchema } from "@bmserv/shared/schemas/files";
import { body, query, requireAction, type AppEnv } from "../lib/http";
import { badRequest, notFound } from "../lib/errors";
import * as coverage from "../services/coverage";
import * as equipment from "../services/equipment";
import { exportList } from "../services/exportCsv";
import * as files from "../services/files";
import { equipmentHistory } from "../services/history";
import { home } from "../services/home";
import { buildReport } from "../services/reports";
import { reportRangeSchema } from "@bmserv/shared/schemas/report";
import { commitImport, previewImport } from "../services/importer";
import * as moves from "../services/moves";
import * as pms from "../services/pms";

export const register = new Hono<AppEnv>();

const csvBody = z.object({ csv: z.string().min(1).max(5_000_000) });

// ---- Equipment ----
register.get("/equipment", async (c) =>
  c.json(
    await equipment.listEquipment({
      q: query(c, "q"),
      departmentId: query(c, "department"),
      status: query(c, "status"),
      coverage: query(c, "coverage"),
      providerId: query(c, "provider"),
      limit: Number(query(c, "limit") ?? 100),
      offset: Number(query(c, "offset") ?? 0),
    }),
  ),
);
register.post("/equipment", requireAction("equipment.edit"), async (c) =>
  c.json(await equipment.createEquipment(c.get("actor"), await body(c, equipmentCreateSchema)), 201),
);
register.get("/equipment/by-qr/:code", async (c) => c.json(await equipment.equipmentIdByQr(c.req.param("code"))));
register.get("/equipment/labels", async (c) => {
  const ids = (query(c, "ids") ?? "").split(",").filter(Boolean).slice(0, 500);
  return c.json(await equipment.labelRows(ids));
});
register.post("/equipment/import/preview", requireAction("equipment.import"), async (c) =>
  c.json(await previewImport((await body(c, csvBody)).csv)),
);
register.post("/equipment/import", requireAction("equipment.import"), async (c) =>
  c.json(await commitImport(c.get("actor"), (await body(c, csvBody)).csv)),
);
register.post("/equipment/labels-printed", requireAction("label.print"), async (c) =>
  c.json(await equipment.markLabelsPrinted(c.get("actor"), (await body(c, labelsPrintedSchema)).ids)),
);
register.get("/equipment/:id", async (c) => c.json(await equipment.getEquipment(c.req.param("id"))));
register.patch("/equipment/:id", async (c) =>
  // Field edits need equipment.edit; out of service needs equipment.outOfService (checked in the service).
  c.json(await equipment.updateEquipment(c.get("actor"), c.req.param("id"), await body(c, equipmentUpdateSchema))),
);
register.get("/equipment/:id/history", async (c) => c.json(await equipmentHistory(c.req.param("id"), todayNepal())));
register.put("/equipment/:id/service-engineers", requireAction("equipment.designate"), async (c) =>
  c.json(await equipment.setDesignatedEngineers(c.get("actor"), c.req.param("id"), (await body(c, designateSchema)).serviceEngineerIds)),
);

// ---- Moves ----
register.post("/equipment/:id/moves", requireAction("move.temporary"), async (c) =>
  c.json(await moves.moveEquipment(c.get("actor"), c.req.param("id"), await body(c, moveSchema)), 201),
);
register.post("/moves/:id/return", requireAction("move.temporary"), async (c) =>
  c.json(await moves.returnEquipment(c.get("actor"), c.req.param("id"))),
);

// ---- Files ----
register.post("/files/upload", requireAction("file.upload"), async (c) =>
  c.json(await files.requestUpload(c.get("actor"), await body(c, uploadRequestSchema)), 201),
);
register.post("/files/:id/ready", requireAction("file.upload"), async (c) =>
  c.json(await files.markReady(c.get("actor"), c.req.param("id"))),
);
register.get("/files/:id/image", async (c) => {
  c.header("Cache-Control", "private, max-age=3000");
  return c.redirect(await files.photoLink(c.req.param("id")), 302);
});
register.get("/files/:id/link", async (c) => c.json(await files.fileLink(c.req.param("id"), query(c, "download") === "1")));
register.post("/files/:id/remove", requireAction("file.remove"), async (c) =>
  c.json(await files.removeFile(c.get("actor"), c.req.param("id"))),
);
register.get("/manuals", async (c) => c.json(await files.searchManuals(query(c, "q"))));

// ---- Coverage ----
register.post("/equipment/:id/coverage", requireAction("coverage.edit"), async (c) =>
  c.json(await coverage.addCoverage(c.get("actor"), c.req.param("id"), await body(c, coverageSchema)), 201),
);
register.patch("/coverage/:id", requireAction("coverage.edit"), async (c) =>
  c.json(await coverage.updateCoverage(c.get("actor"), c.req.param("id"), await body(c, coverageSchema))),
);
register.post("/coverage/:id/end", requireAction("coverage.edit"), async (c) =>
  c.json(await coverage.endCoverageEarly(c.get("actor"), c.req.param("id"), (await body(c, coverageEndSchema)).endedOn)),
);

// ---- PMS ----
register.get("/pms", async (c) => {
  const f = query(c, "filter");
  const filter = f === "overdue" || f === "done" || f === "soon" || f === "upcoming" ? f : "due";
  return c.json(await pms.listPms(filter, { providerId: query(c, "provider"), equipmentId: query(c, "equipment") }));
});
register.patch("/pms/:id", requireAction("pms.editDate"), async (c) =>
  c.json(await pms.changePmsDate(c.get("actor"), c.req.param("id"), (await body(c, pmsDateSchema)).dueOn)),
);
register.post("/pms/:id/done", requireAction("pms.markDone"), async (c) =>
  c.json(await pms.markPmsDone(c.get("actor"), c.req.param("id"), await body(c, pmsDoneSchema))),
);
register.post("/pms/:id/remind", requireAction("pms.remind"), async (c) =>
  c.json(await pms.remindPms(c.get("actor"), c.req.param("id"))),
);

// ---- Home and export ----
register.get("/home", async (c) => c.json(await home(c.get("actor"))));
register.get("/reports", requireAction("view"), async (c) => {
  const range = reportRangeSchema.safeParse({ from: query(c, "from"), to: query(c, "to") });
  if (!range.success) throw badRequest("Choose a start and end date.", { from: "Choose a start and end date." });
  return c.json(await buildReport(range.data.from, range.data.to));
});
register.get("/export/:file", async (c) => {
  const list = c.req.param("file").replace(/\.csv$/, "");
  const out = await exportList(c.get("actor"), list);
  if (!out) throw notFound();
  return c.body(out.csv, 200, {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="${out.name}"`,
  });
});
