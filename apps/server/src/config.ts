import { readFileSync } from "node:fs";
import { join } from "node:path";

import { z } from "zod";

/** A release carries its commit id in REVISION, beside the server folder. */
function releaseFromFile(): string | undefined {
  try {
    return readFileSync(join(process.cwd(), "..", "REVISION"), "utf8").trim() || undefined;
  } catch {
    return undefined;
  }
}

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  RELEASE: z.string().default(releaseFromFile() ?? "dev"),
  HOST: z.string().default("127.0.0.1"),
  PORT: z.coerce.number().int().default(8300),
  SITE_URL: z.url().default("http://localhost:5173"),
  DATABASE_URL: z.string().min(1),
  DATABASE_POOL: z.coerce.number().int().min(1).max(20).default(6),
  DATABASE_APP_NAME: z.string().default("roomwave"),
  REDIS_URL: z.string().default("redis://127.0.0.1:6379/3"),
  REDIS_PREFIX: z.string().default("roomwave:"),
  APP_SECRET: z.string().min(32),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default("Roomwave <roomwave@jeffgicharu.com>"),
  EMAIL_DAILY_CAP: z.coerce.number().int().min(0).default(10),
  WORKER_HEALTH_PORT: z.coerce.number().int().default(8302),
  MEMORY_LIMIT_MB: z.coerce.number().int().default(220),
  /** Closes each live connection after this long, so the phone reconnects to the current release. */
  SOCKET_MAX_AGE_MINUTES: z.coerce.number().min(1).default(45),
});

export type Config = z.infer<typeof schema>;

function load(): Config {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const names = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
    // Names only: a value may be a secret.
    throw new Error(`Missing or invalid settings: ${names}`);
  }
  return parsed.data;
}

export const config = load();
export const isProduction = config.NODE_ENV === "production";
