import { monitorEventLoopDelay } from "node:perf_hooks";

import type { ProcessHealth } from "@roomwave/shared";

import { config } from "./config.ts";
import { key, redis } from "./redis.ts";

/**
 * Every ten seconds each process writes how it is doing to Redis, where the
 * staff health screen reads it. The entry expires if the process stops.
 */
export function reportHealth(name: string, limitMb: number, connections: () => number | null): () => void {
  const delay = monitorEventLoopDelay({ resolution: 20 });
  delay.enable();
  const started = Date.now();

  const timer = setInterval(() => {
    const memory = process.memoryUsage();
    const entry: ProcessHealth = {
      name,
      release: config.RELEASE.slice(0, 7),
      uptimeSeconds: Math.round((Date.now() - started) / 1000),
      rssMb: Math.round(memory.rss / 1048576),
      heapUsedMb: Math.round(memory.heapUsed / 1048576),
      limitMb,
      eventLoopDelayMs: Math.round((delay.percentile(99) / 1e6) * 10) / 10,
      connections: connections(),
      reportedAt: new Date().toISOString(),
    };
    delay.reset();
    void redis.set(key("health", name), JSON.stringify(entry), "EX", 30).catch(() => {});
  }, 10_000);
  timer.unref();

  return () => {
    clearInterval(timer);
    delay.disable();
    void redis.del(key("health", name)).catch(() => {});
  };
}
