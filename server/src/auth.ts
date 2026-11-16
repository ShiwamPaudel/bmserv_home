import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { username } from "better-auth/plugins";
import { eq } from "drizzle-orm";
import { t } from "@bmserv/shared/terms";
import { usernameSchema } from "@bmserv/shared/schemas/team";
import { env } from "./env";
import { getDb, schema, type DB } from "./db/client";

export function createAuth(db: DB) {
  const e = env();
  const trusted = [...new Set([e.APP_URL, e.BETTER_AUTH_URL])];
  return betterAuth({
    appName: "BMServ",
    baseURL: e.BETTER_AUTH_URL,
    basePath: "/api/auth",
    secret: e.BETTER_AUTH_SECRET,
    trustedOrigins: trusted,
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
        rateLimit: schema.rateLimit,
      },
    }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: true, // Admin or Lead creates every account.
      minPasswordLength: 8,
      maxPasswordLength: 128,
    },
    session: {
      expiresIn: 60 * 60 * 24 * 60, // stays signed in on the device: 60 days
      updateAge: 60 * 60 * 24,
    },
    user: {
      additionalFields: {
        role: { type: "string", required: true, defaultValue: "engineer", input: false },
        phone: { type: "string", required: true, defaultValue: "", input: false },
        banned: { type: "boolean", required: false, defaultValue: false, input: false },
        mustChangePassword: { type: "boolean", required: false, defaultValue: false, input: false },
      },
    },
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 100,
      customRules: {
        "/sign-in/username": { window: 60, max: 5 },
        "/sign-in/email": { window: 60, max: 5 },
        "/change-password": { window: 60, max: 5 },
      },
    },
    advanced: {
      // Behind Vercel / proxies the client address comes from these headers.
      ipAddress: { ipAddressHeaders: ["x-forwarded-for", "x-real-ip"] },
    },
    plugins: [
      username({
        minUsernameLength: 3,
        maxUsernameLength: 30,
        usernameValidator: (u) => usernameSchema.safeParse(u).success,
      }),
    ],
    databaseHooks: {
      session: {
        create: {
          // Deactivated people cannot sign in.
          before: async (session) => {
            const rows = await db
              .select({ banned: schema.user.banned })
              .from(schema.user)
              .where(eq(schema.user.id, session.userId));
            if (rows[0]?.banned) throw new APIError("FORBIDDEN", { message: t.signIn.deactivated });
            return { data: session };
          },
        },
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;

let auth: Auth | null = null;
export function getAuth(): Auth {
  auth ??= createAuth(getDb());
  return auth;
}
/** Tests only. */
export function useAuth(next: Auth): void {
  auth = next;
}
