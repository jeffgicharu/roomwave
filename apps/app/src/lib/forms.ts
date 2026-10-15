import type { ZodType } from "zod";

import { RequestError } from "./api.ts";

/** Checks a form against the same schema the server uses; returns one message per field. */
export function check<T>(schema: ZodType<T>, input: unknown): { ok: true; data: T } | { ok: false; errors: Record<string, string> } {
  const result = schema.safeParse(input);
  if (result.success) return { ok: true, data: result.data };
  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const path = issue.path.join(".");
    if (path && !errors[path]) errors[path] = issue.message;
  }
  return { ok: false, errors };
}

/** Field messages from the server, or one message for the whole form. */
export function describe(error: unknown): { errors: Record<string, string>; message: string } {
  if (error instanceof RequestError) {
    const errors = error.fields;
    return { errors, message: Object.keys(errors).length ? "" : error.message };
  }
  return { errors: {}, message: "Something went wrong. Please try again." };
}
