import { z } from "zod";
import { coverageTypes, pmsUnits } from "../enums";
import { t } from "../terms";
import { adDate, id, optionalText } from "./common";

/** Empty means no PMS under this coverage. */
const pmsEvery = z.number().int(t.fields.number).min(1, t.models.pmsRange).max(999, t.models.pmsRange).nullable();

export const coverageSchema = z
  .object({
    type: z.enum(coverageTypes),
    serviceProviderId: id(),
    startsOn: adDate(),
    endsOn: adDate(),
    pmsEvery: pmsEvery,
    pmsUnit: z.enum(pmsUnits).default("months"),
    contractNo: optionalText(80),
    notes: optionalText(1000),
  })
  .refine((c) => c.endsOn > c.startsOn, { path: ["endsOn"], message: t.coverage.endBeforeStart });
export type CoverageInput = z.infer<typeof coverageSchema>;

export const coverageEndSchema = z.object({ endedOn: adDate() });

export const pmsDateSchema = z.object({ dueOn: adDate() });

export const pmsDoneSchema = z.object({
  doneOn: adDate(),
  serviceEngineerName: optionalText(100),
  remarks: optionalText(2000),
});
