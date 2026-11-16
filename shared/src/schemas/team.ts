import { z } from "zod";
import { roles } from "../enums";
import { email, password, phone, text } from "./common";

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "At least 3 characters.")
  .max(30, "At most 30 characters.")
  .regex(/^[a-z0-9_.]+$/, "Use only letters, numbers, dots and underscores.");

export const createPersonSchema = z.object({
  name: text(100),
  username: usernameSchema,
  phone: phone(),
  email: email(),
  role: z.enum(roles),
  password: password(),
  /** Hospital staff only: the departments whose equipment they see. */
  departmentIds: z.array(z.string().min(1).max(40)).max(100).default([]),
});

export const updatePersonSchema = z.object({
  name: text(100).optional(),
  phone: phone().optional(),
  email: email().optional(),
  role: z.enum(roles).optional(),
  isActive: z.boolean().optional(),
  departmentIds: z.array(z.string().min(1).max(40)).max(100).optional(),
});

export const resetPasswordSchema = z.object({ password: password() });

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: password(),
});

export type CreatePerson = z.infer<typeof createPersonSchema>;
export type UpdatePerson = z.infer<typeof updatePersonSchema>;
