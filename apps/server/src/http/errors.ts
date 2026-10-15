import type { ZodType } from "zod";

export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields: Record<string, string> | undefined;

  constructor(status: number, code: string, message: string, fields?: Record<string, string>) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

export const notFound = (what = "That page") => new HttpError(404, "not_found", `${what} could not be found.`);
export const forbidden = () => new HttpError(403, "forbidden", "You do not have access to this.");
export const unauthorised = () => new HttpError(401, "signed_out", "Please sign in to continue.");
export const tooMany = () =>
  new HttpError(429, "rate_limited", "Too many attempts. Please wait a few minutes and try again.");

/** Validates a request body; field messages are written for the person filling in the form. */
export function parse<T>(schema: ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input ?? {});
  if (result.success) return result.data;
  const fields: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const path = issue.path.join(".");
    if (path && !fields[path]) fields[path] = issue.message;
  }
  throw new HttpError(422, "invalid", "Please check the highlighted fields.", fields);
}
