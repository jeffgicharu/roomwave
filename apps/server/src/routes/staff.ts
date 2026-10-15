import { sql } from "kysely";
import type { FastifyInstance } from "fastify";

import {
  effectivePlan,
  type ProcessHealth,
  type StaffCustomer,
  type StaffHealth,
  type StaffLiveSession,
  type StaffOverview,
  type StaffRequest,
} from "@roomwave/shared";

import { requireStaff } from "../auth/sessions.ts";
import { config } from "../config.ts";
import { db } from "../db/database.ts";
import type { UserRow } from "../db/schema.ts";
import { HttpError, notFound } from "../http/errors.ts";
import { workQueue } from "../jobs/queue.ts";
import { endLiveSession } from "../live/control.ts";
import { onlineCount } from "../live/hub.ts";
import { key, redis } from "../redis.ts";
import { UUID } from "./presentations.ts";

const PAGE_SIZE = 25;

async function logAction(
  staffId: string,
  action: string,
  target: { userId?: string; sessionId?: string },
  detail?: string,
): Promise<void> {
  await db
    .insertInto("staff_actions")
    .values({
      staff_id: staffId,
      action,
      target_user_id: target.userId ?? null,
      target_session_id: target.sessionId ?? null,
      detail: detail ?? null,
    })
    .execute();
}

/** Users whose records the staff training account may see. */
const sampleUsers = () => db.selectFrom("users").select("id").where("is_sample", "=", true);

/**
 * The staff training account is a sample itself: everything it sees and
 * changes is limited to sample customers, their sessions and sample requests.
 */
function isTraining(staff: UserRow): boolean {
  return staff.is_sample;
}

export async function staffRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/staff/overview", async (request) => {
    const training = isTraining(await requireStaff(request));
    let liveQuery = db.selectFrom("live_sessions").select("id").where("ended_at", "is", null);
    if (training) liveQuery = liveQuery.where("owner_id", "in", sampleUsers());
    let requestsQuery = db
      .selectFrom("contact_requests")
      .select((eb) => eb.fn.countAll<number>().as("n"))
      .where("handled_at", "is", null);
    if (training) requestsQuery = requestsQuery.where("is_sample", "=", true);
    let responsesQuery = db
      .selectFrom("responses")
      .select((eb) => eb.fn.countAll<number>().as("n"))
      .where("created_at", ">=", sql<Date>`date_trunc('day', now() at time zone 'Africa/Nairobi') at time zone 'Africa/Nairobi'`);
    if (training) {
      responsesQuery = responsesQuery.where("session_id", "in", db.selectFrom("live_sessions").select("id").where("owner_id", "in", sampleUsers()));
    }
    const onlySamples = training ? sql`and is_sample` : sql``;
    const [live, accounts, requests, responses, byDay] = await Promise.all([
      liveQuery.execute(),
      db
        .selectFrom("users")
        .$if(training, (qb) => qb.where("is_sample", "=", true))
        .select([
          sql<number>`count(*) filter (where not is_guest and role = 'customer')`.as("accounts"),
          sql<number>`count(*) filter (where created_at >= date_trunc('day', now() at time zone 'Africa/Nairobi') at time zone 'Africa/Nairobi' and not is_guest and role = 'customer')`.as("today"),
          sql<number>`count(*) filter (where plan = 'free' and trial_ends_at > now() and role = 'customer')`.as("trial"),
          sql<number>`count(*) filter (where plan <> 'free' and role = 'customer')`.as("paying"),
        ])
        .executeTakeFirstOrThrow(),
      requestsQuery.executeTakeFirstOrThrow(),
      responsesQuery.executeTakeFirstOrThrow(),
      sql<{ day: string; count: number }>`
        select to_char(d, 'YYYY-MM-DD') as day,
               (select count(*) from users
                 where not is_guest and role = 'customer' ${onlySamples}
                   and (created_at at time zone 'Africa/Nairobi')::date = d) as count
          from generate_series((now() at time zone 'Africa/Nairobi')::date - 13,
                               (now() at time zone 'Africa/Nairobi')::date, interval '1 day') as d
         order by d`.execute(db),
    ]);
    const online = await Promise.all(live.map((s) => onlineCount(s.id)));
    const overview: StaffOverview = {
      liveSessions: live.length,
      connectedNow: online.reduce((a, b) => a + b, 0),
      accounts: Number(accounts.accounts),
      signupsToday: Number(accounts.today),
      onTrial: Number(accounts.trial),
      paying: Number(accounts.paying),
      openRequests: Number(requests.n),
      responsesToday: Number(responses.n),
      signupsByDay: byDay.rows.map((row) => ({ day: row.day, count: Number(row.count) })),
    };
    return overview;
  });

  app.get<{ Querystring: { q?: string; plan?: string; page?: string } }>("/api/staff/customers", async (request) => {
    const training = isTraining(await requireStaff(request));
    const page = Math.max(1, Number(request.query.page) || 1);
    const q = (request.query.q ?? "").trim().slice(0, 80);
    const plan = request.query.plan ?? "all";

    let base = db.selectFrom("users").where("role", "=", "customer");
    if (training) base = base.where("is_sample", "=", true);
    if (q) {
      const like = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
      base = base.where((eb) =>
        eb.or([eb("name", "ilike", like), eb("email", "ilike", like), eb("organisation", "ilike", like)]),
      );
    }
    if (plan === "free") base = base.where("plan", "=", "free").where((eb) => eb.or([eb("trial_ends_at", "is", null), eb("trial_ends_at", "<=", sql<Date>`now()`)])).where("is_guest", "=", false);
    if (plan === "trial") base = base.where("plan", "=", "free").where("trial_ends_at", ">", sql<Date>`now()`);
    if (plan === "paid") base = base.where("plan", "<>", "free");
    if (plan === "guest") base = base.where("is_guest", "=", true);
    if (plan === "suspended") base = base.where("suspended_at", "is not", null);

    const [{ total }, rows] = await Promise.all([
      base.select((eb) => eb.fn.countAll<number>().as("total")).executeTakeFirstOrThrow(),
      base
        .selectAll()
        .select([
          (eb) =>
            eb
              .selectFrom("presentations")
              .select((inner) => inner.fn.countAll<number>().as("n"))
              .whereRef("presentations.owner_id", "=", "users.id")
              .as("presentations"),
          (eb) =>
            eb
              .selectFrom("live_sessions")
              .select((inner) => inner.fn.countAll<number>().as("n"))
              .whereRef("live_sessions.owner_id", "=", "users.id")
              .as("sessions"),
        ])
        .orderBy("created_at", "desc")
        .limit(PAGE_SIZE)
        .offset((page - 1) * PAGE_SIZE)
        .execute(),
    ]);
    const customers: StaffCustomer[] = rows.map((row) => {
      const status = effectivePlan(row.plan, row.trial_ends_at);
      return {
        id: row.id,
        name: row.name,
        email: row.email,
        organisation: row.organisation,
        plan: status.basePlan,
        onTrial: status.onTrial,
        trialEndsAt: status.trialEndsAt,
        isGuest: row.is_guest,
        suspended: Boolean(row.suspended_at),
        presentations: Number(row.presentations ?? 0),
        sessions: Number(row.sessions ?? 0),
        lastActiveAt: row.last_active_at?.toISOString() ?? null,
        createdAt: row.created_at.toISOString(),
      };
    });
    return { customers, total: Number(total), page, pageSize: PAGE_SIZE };
  });

  app.get<{ Params: { id: string } }>("/api/staff/customers/:id", async (request) => {
    const training = isTraining(await requireStaff(request));
    if (!UUID.test(request.params.id)) throw notFound("That customer");
    const row = await db
      .selectFrom("users")
      .selectAll()
      .where("id", "=", request.params.id)
      .where("role", "=", "customer")
      .$if(training, (qb) => qb.where("is_sample", "=", true))
      .executeTakeFirst();
    if (!row) throw notFound("That customer");
    const [presentations, sessions, actions] = await Promise.all([
      db
        .selectFrom("presentations")
        .select(["id", "title", "updated_at", sql<number>`jsonb_array_length(slides)`.as("slides")])
        .where("owner_id", "=", row.id)
        .orderBy("updated_at", "desc")
        .execute(),
      db
        .selectFrom("live_sessions")
        .select([
          "id",
          "title",
          "code",
          "started_at",
          "ended_at",
          (eb) =>
            eb
              .selectFrom("participants")
              .select((inner) => inner.fn.countAll<number>().as("n"))
              .whereRef("participants.session_id", "=", "live_sessions.id")
              .as("participants"),
        ])
        .where("owner_id", "=", row.id)
        .orderBy("started_at", "desc")
        .limit(20)
        .execute(),
      db
        .selectFrom("staff_actions")
        .innerJoin("users as staff", "staff.id", "staff_actions.staff_id")
        .select(["staff_actions.action", "staff_actions.detail", "staff_actions.created_at", "staff.name as staff"])
        .where("target_user_id", "=", row.id)
        .orderBy("staff_actions.created_at", "desc")
        .limit(20)
        .execute(),
    ]);
    const status = effectivePlan(row.plan, row.trial_ends_at);
    return {
      customer: {
        id: row.id,
        name: row.name,
        email: row.email,
        organisation: row.organisation,
        plan: status.basePlan,
        onTrial: status.onTrial,
        trialEndsAt: status.trialEndsAt,
        trialUsed: status.trialUsed,
        isGuest: row.is_guest,
        guestExpiresAt: row.guest_expires_at?.toISOString() ?? null,
        suspended: Boolean(row.suspended_at),
        suspendedAt: row.suspended_at?.toISOString() ?? null,
        lastActiveAt: row.last_active_at?.toISOString() ?? null,
        createdAt: row.created_at.toISOString(),
      },
      presentations: presentations.map((p) => ({
        id: p.id,
        title: p.title,
        slides: Number(p.slides),
        updatedAt: p.updated_at.toISOString(),
      })),
      sessions: sessions.map((s) => ({
        id: s.id,
        title: s.title,
        code: s.code,
        startedAt: s.started_at.toISOString(),
        endedAt: s.ended_at?.toISOString() ?? null,
        participants: Number(s.participants ?? 0),
      })),
      actions: actions.map((a) => ({
        action: a.action,
        detail: a.detail,
        staff: a.staff,
        at: a.created_at.toISOString(),
      })),
    };
  });

  app.post<{ Params: { id: string } }>("/api/staff/customers/:id/extend-trial", async (request) => {
    const staff = await requireStaff(request);
    if (!UUID.test(request.params.id)) throw notFound("That customer");
    const row = await db
      .selectFrom("users")
      .select(["id", "plan", "trial_ends_at", "is_guest"])
      .where("id", "=", request.params.id)
      .where("role", "=", "customer")
      .$if(isTraining(staff), (qb) => qb.where("is_sample", "=", true))
      .executeTakeFirst();
    if (!row) throw notFound("That customer");
    if (row.plan !== "free") throw new HttpError(409, "paid", "This customer is on a paid plan.");
    const from = row.trial_ends_at && row.trial_ends_at > new Date() ? row.trial_ends_at : new Date();
    const until = new Date(from.getTime() + 7 * 86_400_000);
    await db.updateTable("users").set({ trial_ends_at: until }).where("id", "=", row.id).execute();
    await logAction(staff.id, "extend_trial", { userId: row.id }, `Trial now ends ${until.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Nairobi" })}`);
    return { ok: true, trialEndsAt: until.toISOString() };
  });

  app.post<{ Params: { id: string }; Body: { suspended?: boolean } }>(
    "/api/staff/customers/:id/suspend",
    async (request) => {
      const staff = await requireStaff(request);
      if (!UUID.test(request.params.id)) throw notFound("That customer");
      const suspended = request.body?.suspended === true;
      const row = await db
        .updateTable("users")
        .set({ suspended_at: suspended ? new Date() : null })
        .where("id", "=", request.params.id)
        .where("role", "=", "customer")
        .$if(isTraining(staff), (qb) => qb.where("is_sample", "=", true))
        .returning("id")
        .executeTakeFirst();
      if (!row) throw notFound("That customer");
      if (suspended) {
        await db.deleteFrom("auth_sessions").where("user_id", "=", row.id).execute();
        const open = await db
          .selectFrom("live_sessions")
          .select("id")
          .where("owner_id", "=", row.id)
          .where("ended_at", "is", null)
          .execute();
        for (const session of open) await endLiveSession(session.id);
      }
      await logAction(staff.id, suspended ? "suspend" : "unsuspend", { userId: row.id });
      return { ok: true };
    },
  );

  app.get("/api/staff/sessions", async (request) => {
    const training = isTraining(await requireStaff(request));
    const rows = await db
      .selectFrom("live_sessions")
      .innerJoin("users", "users.id", "live_sessions.owner_id")
      .select([
        "live_sessions.id",
        "live_sessions.code",
        "live_sessions.title",
        "live_sessions.started_at",
        "users.name as owner",
        "users.id as owner_id",
        (eb) =>
          eb
            .selectFrom("participants")
            .select((inner) => inner.fn.countAll<number>().as("n"))
            .whereRef("participants.session_id", "=", "live_sessions.id")
            .as("participants"),
        (eb) =>
          eb
            .selectFrom("responses")
            .select((inner) => inner.fn.countAll<number>().as("n"))
            .whereRef("responses.session_id", "=", "live_sessions.id")
            .as("responses"),
      ])
      .where("live_sessions.ended_at", "is", null)
      .$if(training, (qb) => qb.where("users.is_sample", "=", true))
      .orderBy("live_sessions.started_at", "desc")
      .limit(100)
      .execute();
    const sessions: StaffLiveSession[] = await Promise.all(
      rows.map(async (row) => ({
        id: row.id,
        code: row.code,
        title: row.title,
        owner: row.owner,
        ownerId: row.owner_id,
        startedAt: row.started_at.toISOString(),
        participants: Number(row.participants ?? 0),
        online: await onlineCount(row.id),
        responses: Number(row.responses ?? 0),
      })),
    );
    return { sessions };
  });

  app.post<{ Params: { id: string } }>("/api/staff/sessions/:id/end", async (request) => {
    const staff = await requireStaff(request);
    if (!UUID.test(request.params.id)) throw notFound("That session");
    const session = await db
      .selectFrom("live_sessions")
      .select(["id", "owner_id", "title"])
      .where("id", "=", request.params.id)
      .$if(isTraining(staff), (qb) => qb.where("owner_id", "in", sampleUsers()))
      .executeTakeFirst();
    if (!session) throw notFound("That session");
    await endLiveSession(session.id);
    await logAction(staff.id, "end_session", { userId: session.owner_id, sessionId: session.id }, session.title);
    return { ok: true };
  });

  app.get<{ Querystring: { status?: string } }>("/api/staff/requests", async (request) => {
    const training = isTraining(await requireStaff(request));
    let query = db
      .selectFrom("contact_requests")
      .leftJoin("users as handler", "handler.id", "contact_requests.handled_by")
      .selectAll("contact_requests")
      .select("handler.name as handler_name")
      .orderBy("contact_requests.created_at", "desc")
      .limit(100);
    if (training) query = query.where("contact_requests.is_sample", "=", true);
    if (request.query.status === "open") query = query.where("contact_requests.handled_at", "is", null);
    if (request.query.status === "handled") query = query.where("contact_requests.handled_at", "is not", null);
    const rows = await query.execute();
    const requests: StaffRequest[] = rows.map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      organisation: row.organisation,
      topic: row.topic,
      message: row.message,
      createdAt: row.created_at.toISOString(),
      handledAt: row.handled_at?.toISOString() ?? null,
      handledBy: row.handler_name ?? null,
    }));
    return { requests };
  });

  app.post<{ Params: { id: string }; Body: { handled?: boolean } }>(
    "/api/staff/requests/:id/handled",
    async (request) => {
      const staff = await requireStaff(request);
      if (!UUID.test(request.params.id)) throw notFound("That request");
      const handled = request.body?.handled !== false;
      const row = await db
        .updateTable("contact_requests")
        .set({ handled_at: handled ? new Date() : null, handled_by: handled ? staff.id : null })
        .where("id", "=", request.params.id)
        .$if(isTraining(staff), (qb) => qb.where("is_sample", "=", true))
        .returning("id")
        .executeTakeFirst();
      if (!row) throw notFound("That request");
      return { ok: true };
    },
  );

  app.get("/api/staff/health", async (request) => {
    await requireStaff(request);
    const names = await redis.keys(key("health", "*"));
    const raw = names.length ? await redis.mget(names) : [];
    const processes = raw
      .filter((value): value is string => Boolean(value))
      .map((value) => JSON.parse(value) as ProcessHealth)
      .sort((a, b) => a.name.localeCompare(b.name));
    const [counts, emails, database] = await Promise.all([
      workQueue().getJobCounts("waiting", "active", "failed", "delayed"),
      db
        .selectFrom("email_log")
        .select((eb) => eb.fn.countAll<number>().as("n"))
        .where("status", "=", "sent")
        .where("created_at", ">=", sql<Date>`now() - interval '24 hours'`)
        .executeTakeFirstOrThrow(),
      sql<{ size: number; connections: number }>`
        select pg_database_size(current_database()) / 1048576.0 as size,
               (select count(*) from pg_stat_activity where datname = current_database()) as connections`.execute(db),
    ]);
    const health: StaffHealth = {
      processes,
      queue: {
        waiting: counts.waiting ?? 0,
        active: counts.active ?? 0,
        failed: counts.failed ?? 0,
        delayed: counts.delayed ?? 0,
      },
      emailsToday: Number(emails.n),
      emailsPerDay: config.EMAIL_DAILY_CAP,
      database: {
        sizeMb: Math.round(Number(database.rows[0]?.size ?? 0) * 10) / 10,
        connections: Number(database.rows[0]?.connections ?? 0),
      },
    };
    return health;
  });
}
