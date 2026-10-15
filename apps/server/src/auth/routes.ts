import type { FastifyInstance } from "fastify";

import {
  forgotSchema,
  passwordResetSchema,
  signInSchema,
  signUpSchema,
  templateById,
} from "@roomwave/shared";

import { db } from "../db/database.ts";
import { HttpError, parse, tooMany } from "../http/errors.ts";
import { enqueue } from "../jobs/queue.ts";
import { insertFromTemplate } from "../routes/presentations-store.ts";
import { hashPassword, verifyPassword } from "../security/passwords.ts";
import { allow } from "../security/ratelimit.ts";
import { hashToken, keyedHash, newToken } from "../security/tokens.ts";
import { endSession, requireUser, startSession, toUser, optionalUser } from "./sessions.ts";

const GUEST_HOURS = 24;

async function emailTaken(email: string, exceptUserId?: string): Promise<boolean> {
  let query = db.selectFrom("users").select("id").where((eb) => eb(eb.fn("lower", ["email"]), "=", email));
  if (exceptUserId) query = query.where("id", "<>", exceptUserId);
  return Boolean(await query.executeTakeFirst());
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  // Answers whether or not someone is signed in, so a signed-out visit is not logged as a failure.
  app.get("/api/auth/me", async (request) => {
    const user = await optionalUser(request);
    return { user: user && !user.suspended_at ? await toUser(user) : null };
  });

  app.post("/api/auth/signup", async (request, reply) => {
    if (!(await allow("signup", keyedHash(request.ip), 8, 3600))) throw tooMany();
    const input = parse(signUpSchema, request.body);
    if (await emailTaken(input.email)) {
      throw new HttpError(422, "invalid", "Please check the highlighted fields.", {
        email: "An account with this email already exists. Sign in instead.",
      });
    }
    const user = await db
      .insertInto("users")
      .values({ name: input.name, email: input.email, password_hash: await hashPassword(input.password) })
      .returningAll()
      .executeTakeFirstOrThrow();
    await insertFromTemplate(user.id, "welcome");
    await startSession(reply, request, user.id);
    return reply.code(201).send({ user: await toUser(user) });
  });

  app.post("/api/auth/signin", async (request, reply) => {
    const input = parse(signInSchema, request.body);
    const limited =
      !(await allow("signin-ip", keyedHash(request.ip), 30, 900)) ||
      !(await allow("signin-email", keyedHash(input.email), 10, 900));
    if (limited) throw tooMany();
    const user = await db
      .selectFrom("users")
      .selectAll()
      .where((eb) => eb(eb.fn("lower", ["email"]), "=", input.email))
      .executeTakeFirst();
    const valid = await verifyPassword(input.password, user?.password_hash ?? null);
    if (!user || !valid) {
      throw new HttpError(422, "invalid", "That email and password do not match an account.", {
        password: "That email and password do not match an account.",
      });
    }
    if (user.suspended_at) {
      throw new HttpError(403, "suspended", "This account has been suspended. Contact us if you think this is a mistake.");
    }
    await startSession(reply, request, user.id);
    await db.updateTable("users").set({ last_active_at: new Date() }).where("id", "=", user.id).execute();
    return { user: await toUser(user) };
  });

  app.post("/api/auth/signout", async (request, reply) => {
    await endSession(request, reply);
    return reply.code(204).send();
  });

  // Try everything without an account. The workspace lasts a day unless it is
  // turned into an account by adding an email address and a password.
  app.post<{ Body: { template?: unknown } }>("/api/guest", async (request, reply) => {
    // A visitor can arrive from a use-case page with a template in mind.
    const template = typeof request.body?.template === "string" ? templateById(request.body.template) : undefined;
    const existing = await optionalUser(request);
    if (existing?.is_guest) {
      if (template && template.id !== "welcome" && (await toUser(existing)).presentationCount < 5) {
        await insertFromTemplate(existing.id, template.id);
      }
      return { user: await toUser(existing) };
    }
    if (!(await allow("guest", keyedHash(request.ip), 10, 3600))) throw tooMany();
    const user = await db
      .insertInto("users")
      .values({
        name: "Guest",
        is_guest: true,
        guest_expires_at: new Date(Date.now() + GUEST_HOURS * 3_600_000),
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    await insertFromTemplate(user.id, "welcome");
    if (template && template.id !== "welcome") await insertFromTemplate(user.id, template.id);
    await startSession(reply, request, user.id);
    return reply.code(201).send({ user: await toUser(user) });
  });

  app.post("/api/auth/claim", async (request) => {
    const user = await requireUser(request);
    if (!user.is_guest) throw new HttpError(409, "not_guest", "This workspace already belongs to an account.");
    const input = parse(signUpSchema, request.body);
    if (await emailTaken(input.email, user.id)) {
      throw new HttpError(422, "invalid", "Please check the highlighted fields.", {
        email: "An account with this email already exists. Sign in instead.",
      });
    }
    const updated = await db
      .updateTable("users")
      .set({
        name: input.name,
        email: input.email,
        password_hash: await hashPassword(input.password),
        is_guest: false,
        guest_expires_at: null,
      })
      .where("id", "=", user.id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return { user: await toUser(updated) };
  });

  app.post("/api/auth/forgot", async (request, reply) => {
    const input = parse(forgotSchema, request.body);
    const limited =
      !(await allow("forgot-ip", keyedHash(request.ip), 10, 3600)) ||
      !(await allow("forgot-email", keyedHash(input.email), 3, 3600));
    if (limited) throw tooMany();
    const user = await db
      .selectFrom("users")
      .select(["id", "is_guest", "is_sample", "suspended_at"])
      .where((eb) => eb(eb.fn("lower", ["email"]), "=", input.email))
      .executeTakeFirst();
    // The answer is the same whether or not the account exists.
    // Sample accounts never receive email: their addresses are made up.
    if (user && !user.is_guest && !user.is_sample && !user.suspended_at) {
      const token = newToken();
      await db
        .insertInto("password_resets")
        .values({ token_hash: hashToken(token), user_id: user.id, expires_at: new Date(Date.now() + 3_600_000) })
        .execute();
      await enqueue({ kind: "password_reset", userId: user.id, token });
    }
    return reply.code(202).send({ ok: true });
  });

  app.post("/api/auth/reset", async (request, reply) => {
    if (!(await allow("reset-ip", keyedHash(request.ip), 20, 3600))) throw tooMany();
    const input = parse(passwordResetSchema, request.body);
    const reset = await db
      .selectFrom("password_resets")
      .selectAll()
      .where("token_hash", "=", hashToken(input.token))
      .executeTakeFirst();
    if (!reset || reset.used_at || reset.expires_at < new Date()) {
      throw new HttpError(410, "expired", "This link has expired or has already been used. Ask for a new one.");
    }
    const user = await db.transaction().execute(async (trx) => {
      await trx.updateTable("password_resets").set({ used_at: new Date() }).where("token_hash", "=", reset.token_hash).execute();
      // Every other device is signed out when the password changes.
      await trx.deleteFrom("auth_sessions").where("user_id", "=", reset.user_id).execute();
      return trx
        .updateTable("users")
        .set({ password_hash: await hashPassword(input.password) })
        .where("id", "=", reset.user_id)
        .returningAll()
        .executeTakeFirstOrThrow();
    });
    await startSession(reply, request, user.id);
    return { user: await toUser(user) };
  });
}
