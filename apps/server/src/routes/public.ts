import { sql } from "kysely";
import type { FastifyInstance } from "fastify";

import { contactSchema, parseJoinCode } from "@roomwave/shared";

import { optionalUser } from "../auth/sessions.ts";
import { config } from "../config.ts";
import { db } from "../db/database.ts";
import { parse, tooMany } from "../http/errors.ts";
import { redis } from "../redis.ts";
import { allow } from "../security/ratelimit.ts";
import { keyedHash } from "../security/tokens.ts";

export async function publicRoutes(app: FastifyInstance): Promise<void> {
  // Used by the deploy: answers only when the database and Redis both answer.
  app.get("/api/health", async (_request, reply) => {
    const [database, cache] = await Promise.allSettled([sql`select 1`.execute(db), redis.ping()]);
    const ok = database.status === "fulfilled" && cache.status === "fulfilled";
    return reply.code(ok ? 200 : 503).send({
      ok,
      release: config.RELEASE,
      database: database.status === "fulfilled",
      redis: cache.status === "fulfilled",
    });
  });

  // Checks a code before the phone opens a live connection.
  app.get<{ Params: { code: string } }>("/api/join/:code", async (request, reply) => {
    const code = parseJoinCode(request.params.code);
    if (!code) return reply.code(404).send({ error: "not_found", message: "There is no session with that code." });
    const open = await db
      .selectFrom("live_sessions")
      .select(["title"])
      .where("code", "=", code)
      .where("ended_at", "is", null)
      .executeTakeFirst();
    if (open) return { code, title: open.title };
    const ended = await db
      .selectFrom("live_sessions")
      .select("id")
      .where("code", "=", code)
      .where("ended_at", ">", sql<Date>`now() - interval '12 hours'`)
      .executeTakeFirst();
    return reply.code(ended ? 410 : 404).send(
      ended
        ? { error: "ended", message: "This session has ended. Thank you for taking part." }
        : { error: "not_found", message: "There is no session with that code. Check the code on the screen." },
    );
  });

  app.post("/api/contact", async (request, reply) => {
    if (!(await allow("contact", keyedHash(request.ip), 5, 3600))) throw tooMany();
    const input = parse(contactSchema, request.body);
    const user = await optionalUser(request);
    await db
      .insertInto("contact_requests")
      .values({ ...input, user_id: user && !user.is_guest ? user.id : null })
      .execute();
    return reply.code(201).send({ ok: true });
  });
}
