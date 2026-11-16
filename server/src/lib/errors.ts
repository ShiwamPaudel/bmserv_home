import type { ContentfulStatusCode } from "hono/utils/http-status";

/** An error whose message is ready to show on screen. */
export class AppError extends Error {
  constructor(
    public readonly status: ContentfulStatusCode,
    public readonly code: string,
    message: string,
    public readonly fields?: Record<string, string>,
    public readonly extra?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export const notFound = (message = "This was not found. It may have been removed.") =>
  new AppError(404, "not_found", message);
export const forbidden = (message = "You do not have access to this. Ask your Lead or Admin.") =>
  new AppError(403, "forbidden", message);
export const conflict = (message: string, fields?: Record<string, string>, extra?: Record<string, unknown>) =>
  new AppError(409, "conflict", message, fields, extra);
export const badRequest = (message: string, fields?: Record<string, string>) =>
  new AppError(400, "bad_request", message, fields);
