import { config } from "./config.ts";
import { closeDatabase } from "./db/database.ts";
import { reportHealth } from "./health.ts";
import { buildApp } from "./http/app.ts";
import { connectionCount } from "./live/hub.ts";
import { startLiveServer } from "./live/server.ts";
import { redis } from "./redis.ts";

const app = await buildApp();
const live = startLiveServer(app.server);

await app.listen({ host: config.HOST, port: config.PORT });
const stopHealth = reportHealth(`web-${config.PORT}`, config.MEMORY_LIMIT_MB, connectionCount);
console.log(`Roomwave ${config.RELEASE.slice(0, 7)} listening on ${config.HOST}:${config.PORT}`);

let stopping = false;
async function stop(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  console.log(`${signal}: closing connections`);
  stopHealth();
  // Phones are disconnected at the transport, so they reconnect at once to the
  // release nginx now points at. Requests already in hand are allowed to finish.
  const deadline = setTimeout(() => process.exit(0), 10_000);
  try {
    await live.close();
    await closeDatabase();
    redis.disconnect();
  } finally {
    clearTimeout(deadline);
    process.exit(0);
  }
}

process.on("SIGTERM", () => void stop("SIGTERM"));
process.on("SIGINT", () => void stop("SIGINT"));
