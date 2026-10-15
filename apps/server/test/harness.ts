import type { AddressInfo } from "node:net";

import { sql } from "kysely";
import { io as connect, type Socket } from "socket.io-client";

import {
  NAMESPACES,
  SOCKET_PATH,
  type AudienceClientEvents,
  type AudienceServerEvents,
  type HostClientEvents,
  type HostServerEvents,
} from "@roomwave/shared";

import { config } from "../src/config.ts";
import { db } from "../src/db/database.ts";
import { migrateToLatest } from "../src/db/migrate.ts";
import { buildApp } from "../src/http/app.ts";
import { startLiveServer } from "../src/live/server.ts";
import { redis } from "../src/redis.ts";

export async function resetDatabase(): Promise<void> {
  await sql`drop schema public cascade`.execute(db);
  await sql`create schema public`.execute(db);
  await migrateToLatest(db);
  const keys = await redis.keys(`${config.REDIS_PREFIX}*`);
  if (keys.length) await redis.del(...keys);
}

export async function startServer() {
  const app = await buildApp();
  const live = startLiveServer(app.server);
  await app.listen({ host: "127.0.0.1", port: 0 });
  const { port } = app.server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    close: async () => {
      await live.close();
    },
  };
}

/** A browser: keeps its cookies and sends the site's own Origin, as the real pages do. */
export class Browser {
  cookie = "";
  private readonly base: string;

  constructor(base: string) {
    this.base = base;
  }

  async request<T = unknown>(method: string, path: string, body?: unknown): Promise<{ status: number; body: T }> {
    const response = await fetch(this.base + path, {
      method,
      headers: {
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
        origin: config.SITE_URL,
        ...(this.cookie ? { cookie: this.cookie } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const set = response.headers.get("set-cookie");
    if (set) this.cookie = set.split(";")[0]!;
    const text = await response.text();
    return { status: response.status, body: (text ? JSON.parse(text) : null) as T };
  }

  host(): Socket<HostServerEvents, HostClientEvents> {
    return connect(this.base + NAMESPACES.host, {
      path: SOCKET_PATH,
      transports: ["websocket"],
      extraHeaders: { cookie: this.cookie },
      forceNew: true,
    });
  }
}

export function phone(base: string): Socket<AudienceServerEvents, AudienceClientEvents> {
  return connect(base + NAMESPACES.audience, { path: SOCKET_PATH, transports: ["websocket"], forceNew: true });
}

/** Resolves with the next event of that name, or fails after a few seconds. */
export function next<T extends unknown[]>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- any typed socket
  socket: { once: (event: any, fn: any) => unknown },
  event: string,
  timeoutMs = 4_000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`No "${event}" within ${timeoutMs} ms`)), timeoutMs);
    socket.once(event, (...args: T) => {
      clearTimeout(timer);
      resolve(args);
    });
  });
}

/** Waits until a condition on received events holds. */
export async function eventually(check: () => boolean, timeoutMs = 4_000): Promise<void> {
  const started = Date.now();
  while (!check()) {
    if (Date.now() - started > timeoutMs) throw new Error("Condition not met in time");
    await new Promise((r) => setTimeout(r, 20));
  }
}
