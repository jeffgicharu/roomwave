import { readFileSync } from "node:fs";
import { monitorEventLoopDelay } from "node:perf_hooks";

import type { ProcessHealth } from "@roomwave/shared";

import { config } from "./config.ts";
import { key, redis } from "./redis.ts";

/**
 * Under systemd each service has its own cgroup, and its memory limit applies
 * to that cgroup's usage. Resident size is larger: it also counts the Node
 * binary's pages, which are shared with every other Node process.
 */
function cgroupMemoryFile(): string | null {
  if (!process.env.INVOCATION_ID) return null;
  try {
    const line = readFileSync("/proc/self/cgroup", "utf8").split("\n").find((l) => l.startsWith("0::"));
    const path = line?.slice(3).trim();
    if (!path?.endsWith(".service")) return null;
    const file = `/sys/fs/cgroup${path}/memory.current`;
    readFileSync(file, "utf8");
    return file;
  } catch {
    return null;
  }
}

function memoryBytes(file: string | null): number {
  if (file) {
    try {
      return Number(readFileSync(file, "utf8"));
    } catch {
      // Fall back to the resident size below.
    }
  }
  return process.memoryUsage.rss();
}

/**
 * Every ten seconds each process writes how it is doing to Redis, where the
 * staff health screen reads it. The entry expires if the process stops.
 */
export function reportHealth(name: string, limitMb: number, connections: () => number | null): () => void {
  const delay = monitorEventLoopDelay({ resolution: 20 });
  delay.enable();
  const started = Date.now();
  const cgroupFile = cgroupMemoryFile();

  const timer = setInterval(() => {
    const memory = process.memoryUsage();
    const entry: ProcessHealth = {
      name,
      release: config.RELEASE.slice(0, 7),
      uptimeSeconds: Math.round((Date.now() - started) / 1000),
      memoryMb: Math.round(memoryBytes(cgroupFile) / 1048576),
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
