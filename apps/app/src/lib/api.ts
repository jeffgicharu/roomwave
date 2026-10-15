import type { ApiError } from "@roomwave/shared";

export class RequestError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields: Record<string, string>;

  constructor(status: number, body: Partial<ApiError>) {
    super(body.message ?? "Something went wrong. Please try again.");
    this.status = status;
    this.code = body.error ?? "unknown";
    this.fields = body.fields ?? {};
  }
}

/** Calls the Roomwave API. Errors arrive as RequestError with a message fit to show. */
export async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      credentials: "same-origin",
      headers: body !== undefined ? { "content-type": "application/json" } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new RequestError(0, {
      error: "offline",
      message: "We could not reach Roomwave. Check your connection and try again.",
    });
  }
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!response.ok) {
    throw new RequestError(
      response.status,
      (data as Partial<ApiError>) ?? { message: "Something went wrong on our side. Please try again." },
    );
  }
  return data as T;
}

export const get = <T>(path: string) => api<T>("GET", path);
export const post = <T>(path: string, body: unknown = {}) => api<T>("POST", path, body);
export const put = <T>(path: string, body: unknown) => api<T>("PUT", path, body);
export const patch = <T>(path: string, body: unknown) => api<T>("PATCH", path, body);
export const del = <T>(path: string, body?: unknown) => api<T>("DELETE", path, body);
