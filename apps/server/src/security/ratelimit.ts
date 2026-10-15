import { key, redis } from "../redis.ts";

/**
 * A fixed-window counter in Redis. Returns true while the caller is within
 * its allowance. If Redis cannot be reached the request is allowed: a limit
 * that fails closed would take the whole site down with Redis.
 */
export async function allow(bucket: string, id: string, limit: number, windowSeconds: number): Promise<boolean> {
  const k = key("rl", bucket, id);
  try {
    const results = await redis.multi().incr(k).expire(k, windowSeconds, "NX").exec();
    const count = Number(results?.[0]?.[1] ?? 0);
    return count <= limit;
  } catch {
    return true;
  }
}
