import { z } from "zod";
import { isAdDate } from "../dates";
import { t } from "../terms";

const trimmed = () => z.string().trim();

export const text = (max = 200) => trimmed().min(1, t.fields.required).max(max, t.fields.tooLong);

export const optionalText = (max = 2000) =>
  trimmed()
    .max(max, t.fields.tooLong)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

export const email = () => trimmed().toLowerCase().pipe(z.email(t.fields.email));

export const optionalEmail = () =>
  trimmed()
    .toLowerCase()
    .optional()
    .nullable()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || z.email().safeParse(v).success, t.fields.email);

/** Stored as "+977 9812345678" (country code, space, number). At least 6 digits. */
export const phone = () =>
  trimmed()
    .max(40, t.fields.tooLong)
    .refine((v) => v.replace(/D/g, "").length >= 6, t.fields.phone);

export const optionalPhone = () =>
  trimmed()
    .max(40, t.fields.tooLong)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

export const adDate = () => trimmed().refine(isAdDate, t.fields.date);

export const optionalAdDate = () =>
  trimmed()
    .optional()
    .nullable()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || isAdDate(v), t.fields.date);

export const id = () => trimmed().min(1, t.fields.choose).max(40);

export const password = () => z.string().min(8, t.account.newPasswordHelp).max(128, t.fields.tooLong);
