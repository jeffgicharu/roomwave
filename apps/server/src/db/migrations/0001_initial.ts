import { sql, type Kysely } from "kysely";

// Every later release must stay readable by the release before it, because the
// two run side by side for a few minutes during a deploy: add, never rename.

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    create table users (
      id uuid primary key default gen_random_uuid(),
      name text not null,
      email text,
      password_hash text,
      role text not null default 'customer' check (role in ('customer', 'staff')),
      plan text not null default 'free' check (plan in ('free', 'pro', 'organisation')),
      trial_ends_at timestamptz,
      organisation text,
      is_guest boolean not null default false,
      guest_expires_at timestamptz,
      suspended_at timestamptz,
      last_active_at timestamptz,
      is_sample boolean not null default false,
      created_at timestamptz not null default now()
    )
  `.execute(db);
  await sql`create unique index users_email_key on users (lower(email)) where email is not null`.execute(db);
  await sql`create index users_guest_expiry on users (guest_expires_at) where is_guest`.execute(db);

  await sql`
    create table auth_sessions (
      id text primary key,
      user_id uuid not null references users (id) on delete cascade,
      user_agent text,
      created_at timestamptz not null default now(),
      last_seen_at timestamptz not null default now(),
      expires_at timestamptz not null
    )
  `.execute(db);
  await sql`create index auth_sessions_user on auth_sessions (user_id)`.execute(db);

  await sql`
    create table password_resets (
      token_hash text primary key,
      user_id uuid not null references users (id) on delete cascade,
      expires_at timestamptz not null,
      used_at timestamptz,
      created_at timestamptz not null default now()
    )
  `.execute(db);

  await sql`
    create table presentations (
      id uuid primary key default gen_random_uuid(),
      owner_id uuid not null references users (id) on delete cascade,
      title text not null,
      theme text not null,
      slides jsonb not null,
      version integer not null default 1,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `.execute(db);
  await sql`create index presentations_owner on presentations (owner_id, updated_at desc)`.execute(db);

  await sql`
    create table live_sessions (
      id uuid primary key default gen_random_uuid(),
      presentation_id uuid not null references presentations (id) on delete cascade,
      owner_id uuid not null references users (id) on delete cascade,
      code text not null,
      title text not null,
      theme text not null,
      slides jsonb not null,
      slide_states jsonb not null default '{}',
      slide_index integer not null default 0,
      remote_token text not null,
      participant_limit integer not null,
      started_at timestamptz not null default now(),
      ended_at timestamptz,
      last_activity_at timestamptz not null default now()
    )
  `.execute(db);
  // A code belongs to one running session at a time, and a presentation runs once at a time.
  await sql`create unique index live_sessions_open_code on live_sessions (code) where ended_at is null`.execute(db);
  await sql`create unique index live_sessions_open_presentation on live_sessions (presentation_id) where ended_at is null`.execute(db);
  await sql`create index live_sessions_presentation on live_sessions (presentation_id, started_at desc)`.execute(db);
  await sql`create unique index live_sessions_remote on live_sessions (remote_token)`.execute(db);

  await sql`
    create table participants (
      id uuid primary key default gen_random_uuid(),
      session_id uuid not null references live_sessions (id) on delete cascade,
      token_hash text not null,
      name text,
      joined_at timestamptz not null default now(),
      unique (session_id, token_hash)
    )
  `.execute(db);

  await sql`
    create table responses (
      id bigserial primary key,
      session_id uuid not null references live_sessions (id) on delete cascade,
      slide_id text not null,
      participant_id uuid not null references participants (id) on delete cascade,
      kind text not null check (kind in ('poll', 'quiz', 'scale', 'wordcloud')),
      option_ids text[],
      option_id text,
      value integer,
      word text,
      correct boolean,
      points integer,
      elapsed_ms integer,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `.execute(db);
  await sql`create index responses_slide on responses (session_id, slide_id)`.execute(db);
  // One answer per person per question, except word clouds, which take up to three words.
  await sql`
    create unique index responses_one_answer on responses (session_id, slide_id, participant_id)
    where kind <> 'wordcloud'
  `.execute(db);
  await sql`
    create unique index responses_one_word on responses (session_id, slide_id, participant_id, word)
    where kind = 'wordcloud'
  `.execute(db);

  await sql`
    create table questions (
      id uuid primary key default gen_random_uuid(),
      session_id uuid not null references live_sessions (id) on delete cascade,
      slide_id text not null,
      participant_id uuid not null references participants (id) on delete cascade,
      text text not null,
      name text,
      status text not null check (status in ('pending', 'live', 'answered', 'hidden')),
      upvotes integer not null default 0,
      created_at timestamptz not null default now(),
      answered_at timestamptz
    )
  `.execute(db);
  await sql`create index questions_slide on questions (session_id, slide_id)`.execute(db);

  await sql`
    create table question_votes (
      question_id uuid not null references questions (id) on delete cascade,
      participant_id uuid not null references participants (id) on delete cascade,
      created_at timestamptz not null default now(),
      primary key (question_id, participant_id)
    )
  `.execute(db);

  await sql`
    create table home_polls (
      id uuid primary key default gen_random_uuid(),
      question text not null,
      options jsonb not null,
      active boolean not null default false,
      position integer not null,
      created_at timestamptz not null default now(),
      activated_at timestamptz
    )
  `.execute(db);
  await sql`create unique index home_polls_one_active on home_polls (active) where active`.execute(db);

  await sql`
    create table home_votes (
      poll_id uuid not null references home_polls (id) on delete cascade,
      token_hash text not null,
      option_id text not null,
      created_at timestamptz not null default now(),
      primary key (poll_id, token_hash)
    )
  `.execute(db);

  await sql`
    create table contact_requests (
      id uuid primary key default gen_random_uuid(),
      name text not null,
      email text not null,
      organisation text not null default '',
      topic text not null,
      message text not null,
      user_id uuid references users (id) on delete set null,
      created_at timestamptz not null default now(),
      handled_at timestamptz,
      handled_by uuid references users (id) on delete set null
    )
  `.execute(db);

  await sql`
    create table email_log (
      id bigserial primary key,
      kind text not null,
      to_address text not null,
      user_id uuid references users (id) on delete set null,
      status text not null,
      detail text,
      created_at timestamptz not null default now()
    )
  `.execute(db);
  await sql`create index email_log_created on email_log (created_at)`.execute(db);

  await sql`
    create table report_files (
      session_id uuid primary key references live_sessions (id) on delete cascade,
      pdf bytea not null,
      responses_at bigint not null,
      created_at timestamptz not null default now()
    )
  `.execute(db);

  await sql`
    create table staff_actions (
      id bigserial primary key,
      staff_id uuid not null references users (id) on delete cascade,
      action text not null,
      target_user_id uuid references users (id) on delete set null,
      target_session_id uuid references live_sessions (id) on delete set null,
      detail text,
      created_at timestamptz not null default now()
    )
  `.execute(db);
}

export async function down(): Promise<void> {
  throw new Error("The first migration is not reversible.");
}
