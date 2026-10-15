import { sql, type Kysely } from "kysely";

// Sample sessions' answers were stamped with the time the seed ran rather than
// the time of the session, which counted them as answers given today.
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    update responses r
       set created_at = s.started_at + random() * (s.ended_at - s.started_at)
      from live_sessions s
     where r.session_id = s.id
       and s.ended_at is not null
       and s.owner_id in (select id from users where is_sample)
       and r.created_at > s.ended_at
  `.execute(db);
  await sql`
    update responses r
       set updated_at = r.created_at
      from live_sessions s
     where r.session_id = s.id
       and s.owner_id in (select id from users where is_sample)
       and r.updated_at > s.ended_at
  `.execute(db);
}

export async function down(): Promise<void> {}
