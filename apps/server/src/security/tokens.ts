import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { config } from "../config.ts";

/** A random token for a cookie, a link or a phone: 32 bytes, URL-safe. */
export function newToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** Tokens are stored only as hashes, so a copy of the database cannot be used to sign in. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("base64url");
}

/** For values that must not be stored as they are, such as a visitor's address. */
export function keyedHash(value: string): string {
  return createHmac("sha256", config.APP_SECRET).update(value).digest("base64url").slice(0, 22);
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
