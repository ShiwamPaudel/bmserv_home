import { z } from "zod";
import { optionalText, text } from "./common";

export const departmentSchema = z.object({
  name: text(100),
  shortName: optionalText(20),
});

export const departmentUpdateSchema = departmentSchema.partial().extend({ isActive: z.boolean().optional() });
