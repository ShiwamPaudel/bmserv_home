import { t } from "@bmserv/shared/terms";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields: Record<string, string> = {},
    public extra: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

type Json = Record<string, unknown> | unknown[] | null;

export async function api<T = unknown>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method: init.method ?? "GET",
      credentials: "same-origin",
      headers: init.body !== undefined ? { "content-type": "application/json" } : {},
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    });
  } catch {
    throw new ApiError(0, "offline", t.app.noConnection);
  }
  const text = await res.text();
  let data: Json;
  try {
    data = text ? (JSON.parse(text) as Json) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const err = (data as { error?: Record<string, unknown> } | null)?.error ?? {};
    const { code, message, fields, ...extra } = err as {
      code?: string;
      message?: string;
      fields?: Record<string, string>;
    } & Record<string, unknown>;
    throw new ApiError(res.status, code ?? "error", message ?? t.app.somethingWrong, fields ?? {}, extra);
  }
  return data as T;
}

export const get = <T>(path: string) => api<T>(path);
export const post = <T>(path: string, body: unknown = {}) => api<T>(path, { method: "POST", body });
export const patch = <T>(path: string, body: unknown) => api<T>(path, { method: "PATCH", body });
export const put = <T>(path: string, body: unknown) => api<T>(path, { method: "PUT", body });

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : t.app.somethingWrong;
}
export function fieldErrors(err: unknown): Record<string, string> {
  return err instanceof ApiError ? err.fields : {};
}
