import { Redis, type RedisOptions } from "ioredis";

import { config } from "./config.ts";

// The Redis server is shared with other sites. Every key and every pub/sub
// channel starts with this prefix, and nothing here ever flushes or reconfigures it.
export const PREFIX = config.REDIS_PREFIX;

export function key(...parts: (string | number)[]): string {
  return PREFIX + parts.join(":");
}

export function createRedis(name: string, options: RedisOptions = {}): Redis {
  return new Redis(config.REDIS_URL, {
    connectionName: `${PREFIX}${name}`,
    enableAutoPipelining: true,
    ...options,
  });
}

/** Commands from the web process: rate limits, presence, health. */
export const redis = createRedis("web");
