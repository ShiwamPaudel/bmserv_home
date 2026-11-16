import { z } from "zod";
import { contactKinds } from "../enums";
import { t } from "../terms";
import { email, optionalEmail, optionalPhone, optionalText, phone, text } from "./common";

export const providerSchema = z.object({
  name: text(150),
  address: optionalText(300),
  companyPhone: optionalPhone(),
  companyEmail: optionalEmail(),
  notes: optionalText(2000),
});
export const providerUpdateSchema = providerSchema.partial().extend({ isActive: z.boolean().optional() });

export const contactSchema = z
  .object({
    kind: z.enum(contactKinds),
    value: z.string().trim().min(1, t.fields.required).max(200),
    label: optionalText(60),
  })
  .superRefine((c, ctx) => {
    if (c.kind === "email" && !z.email().safeParse(c.value.toLowerCase()).success)
      ctx.addIssue({ code: "custom", path: ["value"], message: t.fields.email });
  })
  .transform((c) => (c.kind === "email" ? { ...c, value: c.value.toLowerCase() } : c));

export const contactUpdateSchema = z.object({
  value: z.string().trim().min(1).max(200).optional(),
  label: optionalText(60),
  isActive: z.boolean().optional(),
});

export const serviceEngineerSchema = z.object({
  name: text(100),
  phone: phone(),
  email: email(),
  notes: optionalText(1000),
});

export const serviceEngineerUpdateSchema = serviceEngineerSchema
  .partial()
  .extend({ isActive: z.boolean().optional() });

/**
 * A new service provider needs its service department's phone and email, and one service engineer
 * with name, phone and email (owner, 2026-11-13).
 */
export const providerCreateSchema = providerSchema
  .extend({
    contacts: z.array(contactSchema).max(30).default([]),
    engineer: serviceEngineerSchema.omit({ notes: true }),
  })
  .superRefine((p, ctx) => {
    const firstPhone = p.contacts.findIndex((c) => c.kind === "phone");
    const firstEmail = p.contacts.findIndex((c) => c.kind === "email");
    if (firstPhone < 0) ctx.addIssue({ code: "custom", path: ["servicePhone"], message: t.providers.servicePhoneNeeded });
    if (firstEmail < 0) ctx.addIssue({ code: "custom", path: ["serviceEmail"], message: t.providers.serviceEmailNeeded });
    p.contacts.forEach((c, i) => {
      if (c.kind === "phone" && c.value.replace(/\D/g, "").length < 6)
        ctx.addIssue({ code: "custom", path: ["contacts", i, "value"], message: t.fields.phone });
    });
  });
export type ProviderCreateInput = z.infer<typeof providerCreateSchema>;
