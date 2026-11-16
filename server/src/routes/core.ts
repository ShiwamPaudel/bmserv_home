// Me, team, settings, departments, service providers, models.
import { Hono } from "hono";
import { departmentSchema, departmentUpdateSchema } from "@bmserv/shared/schemas/departments";
import { modelSchema } from "@bmserv/shared/schemas/equipment";
import {
  contactSchema,
  contactUpdateSchema,
  providerCreateSchema,
  providerUpdateSchema,
  serviceEngineerSchema,
  serviceEngineerUpdateSchema,
} from "@bmserv/shared/schemas/providers";
import { settingsUpdateSchema } from "@bmserv/shared/schemas/settings";
import { changePasswordSchema, createPersonSchema, resetPasswordSchema, updatePersonSchema } from "@bmserv/shared/schemas/team";
import { env } from "../env";
import { body, query, requireAction, type AppEnv } from "../lib/http";
import * as departments from "../services/departments";
import * as models from "../services/models";
import * as providers from "../services/providers";
import { getSettings, updateSettings } from "../services/settings";
import * as team from "../services/team";
import { pushPublicKey } from "../services/push";

export const core = new Hono<AppEnv>();

// ---- Me ----
core.get("/me", async (c) => {
  const s = await getSettings();
  return c.json({
    user: c.get("actor"),
    hospital: {
      name: s.hospitalName,
      departmentName: s.departmentName,
      departmentPhone: s.departmentPhone,
      dateDisplay: s.dateDisplay,
      countryCode: s.countryCode,
      logoFileId: s.logoFileId,
      whatsappButtons: s.whatsappButtons,
      staffReports: s.staffReports,
    },
    pushPublicKey: pushPublicKey(),
    emailRedirectTo: env().EMAIL_REDIRECT_TO ?? null,
    appUrl: env().APP_URL,
  });
});
core.post("/me/password", async (c) => {
  const input = await body(c, changePasswordSchema);
  await team.changeOwnPassword(c.get("actor"), input.currentPassword, input.newPassword);
  return c.json({ ok: true });
});
core.patch("/me", async (c) => {
  const input = await body(c, updatePersonSchema.pick({ name: true, phone: true, email: true }));
  return c.json(await team.updatePerson(c.get("actor"), c.get("actor").id, input));
});

// ---- Team (Admin and Lead) ----
core.get("/team", async (c) => c.json(await team.listTeam()));
core.post("/team", requireAction("team.manageEngineers"), async (c) =>
  c.json(await team.createPerson(c.get("actor"), await body(c, createPersonSchema)), 201),
);
core.patch("/team/:id", requireAction("team.manageEngineers"), async (c) =>
  c.json(await team.updatePerson(c.get("actor"), c.req.param("id"), await body(c, updatePersonSchema))),
);
core.post("/team/:id/reset-password", requireAction("team.manageEngineers"), async (c) => {
  const input = await body(c, resetPasswordSchema);
  await team.resetPassword(c.get("actor"), c.req.param("id"), input.password);
  return c.json({ ok: true });
});

// ---- Settings ----
core.get("/settings", async (c) => c.json(await getSettings()));
core.patch("/settings", requireAction("settings.edit"), async (c) =>
  c.json(await updateSettings(c.get("actor"), await body(c, settingsUpdateSchema))),
);

// ---- Departments ----
core.get("/departments", async (c) => c.json(await departments.listDepartments()));
core.post("/departments", requireAction("department.edit"), async (c) =>
  c.json(await departments.createDepartment(c.get("actor"), await body(c, departmentSchema)), 201),
);
core.get("/departments/:id", async (c) => c.json(await departments.getDepartment(c.req.param("id"))));
core.patch("/departments/:id", requireAction("department.edit"), async (c) =>
  c.json(await departments.updateDepartment(c.get("actor"), c.req.param("id"), await body(c, departmentUpdateSchema))),
);

// ---- Service providers ----
core.get("/service-providers", async (c) => c.json(await providers.listProviders()));
core.post("/service-providers", requireAction("provider.edit"), async (c) =>
  c.json(await providers.createProvider(c.get("actor"), await body(c, providerCreateSchema)), 201),
);
core.get("/service-providers/:id", async (c) => c.json(await providers.getProvider(c.req.param("id"))));
core.patch("/service-providers/:id", requireAction("provider.edit"), async (c) =>
  c.json(await providers.updateProvider(c.get("actor"), c.req.param("id"), await body(c, providerUpdateSchema))),
);
core.post("/service-providers/:id/contacts", requireAction("provider.edit"), async (c) =>
  c.json(await providers.addContact(c.get("actor"), c.req.param("id"), await body(c, contactSchema)), 201),
);
core.patch("/provider-contacts/:id", requireAction("provider.edit"), async (c) =>
  c.json(await providers.updateContact(c.get("actor"), c.req.param("id"), await body(c, contactUpdateSchema))),
);
core.post("/service-providers/:id/engineers", requireAction("serviceEngineer.manage"), async (c) =>
  c.json(await providers.addServiceEngineer(c.get("actor"), c.req.param("id"), await body(c, serviceEngineerSchema)), 201),
);
core.patch("/service-engineers/:id", requireAction("serviceEngineer.manage"), async (c) =>
  c.json(await providers.updateServiceEngineer(c.get("actor"), c.req.param("id"), await body(c, serviceEngineerUpdateSchema))),
);

// ---- Models ----
core.get("/models", async (c) => c.json(await models.listModels(query(c, "q"))));
core.get("/models/:id", async (c) => c.json(await models.getModel(c.req.param("id"))));
core.post("/models", requireAction("model.edit"), async (c) =>
  c.json(await models.createModel(c.get("actor"), await body(c, modelSchema)), 201),
);
core.patch("/models/:id", requireAction("model.edit"), async (c) =>
  c.json(await models.updateModel(c.get("actor"), c.req.param("id"), await body(c, modelSchema.partial()))),
);
