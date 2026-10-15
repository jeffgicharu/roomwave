import type { Kysely } from "kysely";
import { Migrator, type Migration, type MigrationProvider } from "kysely/migration";

import * as initial from "./migrations/0001_initial.ts";
import * as sampleRequests from "./migrations/0002_sample_requests.ts";
import * as sampleAnswerTimes from "./migrations/0003_sample_answer_times.ts";

// Listed by hand rather than read from a folder, so the bundled server carries them.
const migrations: Record<string, Migration> = {
  "0001_initial": initial,
  "0002_sample_requests": sampleRequests,
  "0003_sample_answer_times": sampleAnswerTimes,
};

const provider: MigrationProvider = {
  getMigrations: async () => migrations,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the migrator works on any schema
export async function migrateToLatest(db: Kysely<any>): Promise<string[]> {
  const migrator = new Migrator({ db, provider, migrationTableName: "schema_migrations" });
  const { error, results } = await migrator.migrateToLatest();
  const applied = (results ?? [])
    .filter((result) => result.status === "Success")
    .map((result) => result.migrationName);
  const failed = (results ?? []).find((result) => result.status === "Error");
  if (error || failed) {
    throw new Error(`Migration ${failed?.migrationName ?? ""} failed: ${String(error)}`);
  }
  return applied;
}
