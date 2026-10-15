import { Queue } from "bullmq";

import { config } from "../config.ts";
import { createRedis } from "../redis.ts";

export const QUEUE_NAME = "work";
export const BULL_PREFIX = `${config.REDIS_PREFIX}bull`;

export type JobData =
  | { kind: "password_reset"; userId: string; token: string }
  | { kind: "session_report"; sessionId: string; userId: string }
  | { kind: "render_report"; sessionId: string };

let queue: Queue | null = null;

/** Jobs are added from the web process and run by the worker. */
export function workQueue(): Queue {
  if (!queue) {
    queue = new Queue(QUEUE_NAME, {
      connection: createRedis("queue", { maxRetriesPerRequest: null }),
      prefix: BULL_PREFIX,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 5_000 },
        // Finished jobs are kept briefly and in small numbers: Redis memory is shared.
        removeOnComplete: { count: 100, age: 86_400 },
        removeOnFail: { count: 200, age: 7 * 86_400 },
      },
    });
  }
  return queue;
}

export async function enqueue(data: JobData, jobId?: string): Promise<void> {
  await workQueue().add(data.kind, data, jobId ? { jobId } : {});
}
