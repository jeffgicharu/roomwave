import type { FastifyInstance } from "fastify";

import {
  TRIAL_DAYS,
  accountUpdateSchema,
  deleteAccountSchema,
  passwordChangeSchema,
} from "@roomwave/shared";

import { SESSION_COOKIE, requireUser, toUser } from "../auth/sessions.ts";
import { db } from "../db/database.ts";
import type { UserRow } from "../db/schema.ts";
import { HttpError, parse } from "../http/errors.ts";
import { hashPassword, verifyPassword } from "../security/passwords.ts";
import { hashToken } from "../security/tokens.ts";

/** Sample accounts, the staff training account among them, are shared and stay as they are. */
function refuseSample(user: UserRow): void {
  if (user.is_sample) throw new HttpError(403, "sample", "This account is shared for training and cannot be changed.");
}

export async function accountRoutes(app: FastifyInstance): Promise<void> {
  app.patch("/api/account", async (request) => {
    const user = await requireUser(request);
    refuseSample(user);
    if (user.is_guest) throw new HttpError(409, "guest", "Save your workspace as an account first.");
    const input = parse(accountUpdateSchema, request.body);
    const taken = await db
      .selectFrom("users")
      .select("id")
      .where((eb) => eb(eb.fn("lower", ["email"]), "=", input.email))
      .where("id", "<>", user.id)
      .executeTakeFirst();
    if (taken) {
      throw new HttpError(422, "invalid", "Please check the highlighted fields.", {
        email: "Another account already uses this email.",
      });
    }
    const updated = await db
      .updateTable("users")
      .set({ name: input.name, email: input.email })
      .where("id", "=", user.id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return { user: await toUser(updated) };
  });

  app.post("/api/account/password", async (request) => {
    const user = await requireUser(request);
    refuseSample(user);
    const input = parse(passwordChangeSchema, request.body);
    if (!(await verifyPassword(input.current, user.password_hash))) {
      throw new HttpError(422, "invalid", "Please check the highlighted fields.", {
        current: "That is not your current password.",
      });
    }
    await db
      .updateTable("users")
      .set({ password_hash: await hashPassword(input.next) })
      .where("id", "=", user.id)
      .execute();
    // Other devices are signed out; this one stays signed in.
    const current = request.cookies[SESSION_COOKIE];
    await db
      .deleteFrom("auth_sessions")
      .where("user_id", "=", user.id)
      .where("id", "<>", current ? hashToken(current) : "")
      .execute();
    return { ok: true };
  });

  app.delete("/api/account", async (request, reply) => {
    const user = await requireUser(request);
    refuseSample(user);
    if (user.role === "staff") throw new HttpError(409, "staff", "Staff accounts are removed by an administrator.");
    const input = parse(deleteAccountSchema, request.body);
    if (!user.is_guest && !(await verifyPassword(input.password, user.password_hash))) {
      throw new HttpError(422, "invalid", "Please check the highlighted fields.", {
        password: "That is not your password.",
      });
    }
    await db.deleteFrom("users").where("id", "=", user.id).execute();
    reply.clearCookie(SESSION_COOKIE, { path: "/" });
    return reply.code(204).send();
  });

  app.post("/api/billing/trial", async (request) => {
    const user = await requireUser(request);
    refuseSample(user);
    if (user.plan !== "free") throw new HttpError(409, "paid", "Your account is already on a paid plan.");
    if (user.trial_ends_at) throw new HttpError(409, "trial_used", "This account has already had its free trial.");
    const updated = await db
      .updateTable("users")
      .set({ trial_ends_at: new Date(Date.now() + TRIAL_DAYS * 86_400_000) })
      .where("id", "=", user.id)
      .where("trial_ends_at", "is", null)
      .returningAll()
      .executeTakeFirst();
    if (!updated) throw new HttpError(409, "trial_used", "This account has already had its free trial.");
    return { user: await toUser(updated) };
  });
}
