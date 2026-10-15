import type { Namespace, Socket } from "socket.io";

import { homeVoteSchema, type HomeClientEvents, type HomePoll, type HomeServerEvents, type HomeVoteReply } from "@roomwave/shared";

import { db } from "../db/database.ts";
import { hashToken } from "../security/tokens.ts";

export type HomeNamespace = Namespace<HomeClientEvents, HomeServerEvents>;
type HomeSocket = Socket<HomeClientEvents, HomeServerEvents>;

let current: { poll: HomePoll; at: number } | null = null;
let home: HomeNamespace | null = null;

export async function loadHomePoll(force = false): Promise<HomePoll | null> {
  if (!force && current && Date.now() - current.at < 2_000) return current.poll;
  const poll = await db.selectFrom("home_polls").selectAll().where("active", "=", true).executeTakeFirst();
  if (!poll) return null;
  const rows = await db
    .selectFrom("home_votes")
    .select(["option_id", (eb) => eb.fn.countAll<number>().as("count")])
    .where("poll_id", "=", poll.id)
    .groupBy("option_id")
    .execute();
  const counts = Object.fromEntries(rows.map((row) => [row.option_id, Number(row.count)]));
  const result: HomePoll = {
    id: poll.id,
    question: poll.question,
    options: poll.options,
    counts,
    total: rows.reduce((sum, row) => sum + Number(row.count), 0),
  };
  current = { poll: result, at: Date.now() };
  return result;
}

let broadcastTimer: NodeJS.Timeout | null = null;
function scheduleBroadcast(): void {
  if (broadcastTimer) return;
  broadcastTimer = setTimeout(async () => {
    broadcastTimer = null;
    const poll = await loadHomePoll(true).catch(() => null);
    if (poll) home?.emit("poll", poll);
  }, 250);
}

/**
 * The worker changes the question each night. Every minute each web process
 * looks for a new one and sends it to the pages that are open.
 */
export function watchHomePoll(): NodeJS.Timeout {
  let shownId: string | null = null;
  return setInterval(async () => {
    const poll = await loadHomePoll(true).catch(() => null);
    if (poll && shownId && poll.id !== shownId) home?.emit("poll", poll);
    shownId = poll?.id ?? shownId;
  }, 60_000);
}

export function registerHome(ns: HomeNamespace): void {
  home = ns;
  ns.on("connection", (socket: HomeSocket) => {
    let votes = 0;

    socket.on("hello", async (payload, ack) => {
      if (typeof ack !== "function") return;
      try {
        const poll = await loadHomePoll();
        let mine: string | null = null;
        if (poll && typeof payload?.token === "string" && payload.token.length <= 64) {
          const vote = await db
            .selectFrom("home_votes")
            .select("option_id")
            .where("poll_id", "=", poll.id)
            .where("token_hash", "=", hashToken(payload.token))
            .executeTakeFirst();
          mine = vote?.option_id ?? null;
        }
        ack({ poll, mine });
      } catch (error) {
        console.error("home hello failed", error);
        ack({ poll: null, mine: null });
      }
    });

    socket.on("vote", async (payload, ack) => {
      const reply = (r: HomeVoteReply) => (typeof ack === "function" ? ack(r) : undefined);
      if (++votes > 10) return reply({ ok: false, error: "busy" });
      const input = homeVoteSchema.safeParse(payload);
      if (!input.success) return reply({ ok: false, error: "invalid" });
      try {
        const poll = await loadHomePoll();
        if (!poll || poll.id !== input.data.pollId) return reply({ ok: false, error: "closed" });
        if (!poll.options.some((o) => o.id === input.data.optionId)) return reply({ ok: false, error: "invalid" });
        // One vote per browser per question; voting again changes the answer.
        await db
          .insertInto("home_votes")
          .values({ poll_id: poll.id, token_hash: hashToken(input.data.token), option_id: input.data.optionId })
          .onConflict((oc) => oc.columns(["poll_id", "token_hash"]).doUpdateSet({ option_id: input.data.optionId }))
          .execute();
        reply({ ok: true, optionId: input.data.optionId });
        scheduleBroadcast();
      } catch (error) {
        console.error("home vote failed", error);
        reply({ ok: false, error: "busy" });
      }
    });
  });
}
