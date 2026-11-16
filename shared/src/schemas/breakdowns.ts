import { z } from "zod";
import { fixedByOptions, pauseReasons, recipientSources } from "../enums";
import { t } from "../terms";
import { email, id, optionalAdDate, optionalText, text } from "./common";

export const breakdownSchema = z.object({
  equipmentId: id(),
  problem: text(2000),
  reportedByName: text(100),
  reportedAt: z.number().int().positive(),
});

export const noteSchema = z.object({ note: text(4000) });

export const recipientSchema = z.object({
  source: z.enum(recipientSources),
  sourceId: z.string().nullable(),
  email: email(),
  name: optionalText(100),
});
export type RecipientInput = z.infer<typeof recipientSchema>;

export const recipientsSchema = z.object({ recipients: z.array(recipientSchema).max(30) });

export const pauseSchema = z
  .object({
    reason: z.enum(pauseReasons),
    note: optionalText(500),
    resumeOn: optionalAdDate(),
  })
  .refine((p) => p.reason !== "other" || !!p.note, { path: ["note"], message: t.fields.required });
export type PauseInput = z.infer<typeof pauseSchema>;

export const closeSchema = z.discriminatedUnion("outcome", [
  z.object({
    outcome: z.literal("fixed"),
    fixedBy: z.enum(fixedByOptions),
    serviceEngineerName: optionalText(100),
    workDone: text(4000),
    partsReplaced: optionalText(2000),
  }),
  z.object({
    outcome: z.literal("not_repairable"),
    reason: text(2000),
  }),
]);
export type CloseInput = z.infer<typeof closeSchema>;

export const assignSchema = z.object({ userId: id() });
