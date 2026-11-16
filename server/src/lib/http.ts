import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import type { z } from "zod";
import type { Role } from "@bmserv/shared/enums";
import { can, type Action } from "@bmserv/shared/permissions";
import { getAuth } from "../auth";
import { AppError, badRequest, forbidden } from "./errors";

export type Actor = {
  id: string;
  name: string;
  username: string;
  email: string;
  phone: string;
  role: Role;
  mustChangePassword: boolean;
};

export type AppEnv = { Variables: { actor: Actor } };

/** Every /api route except sign-in, /health and jobs needs a session. */
export const requireSession = createMiddleware<AppEnv>(async (c, next) => {
  const session = await getAuth().api.getSession({ headers: c.req.raw.headers });
  const u = session?.user as (Record<string, unknown> & { id: string }) | undefined;
  if (!u || u.banned) {
    throw new AppError(401, "unauthorized", "Sign in to continue.");
  }
  c.set("actor", {
    id: u.id,
    name: String(u.name ?? ""),
    username: String(u.displayUsername ?? u.username ?? ""),
    email: String(u.email ?? ""),
    phone: String(u.phone ?? ""),
    role: (u.role as Role) ?? "engineer",
    mustChangePassword: Boolean(u.mustChangePassword),
  });
  await next();
});

/** Hospital staff only report problems (and see model photos): everything else under /api is closed to them. */
const staffPaths = /^\/api\/(me|me\/password|report|report\/[A-Za-z0-9]+|my-reports|my-equipment|push|push\/[a-z/]+|files\/[A-Za-z0-9_-]+\/image)$/;
export const staffGate = createMiddleware<AppEnv>(async (c, next) => {
  if (c.get("actor").role === "staff" && !staffPaths.test(c.req.path)) throw forbidden();
  await next();
});

/** Role check on the server for a write. Hiding a button is not a check. */
export function requireAction(action: Action) {
  return createMiddleware<AppEnv>(async (c, next) => {
    if (!can(c.get("actor").role, action)) throw forbidden();
    await next();
  });
}

export function assertCan(actor: Actor, action: Action): void {
  if (!can(actor.role, action)) throw forbidden();
}

/** Parses and validates a JSON body; field errors come back keyed by field name. */
export async function body<S extends z.ZodType>(c: Context, schema: S): Promise<z.output<S>> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw badRequest("The form could not be read. Reload the page and try again.");
  }
  return validate(schema, raw);
}

export function validate<S extends z.ZodType>(schema: S, raw: unknown): z.output<S> {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.map(String).join(".") || "_";
      fields[key] ??= issue.message;
    }
    throw new AppError(400, "validation", "Check the fields marked.", fields);
  }
  return parsed.data;
}

export function query(c: Context, name: string): string | undefined {
  const v = c.req.query(name);
  return v && v.trim() ? v.trim() : undefined;
}
