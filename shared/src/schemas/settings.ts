import { z } from "zod";
import { dateDisplays } from "../enums";
import { isCountryCode } from "../phone";
import { t } from "../terms";
import { email, optionalText, phone, text } from "./common";

const days = (min: number, max: number) =>
  z.coerce.number({ error: t.fields.number }).int(t.fields.number).min(min, t.settings.range(min, max)).max(max, t.settings.range(min, max));

export const settingsSchema = z.object({
  // Hospital
  hospitalName: text(150),
  hospitalAddress: optionalText(300),
  departmentName: text(150),
  departmentEmail: email(),
  departmentPhone: phone(),
  // Region
  dateDisplay: z.enum(dateDisplays),
  countryCode: z.string().trim().refine(isCountryCode, t.settings.countryCodeBad),
  // Emails
  dailyEmailTime: z
    .string()
    .trim()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, t.settings.timeBad),
  pmsReminderDays: days(0, 30),
  emailCc: z.array(email()).max(10),
  emailTeamOnReport: z.boolean(),
  // Home alerts
  pmsSoonDays: days(1, 60),
  coverageWarnDays: days(1, 365),
  pausedWarnDays: days(1, 90),
  // Staff reports and notifications
  staffReports: z.boolean(),
  staffReportAssigneeId: z.string().trim().max(40).nullable(),
  pushOnBreakdown: z.boolean(),
  pushOnFixed: z.boolean(),
  whatsappButtons: z.boolean(),
});

/** Settings are saved one tab at a time, so every field is optional on save. */
export const settingsUpdateSchema = settingsSchema.partial();

export type SettingsInput = z.infer<typeof settingsSchema>;
export type SettingsUpdate = z.infer<typeof settingsUpdateSchema>;
