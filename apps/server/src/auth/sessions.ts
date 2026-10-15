import type { FastifyReply, FastifyRequest } from "fastify";

import { effectivePlan, type User } from "@roomwave/shared";

import { isProduction } from "../config.ts";
import { db } from "../db/database.ts";
import type { UserRow } from "../db/schema.ts";
import { HttpError, forbidden, unauthorised } from "../http/errors.ts";
import { hashToken, newToken } from "../security/tokens.ts";

export const SESSION_COOKIE = "rw_session";
const SESSION_DAYS = 30;

export async function startSession(reply: FastifyReply, request: FastifyRequest, userId: string): Promise<void> {
  const token = newToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await db
    .insertInto("auth_sessions")
    .values({
      id: hashToken(token),
      user_id: userId,
      user_agent: (request.headers["user-agent"] ?? "").slice(0, 300) || null,
      expires_at: expiresAt,
    })
    .execute();
  reply.setCookie(SESSION_COOKIE, token, {
    path: "/",
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    expires: expiresAt,
  });
}

export async function endSession(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const token = request.cookies[SESSION_COOKIE];
  if (token) await db.deleteFrom("auth_sessions").where("id", "=", hashToken(token)).execute();
  reply.clearCookie(SESSION_COOKIE, { path: "/" });
}

/** The signed-in user for a session cookie, or null. Also used by the live connection. */
export async function userFromToken(token: string | undefined): Promise<UserRow | null> {
  if (!token || token.length > 100) return null;
  const id = hashToken(token);
  const row = await db
    .selectFrom("auth_sessions")
    .innerJoin("users", "users.id", "auth_sessions.user_id")
    .selectAll("users")
    .select(["auth_sessions.last_seen_at as session_seen_at", "auth_sessions.expires_at as session_expires_at"])
    .where("auth_sessions.id", "=", id)
    .executeTakeFirst();
  if (!row || row.session_expires_at < new Date()) return null;
  if (row.is_guest && row.guest_expires_at && row.guest_expires_at < new Date()) return null;

  // Keep the session sliding, at most one write an hour.
  if (Date.now() - row.session_seen_at.getTime() > 3_600_000) {
    const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
    await db
      .updateTable("auth_sessions")
      .set({ last_seen_at: new Date(), expires_at: expires })
      .where("id", "=", id)
      .execute();
    await db.updateTable("users").set({ last_active_at: new Date() }).where("id", "=", row.id).execute();
  }
  const { session_seen_at: _seen, session_expires_at: _expires, ...user } = row;
  return user;
}

declare module "fastify" {
  interface FastifyRequest {
    currentUser?: UserRow | null;
  }
}

export async function optionalUser(request: FastifyRequest): Promise<UserRow | null> {
  if (request.currentUser === undefined) {
    request.currentUser = await userFromToken(request.cookies[SESSION_COOKIE]);
  }
  return request.currentUser;
}

export async function requireUser(request: FastifyRequest): Promise<UserRow> {
  const user = await optionalUser(request);
  if (!user) throw unauthorised();
  if (user.suspended_at) {
    throw new HttpError(403, "suspended", "This account has been suspended. Contact us if you think this is a mistake.");
  }
  return user;
}

export async function requireStaff(request: FastifyRequest): Promise<UserRow> {
  const user = await requireUser(request);
  if (user.role !== "staff") throw forbidden();
  return user;
}

export async function toUser(row: UserRow): Promise<User> {
  const { count } = await db
    .selectFrom("presentations")
    .select((eb) => eb.fn.countAll<number>().as("count"))
    .where("owner_id", "=", row.id)
    .executeTakeFirstOrThrow();
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    isGuest: row.is_guest,
    isSample: row.is_sample,
    guestExpiresAt: row.guest_expires_at?.toISOString() ?? null,
    plan: effectivePlan(row.plan, row.trial_ends_at),
    presentationCount: Number(count),
    createdAt: row.created_at.toISOString(),
  };
}
