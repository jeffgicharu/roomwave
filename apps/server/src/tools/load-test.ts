// A room full of phones, run from a machine other than the server:
//
//   LOAD_EMAIL=… LOAD_PASSWORD=… node src/tools/load-test.ts \
//     --base https://roomwave.jeffgicharu.com --phones 500 --rate 20
//
// It signs in as a presenter whose plan allows the room size, presents a copy
// of the tour, joins the phones a few each second, and runs the poll, the word
// cloud and the quiz with every phone answering within a few seconds. It
// prints how long answers took to be accepted and to reach the presenter's
// screen. With LOAD_STAFF_EMAIL and LOAD_STAFF_PASSWORD set it also samples
// each server process's memory from the staff health page. At the end the
// session is ended and the presentation, with its results, is deleted.

import { parseArgs } from "node:util";

import { io, type Socket } from "socket.io-client";

import {
  NAMESPACES,
  SOCKET_PATH,
  type Answer,
  type AudienceClientEvents,
  type AudienceServerEvents,
  type HostClientEvents,
  type HostServerEvents,
  type PresentationDetail,
  type Results,
  type Slide,
  type StaffHealth,
} from "@roomwave/shared";

type Phone = Socket<AudienceServerEvents, AudienceClientEvents>;
type Host = Socket<HostServerEvents, HostClientEvents>;

const { values } = parseArgs({
  options: {
    base: { type: "string" },
    phones: { type: "string" },
    rate: { type: "string" },
    spread: { type: "string" },
    hold: { type: "string" },
    origin: { type: "string" },
    template: { type: "string" },
    title: { type: "string" },
    keep: { type: "boolean" },
  },
});
const base = values.base ?? "http://127.0.0.1:8300";
/** The site the requests say they come from; the server accepts only its own. */
const origin = values.origin ?? base;
const phoneCount = Number(values.phones ?? 100);
/** New connections a second; nginx allows a little more than this from one address. */
const rate = Number(values.rate ?? 20);
/** Answers are sent at random within this many milliseconds, as a room does. */
const spread = Number(values.spread ?? 5_000);
/** Seconds to stay connected and quiet after the last question. */
const hold = Number(values.hold ?? 60);
const template = values.template ?? "welcome";
/** Leave the session running and the presentation in place, to look at afterwards. */
const keep = values.keep ?? false;

// Cloudflare checks browsers; the test introduces itself as an ordinary phone.
const USER_AGENT = "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36";
// Ordered from most to least common, as a real room answers.
const WORDS = ["busy", "hopeful", "focused", "stretched", "excited", "steady", "busy but good", "curious", "proud", "tired", "optimistic", "learning", "energised", "uncertain"];
const QUESTIONS = [
  "Will the new targets change how bonuses are worked out?",
  "When will the new office layout be ready?",
  "How will we hire for the growth you described?",
  "Can we get the slides after the session?",
  "What happens to the projects that were paused?",
  "Is remote work on Fridays staying?",
  "How do we put forward ideas for next quarter?",
  "Which team will lead the customer portal?",
];

/** A random index from 0 to n - 1 where earlier ones come up more often. */
function skewed(n: number): number {
  return Math.min(n - 1, Math.floor(n * Math.random() ** 1.8));
}

/** A rating that leans positive but uses the whole scale. */
function rating(max: number): number {
  const value = max * 0.7 + max * 0.25 * (Math.random() + Math.random() + Math.random() - 1.5) * 1.5;
  return Math.max(1, Math.min(max, Math.round(value)));
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const now = () => performance.now();

function percentile(list: number[], p: number): number {
  if (!list.length) return Number.NaN;
  const sorted = [...list].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]!;
}

function ms(value: number): string {
  return Number.isFinite(value) ? `${Math.round(value)} ms` : "–";
}

async function until(test: () => boolean, timeoutMs: number): Promise<boolean> {
  const end = now() + timeoutMs;
  while (now() < end) {
    if (test()) return true;
    await sleep(50);
  }
  return test();
}

async function signIn(email: string, password: string): Promise<string> {
  const response = await fetch(`${base}/api/auth/signin`, {
    method: "POST",
    headers: { "content-type": "application/json", origin, "user-agent": USER_AGENT },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) throw new Error(`signing in as ${email} answered ${response.status}`);
  const cookie = response.headers
    .getSetCookie()
    .map((c) => c.split(";")[0]!)
    .find((c) => c.startsWith("rw_session="));
  if (!cookie) throw new Error("signing in gave no session cookie");
  return cookie;
}

function client(cookie: string) {
  return async <T>(method: string, path: string, body?: unknown): Promise<T> => {
    const response = await fetch(base + path, {
      method,
      headers: { cookie, origin, "user-agent": USER_AGENT, ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) throw new Error(`${method} ${path} answered ${response.status}: ${(await response.text()).slice(0, 300)}`);
    return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
  };
}

async function main(): Promise<void> {
  const email = process.env.LOAD_EMAIL;
  const password = process.env.LOAD_PASSWORD;
  if (!email || !password) throw new Error("Set LOAD_EMAIL and LOAD_PASSWORD for a presenter whose plan allows the room size.");
  console.log(`Load test against ${base}: ${phoneCount} phones joining ${rate} a second.`);

  const api = client(await signIn(email, password));
  const presenterCookie = await signIn(email, password);

  // Memory and event loop delay of each server process, sampled every five seconds.
  const peaks = new Map<string, { memoryMb: number; limitMb: number; delayMs: number; atRest: number }>();
  let sampler: ReturnType<typeof setInterval> | undefined;
  if (process.env.LOAD_STAFF_EMAIL && process.env.LOAD_STAFF_PASSWORD) {
    const staff = client(await signIn(process.env.LOAD_STAFF_EMAIL, process.env.LOAD_STAFF_PASSWORD));
    const sample = async () => {
      const health = await staff<StaffHealth>("GET", "/api/staff/health");
      for (const p of health.processes) {
        const before = peaks.get(p.name);
        peaks.set(p.name, {
          memoryMb: Math.max(before?.memoryMb ?? 0, p.memoryMb),
          limitMb: p.limitMb,
          delayMs: Math.max(before?.delayMs ?? 0, p.eventLoopDelayMs),
          atRest: before?.atRest ?? p.memoryMb,
        });
      }
    };
    await sample();
    sampler = setInterval(() => void sample().catch(() => {}), 5_000);
  }

  const sockets: Socket[] = [];
  let presentationId: string | null = null;
  let host: Host | null = null;
  try {
    ({ id: presentationId } = await api<{ id: string }>("POST", "/api/presentations", { template }));
    if (values.title) {
      const { presentation: doc } = await api<{ presentation: PresentationDetail }>("GET", `/api/presentations/${presentationId}`);
      await api("PUT", `/api/presentations/${presentationId}`, { doc: { title: values.title, theme: doc.theme, slides: doc.slides }, version: doc.version });
    }
    const { sessionId, code } = await api<{ sessionId: string; code: string }>("POST", `/api/presentations/${presentationId}/present`);

    host = io(base + NAMESPACES.host, {
      path: SOCKET_PATH,
      transports: ["websocket"],
      extraHeaders: { cookie: presenterCookie, origin, "user-agent": USER_AGENT },
    });
    sockets.push(host);
    const attached = await host.timeout(10_000).emitWithAck("attach", { sessionId });
    if (!attached.ok) throw new Error(`the presenter could not attach: ${attached.error}`);
    const slides: Slide[] = attached.snapshot.slides;

    // What the presenter's screen shows, slide by slide, as it arrives.
    const screen = new Map<string, { at: number; respondents: number }[]>();
    host.on("results", (slideId: string, results: Results) => {
      const respondents = "respondents" in results ? results.respondents : 0;
      screen.set(slideId, [...(screen.get(slideId) ?? []), { at: now(), respondents }]);
    });
    const shown = (slideId: string) => screen.get(slideId)?.at(-1)?.respondents ?? 0;

    // The room fills up.
    const joinTimes: number[] = [];
    let refused = 0;
    /** What the room is doing, so a dropped connection can be placed. */
    let phase = "filling";
    const drops: { phase: string; reason: string }[] = [];
    let rejoined = 0;
    const phones: Phone[] = [];
    const filling = now();
    for (let i = 0; i < phoneCount; i++) {
      const started = now();
      const phone: Phone = io(base + NAMESPACES.audience, {
        path: SOCKET_PATH,
        transports: ["websocket"],
        extraHeaders: { origin, "user-agent": USER_AGENT },
      });
      let token: string | null = null;
      phone.on("disconnect", (reason) => drops.push({ phase, reason }));
      // Like the phone page, join again with the same token after a reconnect, as the same person.
      phone.io.on("reconnect", () => {
        phone
          .timeout(30_000)
          .emitWithAck("join", { code, token })
          .then((reply) => (reply.ok ? (rejoined += 1) : undefined))
          .catch(() => undefined);
      });
      phones.push(phone);
      sockets.push(phone);
      phone
        .timeout(30_000)
        .emitWithAck("join", { code, token: null })
        .then((reply) => {
          if (!reply.ok) return void (refused += 1);
          token = reply.token;
          joinTimes.push(now() - started);
        })
        .catch(() => (refused += 1));
      await sleep(1000 / rate);
    }
    await until(() => joinTimes.length + refused >= phoneCount, 30_000);
    console.log(
      `Joined: ${joinTimes.length} of ${phoneCount} in ${ms(now() - filling)}, refused ${refused}. ` +
        `Connect and join took p50 ${ms(percentile(joinTimes, 50))}, p95 ${ms(percentile(joinTimes, 95))}.`,
    );

    const assertHost = host;

    /** A few phones ask, the presenter shows each question, and the room upvotes. */
    async function questions(slide: Slide): Promise<void> {
      phase = "qna";
      const go = await assertHost.emitWithAck("go", { index: slides.indexOf(slide) });
      if (!go.ok) throw new Error(`moving to the questions failed: ${go.error}`);
      await sleep(1_500);
      const askers = phones.slice(0, Math.min(QUESTIONS.length, Math.max(1, Math.round(phones.length / 12))));
      const asked: string[] = [];
      await Promise.all(
        askers.map(async (phone, i) => {
          await sleep(Math.random() * spread);
          const reply = await phone.timeout(15_000).emitWithAck("ask", { slideId: slide.id, text: QUESTIONS[i]!, name: null }).catch(() => null);
          if (reply?.ok) asked.push(reply.question.id);
        }),
      );
      for (const questionId of asked) await assertHost.emitWithAck("moderate", { questionId, status: "live" });
      let upvotes = 0;
      /** Why upvotes were refused: "invalid" is a phone upvoting its own question, which the server does not allow. */
      const refusals = new Map<string, number>();
      await Promise.all(
        phones.map(async (phone) => {
          await sleep(Math.random() * spread);
          const questionId = asked[skewed(asked.length)];
          if (!questionId) return;
          const reply = await phone.timeout(15_000).emitWithAck("upvote", { questionId, on: true }).catch(() => null);
          if (reply?.ok) upvotes += 1;
          else {
            const why = reply ? reply.error : "no reply";
            refusals.set(why, (refusals.get(why) ?? 0) + 1);
          }
        }),
      );
      const refused = [...refusals].map(([why, n]) => `${n} ${why}`).join(", ");
      console.log(`qna       asked ${asked.length} of ${askers.length}, upvotes accepted ${upvotes} of ${phones.length}${refused ? ` (refused: ${refused})` : ""}.`);
    }
    async function round(slide: Slide, answer: (i: number) => Answer, before?: () => Promise<void>): Promise<void> {
      phase = slide.type;
      const go = await assertHost.emitWithAck("go", { index: slides.indexOf(slide) });
      if (!go.ok) throw new Error(`moving to ${slide.type} failed: ${go.error}`);
      await sleep(1_500);
      if (before) await before();
      const accepted: { sentAt: number; ackAt: number }[] = [];
      let failed = 0;
      await Promise.all(
        phones.map(
          (phone, i) =>
            new Promise<void>((resolve) => {
              setTimeout(() => {
                const sentAt = now();
                phone
                  .timeout(15_000)
                  .emitWithAck("respond", { slideId: slide.id, answer: answer(i) })
                  .then((reply) => (reply.ok ? accepted.push({ sentAt, ackAt: now() }) : (failed += 1)))
                  .catch(() => (failed += 1))
                  .finally(resolve);
              }, Math.random() * spread);
            }),
        ),
      );
      await until(() => shown(slide.id) >= accepted.length, 10_000);
      // The k-th answer the server accepted is on screen once the count reaches k.
      const events = screen.get(slide.id) ?? [];
      const order = [...accepted].sort((a, b) => a.ackAt - b.ackAt);
      const toScreen = order
        .map((vote, k) => (events.find((e) => e.respondents >= k + 1 && e.at >= vote.sentAt)?.at ?? Number.NaN) - vote.sentAt)
        .filter(Number.isFinite);
      const acks = accepted.map((v) => v.ackAt - v.sentAt);
      console.log(
        `${slide.type.padEnd(9)} accepted ${accepted.length}, failed ${failed}, screen shows ${shown(slide.id)}. ` +
          `Accepted in p50 ${ms(percentile(acks, 50))}, p95 ${ms(percentile(acks, 95))}. ` +
          `On screen in p50 ${ms(percentile(toScreen, 50))}, p95 ${ms(percentile(toScreen, 95))}, slowest ${ms(Math.max(...toScreen))}.`,
      );
    }

    for (const slide of slides) {
      if (slide.type === "poll") {
        // Each slide favours a different answer, so the charts do not all look alike.
        const order = slide.config.options.map((o) => o.id).sort(() => Math.random() - 0.5);
        await round(slide, () => ({ type: "poll", optionIds: [order[skewed(order.length)]!] }));
      } else if (slide.type === "scale") {
        const max = slide.config.max;
        await round(slide, () => ({ type: "scale", value: rating(max) }));
      } else if (slide.type === "wordcloud") {
        await round(slide, () => ({ type: "wordcloud", text: WORDS[skewed(WORDS.length)]! }));
      } else if (slide.type === "quiz") {
        const { correctOptionId, options } = slide.config;
        const wrong = options.filter((o) => o.id !== correctOptionId).map((o) => o.id);
        await round(
          slide,
          () => ({ type: "quiz", optionId: Math.random() < 0.6 ? correctOptionId : wrong[skewed(wrong.length)]! }),
          async () => {
            const started = await assertHost.emitWithAck("quiz", { slideId: slide.id, action: "start" });
            if (!started.ok) throw new Error(`starting the quiz failed: ${started.error}`);
          },
        );
      } else if (slide.type === "qna") {
        await questions(slide);
      }
    }

    console.log(`Holding the room for ${hold} s.`);
    phase = "holding";
    await sleep(hold * 1000);
    const why = new Map<string, number>();
    for (const drop of drops) why.set(`${drop.reason} while ${drop.phase}`, (why.get(`${drop.reason} while ${drop.phase}`) ?? 0) + 1);
    console.log(
      `Dropped connections during the test: ${drops.length}` +
        (drops.length ? ` (${[...why].map(([what, n]) => `${n} ${what}`).join("; ")}), rejoined ${rejoined}.` : "."),
    );

    if (keep) {
      console.log(`Kept: session ${sessionId}, code ${code}, presentation ${presentationId}.`);
    } else {
      const ended = await host.emitWithAck("end", {});
      if (!ended.ok) console.log(`Ending the session failed: ${ended.error}`);
    }
  } finally {
    for (const socket of sockets) socket.close();
    if (sampler) clearInterval(sampler);
    if (presentationId && !keep) await api("DELETE", `/api/presentations/${presentationId}`).catch(() => console.log("The test presentation could not be deleted."));
    for (const [name, peak] of peaks) {
      console.log(`${name}: memory ${peak.atRest} MB at the start, ${peak.memoryMb} MB at the peak of ${peak.limitMb} MB; event loop delay up to ${peak.delayMs} ms.`);
    }
  }
}

main().then(
  () => process.exit(0),
  (error: unknown) => {
    console.error(`The load test stopped: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  },
);
