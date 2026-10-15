import { Kysely, PostgresDialect } from "kysely";
import pg from "pg";

import { config } from "../config.ts";
import type { Database } from "./schema.ts";

// Counts (count(*)) arrive as int8. Every count here is far below 2^53.
pg.types.setTypeParser(pg.types.builtins.INT8, (value) => Number(value));

export function createPool(max = config.DATABASE_POOL): pg.Pool {
  return new pg.Pool({
    connectionString: config.DATABASE_URL,
    max,
    application_name: config.DATABASE_APP_NAME,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    // A runaway query must never hold a connection the live sessions need.
    statement_timeout: 15_000,
  });
}

export const pool = createPool();

export const db = new Kysely<Database>({
  dialect: new PostgresDialect({ pool }),
});

export async function closeDatabase(): Promise<void> {
  await db.destroy();
}
