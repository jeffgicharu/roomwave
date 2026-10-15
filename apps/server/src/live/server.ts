import type { Server as HttpServer } from "node:http";

import { createAdapter } from "@socket.io/redis-adapter";
import { Server } from "socket.io";

import { NAMESPACES, SOCKET_PATH } from "@roomwave/shared";

import { config } from "../config.ts";
import { PREFIX, createRedis } from "../redis.ts";
import { registerAudience } from "./audience.ts";
import { registerHome, watchHomePoll, type HomeNamespace } from "./home.ts";
import { registerHost } from "./host.ts";
import { attachNamespaces, refreshPresence, type AudienceNamespace, type HostNamespace } from "./hub.ts";
import { forget, onSessionChanged } from "./store.ts";

export interface LiveServer {
  io: Server;
  close: () => Promise<void>;
}

export function startLiveServer(httpServer: HttpServer): LiveServer {
  const pub = createRedis("sio-pub");
  const sub = pub.duplicate({ connectionName: `${PREFIX}sio-sub` });

  const io = new Server(httpServer, {
    path: SOCKET_PATH,
    serveClient: false,
    // Pings every 25 seconds keep the connection alive through Cloudflare,
    // which drops a connection that is silent for about 100 seconds.
    pingInterval: 25_000,
    pingTimeout: 20_000,
    maxHttpBufferSize: 16 * 1024,
    cors: { origin: config.SITE_URL, credentials: true },
    // The other release, during a deploy, shares rooms through Redis. Channel
    // names carry the brand prefix because pub/sub is shared across the server.
    adapter: createAdapter(pub, sub, { key: `${PREFIX}sio` }),
  });

  const audience = io.of(NAMESPACES.audience) as unknown as AudienceNamespace;
  const host = io.of(NAMESPACES.host) as unknown as HostNamespace;
  const home = io.of(NAMESPACES.home) as unknown as HomeNamespace;
  attachNamespaces(audience, host);
  registerAudience(audience);
  registerHost(host);
  registerHome(home);

  // When a session changes, the other release drops its cached copy.
  const control = io.of("/");
  onSessionChanged((sessionId) => control.serverSideEmit("session-changed", sessionId));
  control.on("session-changed", (sessionId: string) => forget(sessionId));

  // Each connection is closed after its maximum age, with jitter so a whole
  // hall does not reconnect at the same second. The phone reconnects by itself
  // within a second or two, to whichever release is current.
  const maxAgeMs = config.SOCKET_MAX_AGE_MINUTES * 60_000;
  io.engine.on("connection", (conn: { close: () => void; once: (event: string, fn: () => void) => void }) => {
    const timer = setTimeout(() => conn.close(), maxAgeMs + Math.random() * maxAgeMs * 0.25);
    conn.once("close", () => clearTimeout(timer));
  });

  const presence = setInterval(() => void refreshPresence().catch(() => {}), 15_000);
  const homeWatch = watchHomePoll();

  return {
    io,
    close: async () => {
      clearInterval(presence);
      clearInterval(homeWatch);
      // Closing the transports (not the sockets) makes every phone reconnect,
      // and nginx sends it to the release that is now live.
      io.engine.close();
      await new Promise<void>((resolve) => io.close(() => resolve()));
      // The adapter has just queued one unsubscribe per namespace. Replies come
      // back in order, so once a ping is answered they have been, and the
      // connections can go without leaving them unanswered.
      await Promise.all([pub.ping().catch(() => {}), sub.ping().catch(() => {})]);
      pub.disconnect();
      sub.disconnect();
    },
  };
}

