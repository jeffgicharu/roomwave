import { sql, type Kysely } from "kysely";

// Contact requests can be samples too, so the staff training account can be
// shown an inbox without anyone's real message in it.
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`alter table contact_requests add column is_sample boolean not null default false`.execute(db);
  // The three requests the seed added before this column existed.
  await sql`
    update contact_requests set is_sample = true
     where (email, organisation) in (
       ('grace.muriuki@gmail.com', 'Shoreline Events'),
       ('daniel.kiplagat@yahoo.com', 'Hillcrest Boys High School'),
       ('akinyi.odera@gmail.com', 'Juniper Credit Cooperative')
     )
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`alter table contact_requests drop column is_sample`.execute(db);
}
