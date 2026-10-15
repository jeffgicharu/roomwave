import type { ColumnType, Generated, Insertable, Selectable, Updateable } from "kysely";

import type { PlanId, Slide, SlideState, ThemeId } from "@roomwave/shared";

type Timestamp = ColumnType<Date, Date | string | undefined, Date | string>;
type NullableTimestamp = ColumnType<Date | null, Date | string | null | undefined, Date | string | null>;
type Json<T> = ColumnType<T, string, string>;

export interface UsersTable {
  id: Generated<string>;
  name: string;
  email: string | null;
  password_hash: string | null;
  role: ColumnType<"customer" | "staff", "customer" | "staff" | undefined, "customer" | "staff">;
  plan: ColumnType<PlanId, PlanId | undefined, PlanId>;
  trial_ends_at: NullableTimestamp;
  organisation: string | null;
  is_guest: Generated<boolean>;
  guest_expires_at: NullableTimestamp;
  suspended_at: NullableTimestamp;
  last_active_at: NullableTimestamp;
  is_sample: Generated<boolean>;
  created_at: Generated<Date>;
}

export interface AuthSessionsTable {
  id: string;
  user_id: string;
  user_agent: string | null;
  created_at: Generated<Date>;
  last_seen_at: Generated<Date>;
  expires_at: Timestamp;
}

export interface PasswordResetsTable {
  token_hash: string;
  user_id: string;
  expires_at: Timestamp;
  used_at: NullableTimestamp;
  created_at: Generated<Date>;
}

export interface PresentationsTable {
  id: Generated<string>;
  owner_id: string;
  title: string;
  theme: ThemeId;
  slides: Json<Slide[]>;
  version: Generated<number>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface LiveSessionsTable {
  id: Generated<string>;
  presentation_id: string;
  owner_id: string;
  code: string;
  title: string;
  theme: ThemeId;
  slides: Json<Slide[]>;
  slide_states: Json<Record<string, SlideState>>;
  slide_index: Generated<number>;
  remote_token: string;
  participant_limit: number;
  started_at: Generated<Date>;
  ended_at: NullableTimestamp;
  last_activity_at: Generated<Date>;
}

export interface ParticipantsTable {
  id: Generated<string>;
  session_id: string;
  token_hash: string;
  name: string | null;
  joined_at: Generated<Date>;
}

export interface ResponsesTable {
  id: Generated<string>;
  session_id: string;
  slide_id: string;
  participant_id: string;
  kind: "poll" | "quiz" | "scale" | "wordcloud";
  option_ids: string[] | null;
  option_id: string | null;
  value: number | null;
  word: string | null;
  correct: boolean | null;
  points: number | null;
  elapsed_ms: number | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface QuestionsTable {
  id: Generated<string>;
  session_id: string;
  slide_id: string;
  participant_id: string;
  text: string;
  name: string | null;
  status: "pending" | "live" | "answered" | "hidden";
  upvotes: Generated<number>;
  created_at: Generated<Date>;
  answered_at: NullableTimestamp;
}

export interface QuestionVotesTable {
  question_id: string;
  participant_id: string;
  created_at: Generated<Date>;
}

export interface HomePollsTable {
  id: Generated<string>;
  question: string;
  options: Json<{ id: string; label: string }[]>;
  active: Generated<boolean>;
  position: number;
  created_at: Generated<Date>;
  activated_at: NullableTimestamp;
}

export interface HomeVotesTable {
  poll_id: string;
  token_hash: string;
  option_id: string;
  created_at: Generated<Date>;
}

export interface ContactRequestsTable {
  id: Generated<string>;
  name: string;
  email: string;
  organisation: string;
  topic: "organisation" | "invoice" | "event" | "support" | "other";
  message: string;
  user_id: string | null;
  created_at: Generated<Date>;
  handled_at: NullableTimestamp;
  handled_by: string | null;
  is_sample: Generated<boolean>;
}

export interface EmailLogTable {
  id: Generated<string>;
  kind: "password_reset" | "session_report";
  to_address: string;
  user_id: string | null;
  status: "sent" | "failed" | "skipped";
  detail: string | null;
  created_at: Generated<Date>;
}

export interface ReportFilesTable {
  session_id: string;
  pdf: Buffer;
  responses_at: number;
  created_at: Generated<Date>;
}

export interface StaffActionsTable {
  id: Generated<string>;
  staff_id: string;
  action: string;
  target_user_id: string | null;
  target_session_id: string | null;
  detail: string | null;
  created_at: Generated<Date>;
}

export interface Database {
  users: UsersTable;
  auth_sessions: AuthSessionsTable;
  password_resets: PasswordResetsTable;
  presentations: PresentationsTable;
  live_sessions: LiveSessionsTable;
  participants: ParticipantsTable;
  responses: ResponsesTable;
  questions: QuestionsTable;
  question_votes: QuestionVotesTable;
  home_polls: HomePollsTable;
  home_votes: HomeVotesTable;
  contact_requests: ContactRequestsTable;
  email_log: EmailLogTable;
  report_files: ReportFilesTable;
  staff_actions: StaffActionsTable;
}

export type UserRow = Selectable<UsersTable>;
export type NewUser = Insertable<UsersTable>;
export type UserUpdate = Updateable<UsersTable>;
export type LiveSessionRow = Selectable<LiveSessionsTable>;
export type PresentationRow = Selectable<PresentationsTable>;
