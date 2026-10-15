import { closeDatabase, db } from "../db/database.ts";
import { migrateToLatest } from "../db/migrate.ts";

const applied = await migrateToLatest(db);
console.log(applied.length ? `Applied: ${applied.join(", ")}` : "The database is up to date.");
await closeDatabase();
