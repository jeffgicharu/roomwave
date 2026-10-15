import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { HostSnapshot, LeaderboardEntry, PresentationDetail, QuizPersonalResult, Results, User } from "@roomwave/shared";

import { closeDatabase } from "../src/db/database.ts";
import { redis } from "../src/redis.ts";
import { Browser, eventually, next, phone, resetDatabase, startServer } from "./harness.ts";

let server: Awaited<ReturnType<typeof startServer>>;

beforeAll(async () => {
  await resetDatabase();
  server = await startServer();
});

afterAll(async () => {
  await server.close();
  await closeDatabase();
  redis.disconnect();
});

describe("a live session from start to end", () => {
  const presenter = () => new Browser(server.url);
  let browser: Browser;
  let presentation: PresentationDetail;
  let sessionId: string;
  let code: string;

  it("signs up, starting with the tour presentation", async () => {
    browser = presenter();
    const signup = await browser.request<{ user: User }>("POST", "/api/auth/signup", {
      name: "Wanjiru Test",
      email: "wanjiru.test@gmail.com",
      password: "a long enough password",
    });
    expect(signup.status).toBe(201);
    expect(signup.body.user.presentationCount).toBe(1);

    const list = await browser.request<{ presentations: { id: string }[] }>("GET", "/api/presentations");
    const detail = await browser.request<{ presentation: PresentationDetail }>(
      "GET",
      `/api/presentations/${list.body.presentations[0]!.id}`,
    );
    presentation = detail.body.presentation;
    expect(presentation.slides.map((s) => s.type)).toEqual([
      "content",
      "poll",
      "wordcloud",
      "scale",
      "quiz",
      "quiz",
      "qna",
      "content",
    ]);
  });

  it("refuses a change that does not come from the site", async () => {
    const response = await fetch(`${server.url}/api/presentations`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: browser.cookie, origin: "https://elsewhere.example" },
      body: JSON.stringify({ template: "blank" }),
    });
    expect(response.status).toBe(403);
  });

  it("starts presenting and gives a six-digit code", async () => {
    const started = await browser.request<{ sessionId: string; code: string }>(
      "POST",
      `/api/presentations/${presentation.id}/present`,
    );
    expect(started.status).toBe(200);
    expect(started.body.code).toMatch(/^[1-9]\d{5}$/);
    sessionId = started.body.sessionId;
    code = started.body.code;

    // Presenting again picks up the same session.
    const again = await browser.request<{ sessionId: string; code: string }>(
      "POST",
      `/api/presentations/${presentation.id}/present`,
    );
    expect(again.body).toEqual({ sessionId, code });
  });

  it("runs every kind of slide with phones in the room", async () => {
    const host = browser.host();
    const attached = await host.emitWithAck("attach", { sessionId });
    expect(attached.ok).toBe(true);
    const snapshot = (attached as { ok: true; snapshot: HostSnapshot }).snapshot;
    expect(snapshot.role).toBe("presenter");
    expect(snapshot.remoteToken).toBeTruthy();

    const hostResults = new Map<string, Results>();
    host.on("results", (slideId, results) => hostResults.set(slideId, results));

    // Three phones join.
    const phones = [phone(server.url), phone(server.url), phone(server.url)];
    const tokens: string[] = [];
    for (const p of phones) {
      const joined = await p.emitWithAck("join", { code, token: null });
      expect(joined.ok).toBe(true);
      if (joined.ok) tokens.push(joined.token);
    }

    // A wrong code says so.
    const lost = phone(server.url);
    expect(await lost.emitWithAck("join", { code: "999999", token: null })).toEqual({ ok: false, error: "not_found" });
    lost.close();

    // Multiple choice: phones follow the presenter to slide 2 and vote.
    const poll = presentation.slides[1]!;
    if (poll.type !== "poll") throw new Error("expected a poll");
    const viewed = next(phones[0]!, "view");
    expect(await host.emitWithAck("go", { index: 1 })).toEqual({ ok: true });
    const [view] = (await viewed) as [{ slide: { id: string } }];
    expect(view.slide.id).toBe(poll.id);

    const first = poll.config.options[0]!.id;
    const second = poll.config.options[1]!.id;
    expect(await phones[0]!.emitWithAck("respond", { slideId: poll.id, answer: { type: "poll", optionIds: [first] } })).toMatchObject({ ok: true });
    expect(await phones[1]!.emitWithAck("respond", { slideId: poll.id, answer: { type: "poll", optionIds: [first] } })).toMatchObject({ ok: true });
    expect(await phones[2]!.emitWithAck("respond", { slideId: poll.id, answer: { type: "poll", optionIds: [second] } })).toMatchObject({ ok: true });
    // Changing your mind replaces the vote rather than adding one.
    expect(await phones[2]!.emitWithAck("respond", { slideId: poll.id, answer: { type: "poll", optionIds: [first] } })).toMatchObject({ ok: true });
    await eventually(() => {
      const r = hostResults.get(poll.id);
      return r?.type === "poll" && r.respondents === 3 && r.counts[first] === 3;
    });
    // Two answers on a single-choice question are refused.
    expect(
      await phones[0]!.emitWithAck("respond", { slideId: poll.id, answer: { type: "poll", optionIds: [first, second] } }),
    ).toEqual({ ok: false, error: "invalid" });

    // Locked: no more answers.
    expect(await host.emitWithAck("update", { slideId: poll.id, locked: true })).toEqual({ ok: true });
    expect(await phones[0]!.emitWithAck("respond", { slideId: poll.id, answer: { type: "poll", optionIds: [second] } })).toEqual({ ok: false, error: "locked" });

    // Word cloud: blocked words are refused; each phone gives up to three.
    const cloud = presentation.slides[2]!;
    await host.emitWithAck("go", { index: 2 });
    expect(await phones[0]!.emitWithAck("respond", { slideId: cloud.id, answer: { type: "wordcloud", text: "sh1t" } })).toEqual({ ok: false, error: "blocked_word" });
    for (const word of ["Focus", "focus ", "energy", "growth"]) {
      await phones[0]!.emitWithAck("respond", { slideId: cloud.id, answer: { type: "wordcloud", text: word } });
    }
    expect(await phones[0]!.emitWithAck("respond", { slideId: cloud.id, answer: { type: "wordcloud", text: "fourth" } })).toEqual({ ok: false, error: "limit" });
    await phones[1]!.emitWithAck("respond", { slideId: cloud.id, answer: { type: "wordcloud", text: "focus" } });
    await eventually(() => {
      const r = hostResults.get(cloud.id);
      return r?.type === "wordcloud" && r.words[0]?.text === "focus" && r.words[0].count === 2 && r.entries === 4;
    });

    // A slide that is not on screen cannot be answered.
    expect(await phones[2]!.emitWithAck("respond", { slideId: poll.id, answer: { type: "poll", optionIds: [first] } })).toEqual({ ok: false, error: "not_current" });

    // Rating scale with an average.
    const scale = presentation.slides[3]!;
    await host.emitWithAck("go", { index: 3 });
    await phones[0]!.emitWithAck("respond", { slideId: scale.id, answer: { type: "scale", value: 5 } });
    await phones[1]!.emitWithAck("respond", { slideId: scale.id, answer: { type: "scale", value: 2 } });
    expect(await phones[2]!.emitWithAck("respond", { slideId: scale.id, answer: { type: "scale", value: 9 } })).toEqual({ ok: false, error: "invalid" });
    await eventually(() => {
      const r = hostResults.get(scale.id);
      return r?.type === "scale" && r.average === 3.5;
    });

    // Quiz: answers only while open; everyone answering reveals it at once.
    const quiz = presentation.slides[4]!;
    if (quiz.type !== "quiz") throw new Error("expected a quiz");
    await host.emitWithAck("go", { index: 4 });
    expect(await phones[0]!.emitWithAck("respond", { slideId: quiz.id, answer: { type: "quiz", optionId: quiz.config.correctOptionId } })).toEqual({ ok: false, error: "not_open" });
    expect(await host.emitWithAck("quiz", { slideId: quiz.id, action: "start" })).toEqual({ ok: true });

    const personal = phones.map((p) => next<[QuizPersonalResult]>(p, "quizResult", 6_000));
    const wrong = quiz.config.options.find((o) => o.id !== quiz.config.correctOptionId)!.id;
    await phones[0]!.emitWithAck("respond", { slideId: quiz.id, answer: { type: "quiz", optionId: quiz.config.correctOptionId } });
    await new Promise((r) => setTimeout(r, 300));
    await phones[1]!.emitWithAck("respond", { slideId: quiz.id, answer: { type: "quiz", optionId: quiz.config.correctOptionId } });
    await phones[2]!.emitWithAck("respond", { slideId: quiz.id, answer: { type: "quiz", optionId: wrong } });
    const [a, b, c] = (await Promise.all(personal)).map(([result]) => result);
    expect(a!.correct && a!.rank).toBe(1);
    expect(b!.correct && b!.rank).toBe(2);
    expect(b!.points).toBeLessThan(a!.points);
    expect(c).toMatchObject({ correct: false, points: 0, rank: 3, of: 3 });

    const boards = next<[string, LeaderboardEntry[]]>(phones[0]!, "leaderboard");
    expect(await host.emitWithAck("quiz", { slideId: quiz.id, action: "leaderboard" })).toEqual({ ok: true });
    const [, board] = await boards;
    expect(board.map((e) => e.rank)).toEqual([1, 2, 3]);

    // Q&A: ask, upvote someone else's, not your own; the presenter marks it answered.
    const qna = presentation.slides[6]!;
    await host.emitWithAck("go", { index: 6 });
    const asked = await phones[0]!.emitWithAck("ask", { slideId: qna.id, text: "When are the slides shared?", name: "Wanjiru" });
    expect(asked.ok).toBe(true);
    const questionId = asked.ok ? asked.question.id : "";
    expect(await phones[0]!.emitWithAck("upvote", { questionId, on: true })).toEqual({ ok: false, error: "invalid" });
    expect(await phones[1]!.emitWithAck("upvote", { questionId, on: true })).toEqual({ ok: true });
    expect(await phones[1]!.emitWithAck("upvote", { questionId, on: true })).toEqual({ ok: true });
    expect(await phones[2]!.emitWithAck("upvote", { questionId, on: true })).toEqual({ ok: true });
    await eventually(() => {
      const r = hostResults.get(qna.id);
      return r?.type === "qna" && r.questions[0]?.upvotes === 2;
    });
    expect(await host.emitWithAck("moderate", { questionId, status: "answered" })).toEqual({ ok: true });
    await eventually(() => {
      const r = hostResults.get(qna.id);
      return r?.type === "qna" && r.questions[0]?.status === "answered";
    });

    // A phone that drops and comes back is the same person, with its own question.
    phones[0]!.close();
    const back = phone(server.url);
    const rejoined = await back.emitWithAck("join", { code, token: tokens[0]! });
    expect(rejoined.ok && rejoined.mine).toMatchObject({ type: "qna", asked: [{ id: questionId }] });

    // The end: every phone is told.
    const endings = [back, phones[1]!, phones[2]!].map((p) => next(p, "ended"));
    expect(await host.emitWithAck("end", {})).toEqual({ ok: true });
    await Promise.all(endings);
    const late = phone(server.url);
    expect(await late.emitWithAck("join", { code, token: null })).toEqual({ ok: false, error: "ended" });

    for (const s of [back, phones[1]!, phones[2]!, late, host]) s.close();
  });

  it("keeps the results, exports them and refuses a stranger", async () => {
    const results = await browser.request<{ results: Record<string, Results>; session: { participants: number } }>(
      "GET",
      `/api/sessions/${sessionId}/results`,
    );
    expect(results.status).toBe(200);
    expect(results.body.session.participants).toBe(3);

    const csv = await fetch(`${server.url}/api/sessions/${sessionId}/export.csv`, { headers: { cookie: browser.cookie } });
    const text = await csv.text();
    expect(csv.headers.get("content-type")).toContain("text/csv");
    expect(text).toContain("How do you usually ask a question at a big event?");
    expect(text).toContain("The Nile (correct)");

    const stranger = new Browser(server.url);
    await stranger.request("POST", "/api/guest");
    const denied = await stranger.request("GET", `/api/sessions/${sessionId}/results`);
    expect(denied.status).toBe(404);
  });

  it("holds the free plan to its participant limit", async () => {
    const guest = new Browser(server.url);
    const created = await guest.request<{ user: User }>("POST", "/api/guest");
    expect(created.body.user.plan.plan).toBe("free");
    const list = await guest.request<{ presentations: { id: string }[] }>("GET", "/api/presentations");
    const started = await guest.request<{ sessionId: string; code: string }>(
      "POST",
      `/api/presentations/${list.body.presentations[0]!.id}/present`,
    );
    const { db } = await import("../src/db/database.ts");
    await db.updateTable("live_sessions").set({ participant_limit: 2 }).where("id", "=", started.body.sessionId).execute();
    const phones = [phone(server.url), phone(server.url), phone(server.url)];
    const replies = [];
    for (const p of phones) replies.push(await p.emitWithAck("join", { code: started.body.code, token: null }));
    expect(replies.map((r) => r.ok)).toEqual([true, true, false]);
    expect(replies[2]).toEqual({ ok: false, error: "full" });
    for (const p of phones) p.close();
  });
});
