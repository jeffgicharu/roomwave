import { createServer } from "node:http";

import { Worker, type Job } from "bullmq";
import pino from "pino";

import { config } from "./config.ts";
import { closeDatabase } from "./db/database.ts";
import { reportHealth } from "./health.ts";
import { cleanUp, emailSessionReport, refreshSamples, renderSessionReport, rotateHomePoll, sendPasswordReset } from "./jobs/handlers.ts";
import { BULL_PREFIX, QUEUE_NAME, workQueue, type JobData } from "./jobs/queue.ts";
import { createRedis, redis } from "./redis.ts";

const log = pino({ level: config.NODE_ENV === "production" ? "info" : "warn", name: "worker" });

type ScheduledJob = { kind: "clean_up" } | { kind: "rotate_home_poll" } | { kind: "refresh_samples" };

async function run(job: Job<JobData | ScheduledJob>): Promise<unknown> {
  const data = job.data;
  switch (data.kind) {
    case "password_reset":
      return sendPasswordReset(data.userId, data.token);
    case "render_report":
      await renderSessionReport(data.sessionId);
      return null;
    case "session_report":
      return emailSessionReport(data.sessionId, data.userId);
    case "clean_up":
      return cleanUp();
    case "rotate_home_poll":
      return rotateHomePoll();
    case "refresh_samples":
      return refreshSamples();
  }
}

const worker = new Worker(QUEUE_NAME, run, {
  connection: createRedis("worker", { maxRetriesPerRequest: null }),
  prefix: BULL_PREFIX,
  // One report at a time: drawing a PDF is the heaviest thing this process does.
  concurrency: 1,
});

worker.on("completed", (job, result) => log.info({ job: job.name, result }, "job done"));
worker.on("failed", (job, error) => log.error({ job: job?.name, error: error.message }, "job failed"));

// Times in UTC. Kept clear of the minutes the other sites on this server use.
const queue = workQueue();
await queue.upsertJobScheduler("clean-up", { pattern: "20 * * * *" }, { name: "clean_up", data: { kind: "clean_up" } });
await queue.upsertJobScheduler(
  "rotate-home-poll",
  { pattern: "30 1 * * *" },
  { name: "rotate_home_poll", data: { kind: "rotate_home_poll" } },
);
await queue.upsertJobScheduler(
  "refresh-samples",
  { pattern: "40 1 * * *" },
  { name: "refresh_samples", data: { kind: "refresh_samples" } },
);

// Answers the deploy's question "did the new worker start?".
const health = createServer((request, response) => {
  if (request.url === "/health") {
    response.writeHead(200, { "content-type": "application/json", "x-release": config.RELEASE });
    response.end(JSON.stringify({ ok: worker.isRunning(), release: config.RELEASE }));
  } else {
    response.writeHead(404).end();
  }
});
health.listen(config.WORKER_HEALTH_PORT, "127.0.0.1");

const stopHealth = reportHealth("worker", config.MEMORY_LIMIT_MB, () => null);
log.info(`worker ${config.RELEASE.slice(0, 7)} running`);

let stopping = false;
async function stop(): Promise<void> {
  if (stopping) return;
  stopping = true;
  stopHealth();
  health.close();
  // A job in progress is allowed to finish; BullMQ hands back anything unfinished.
  await worker.close();
  await queue.close();
  await closeDatabase();
  redis.disconnect();
  process.exit(0);
}

process.on("SIGTERM", () => void stop());
process.on("SIGINT", () => void stop());
