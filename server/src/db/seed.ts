// npm run db:seed — creates the hospital settings (ABC Hospital) and the first Admin. Safe to run twice.
import { eq } from "drizzle-orm";
import { createPersonSchema } from "@bmserv/shared/schemas/team";
import { loadEnvFiles } from "../env";
import { getDb } from "./client";
import { settings, user } from "./schema";
import { createPersonUnchecked } from "../services/team";
import { getAuth } from "../auth";

export async function seedSettings(defaults: { email: string; phone: string }): Promise<boolean> {
  const db = getDb();
  const existing = await db.select({ id: settings.id }).from(settings).where(eq(settings.id, 1));
  if (existing[0]) return false;
  await db.insert(settings).values({
    id: 1,
    hospitalName: "ABC Hospital",
    hospitalAddress: null,
    departmentName: "Biomedical Department",
    departmentEmail: defaults.email,
    departmentPhone: defaults.phone,
    dailyEmailTime: "08:00",
    pmsReminderDays: 3,
    emailCc: [],
  });
  return true;
}

async function main() {
  loadEnvFiles();
  const e = process.env;
  const admin = createPersonSchema.safeParse({
    name: e.SEED_ADMIN_NAME,
    username: e.SEED_ADMIN_USERNAME,
    email: e.SEED_ADMIN_EMAIL,
    phone: e.SEED_ADMIN_PHONE,
    password: e.SEED_ADMIN_PASSWORD,
    role: "admin",
  });
  if (!admin.success) {
    const names = [...new Set(admin.error.issues.map((i) => `SEED_ADMIN_${String(i.path[0]).toUpperCase()}`))];
    console.error(`FAIL  Fill these in .env: ${names.join(", ")} (password at least 8 characters).`);
    process.exit(1);
  }

  const created = await seedSettings({ email: admin.data.email, phone: admin.data.phone });
  console.log(created ? "ok  settings created for ABC Hospital" : "ok  settings already there");

  const db = getDb();
  const found = await db.select({ id: user.id }).from(user).where(eq(user.username, admin.data.username));
  if (found[0] && process.argv.includes("--reset-admin-password")) {
    // Sets the first Admin's password to SEED_ADMIN_PASSWORD again (e.g. after changing it in .env.local).
    const ctx = await getAuth().$context;
    await ctx.internalAdapter.updatePassword(found[0].id, await ctx.password.hash(admin.data.password));
    await db.update(user).set({ banned: false, banReason: null, updatedAt: new Date() }).where(eq(user.id, found[0].id));
    console.log(`ok  Admin ${admin.data.username}: password set from SEED_ADMIN_PASSWORD`);
  } else if (found[0]) {
    console.log(`ok  Admin ${admin.data.username} already there (password unchanged; use npm run db:seed -- --reset-admin-password)`);
  } else {
    await createPersonUnchecked(admin.data, { mustChangePassword: false });
    console.log(`ok  Admin ${admin.data.username} created`);
  }
  process.exit(0);
}

if (process.argv[1] && /seed\.(ts|js)$/.test(process.argv[1])) {
  main().catch((err: unknown) => {
    console.error("FAIL", err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
