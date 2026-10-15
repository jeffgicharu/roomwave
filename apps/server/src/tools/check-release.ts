// The gate a release must pass on the server before visitors reach it. It runs
// against the new release on its own port, with the live database and Redis:
//
//   node check-release.mjs --base http://127.0.0.1:8301 --release <commit>
//
// It signs in as a throwaway account, starts a session, joins it from a
// "phone" over WebSocket and from another over long-polling, votes, and waits
// for the presenter's screen to show the votes. Then it removes every trace.

import { parseArgs } from "node:util";

import { io, type Socket } from "socket.io-client";

import {
  NAMESPACES,
  SOCKET_PATH,
  type AudienceClientEvents,
  type AudienceServerEvents,
  type HomeClientEvents,
  type HomeServerEvents,
  type HostClientEvents,
  type HostServerEvents,
  type Results,
} from "@roomwave/shared";

import { config } from "../config.ts";
import { closeDatabase, db } from "../db/database.ts";
import { redis } from "../redis.ts";
import { hashToken, newToken } from "../security/tokens.ts";

const { values } = parseArgs({ options: { base: { type: "string" }, release: { type: "string" } } });
const base = values.base ?? `http://127.0.0.1:${config.PORT}`;
const expected = values.release;

let userId: string | null = null;
const sockets: Socket[] = [];

function step(name: string): void {
  console.log(`  ${name}`);
}

function within<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${what} took longer than ${ms} ms`)), ms)),
  ]);
}

async function main(): Promise<void> {
  step("health");
  const health = await fetch(`${base}/api/health`);
  if (health.status !== 200) throw new Error(`health answered ${health.status}`);
  const release = health.headers.get("x-release");
  if (expected && release !== expected) throw new Error(`the server is release ${release}, expected ${expected}`);

  step("sign in as a check account");
  const user = await db
    .insertInto("users")
    .values({ name: "Release check", is_guest: true, guest_expires_at: new Date(Date.now() + 600_000) })
    .returning("id")
    .executeTakeFirstOrThrow();
  userId = user.id;
  const token = newToken();
  await db
    .insertInto("auth_sessions")
    .values({ id: hashToken(token), user_id: user.id, expires_at: new Date(Date.now() + 600_000) })
    .execute();
  const cookie = `rw_session=${token}`;
  const api = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
    const response = await fetch(base + path, {
      method,
      headers: { cookie, origin: config.SITE_URL, ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) throw new Error(`${method} ${path} answered ${response.status}`);
    return (await response.json()) as T;
  };

  step("create and present a presentation");
  const { id } = await api<{ id: string }>("POST", "/api/presentations", { template: "welcome" });
  const { sessionId, code } = await api<{ sessionId: string; code: string }>("POST", `/api/presentations/${id}/present`);

  step("presenter's screen attaches");
  const host: Socket<HostServerEvents, HostClientEvents> = io(base + NAMESPACES.host, {
    path: SOCKET_PATH,
    transports: ["websocket"],
    extraHeaders: { cookie },
  });
  sockets.push(host);
  const attached = await within(host.emitWithAck("attach", { sessionId }), 5_000, "attaching");
  if (!attached.ok) throw new Error(`attach failed: ${attached.error}`);
  const slides = attached.snapshot.slides;
  const poll = slides.find((s) => s.type === "poll");
  if (!poll || poll.type !== "poll") throw new Error("the tour has no poll");

  step("two phones join, over WebSocket and over long-polling");
  const phones: Socket<AudienceServerEvents, AudienceClientEvents>[] = [
    io(base + NAMESPACES.audience, { path: SOCKET_PATH, transports: ["websocket"] }),
    io(base + NAMESPACES.audience, { path: SOCKET_PATH, transports: ["polling"] }),
  ];
  sockets.push(...phones);
  for (const phone of phones) {
    const joined = await within(phone.emitWithAck("join", { code, token: null }), 5_000, "joining");
    if (!joined.ok) throw new Error(`join failed: ${joined.error}`);
  }

  step("the phones vote and the presenter's screen counts them");
  const counted = new Promise<void>((resolve) => {
    host.on("results", (slideId: string, results: Results) => {
      if (slideId === poll.id && results.type === "poll" && results.respondents === 2) resolve();
    });
  });
  const go = await host.emitWithAck("go", { index: slides.indexOf(poll) });
  if (!go.ok) throw new Error(`moving to the poll failed: ${go.error}`);
  for (const phone of phones) {
    const reply = await within(
      phone.emitWithAck("respond", { slideId: poll.id, answer: { type: "poll", optionIds: [poll.config.options[0]!.id] } }),
      5_000,
      "voting",
    );
    if (!reply.ok) throw new Error(`vote refused: ${reply.error}`);
  }
  await within(counted, 5_000, "counting the votes");

  step("the home page's live poll answers");
  const home: Socket<HomeServerEvents, HomeClientEvents> = io(base + NAMESPACES.home, {
    path: SOCKET_PATH,
    transports: ["websocket"],
  });
  sockets.push(home);
  const hello = await within(home.emitWithAck("hello", { token: newToken(16) }), 5_000, "the home poll");
  if (!hello.poll) throw new Error("there is no home page question");

  step("end the session");
  const ended = await host.emitWithAck("end", {});
  if (!ended.ok) throw new Error(`ending failed: ${ended.error}`);
}

let failed = false;
try {
  console.log(`Checking ${base}`);
  await main();
  console.log("The release passed its check.");
} catch (error) {
  failed = true;
  console.error(`The release failed its check: ${error instanceof Error ? error.message : String(error)}`);
} finally {
  for (const socket of sockets) socket.close();
  if (userId) await db.deleteFrom("users").where("id", "=", userId).execute();
  await closeDatabase();
  redis.disconnect();
}
process.exit(failed ? 1 : 0);
