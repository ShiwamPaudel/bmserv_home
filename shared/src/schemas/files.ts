import { z } from "zod";
import { allowedMimeTypes, fileKinds, fileOwnerTypes } from "../enums";
import { id, optionalText, text } from "./common";

export const uploadRequestSchema = z.object({
  ownerType: z.enum(fileOwnerTypes),
  ownerId: id(),
  kind: z.enum(fileKinds),
  title: text(150),
  note: optionalText(150),
  fileName: z.string().trim().min(1).max(200),
  mimeType: z.enum(allowedMimeTypes),
  sizeBytes: z.number().int().positive(),
});
export type UploadRequest = z.infer<typeof uploadRequestSchema>;
