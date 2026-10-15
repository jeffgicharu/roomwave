// Adds whatever is missing from the site's starting data. Safe to run on
// every deploy: anything that already exists is left alone.

import { sql } from "kysely";

import {
  newId,
  presentationFromTemplate,
  quizPoints,
  templateById,
  type Slide,
} from "@roomwave/shared";

import { closeDatabase, db } from "../db/database.ts";
import { randomName } from "../live/names.ts";
import { hashPassword } from "../security/passwords.ts";
import { hashToken, newToken } from "../security/tokens.ts";
import { SAMPLE_CUSTOMERS, SAMPLE_REQUESTS, TRAINING_STAFF } from "../samples.ts";

const HOME_POLLS: { question: string; options: string[] }[] = [
  {
    question: "How do you prefer to ask a question at a big event?",
    options: ["Raise my hand", "Send it from my phone", "Ask the speaker afterwards", "I rarely ask"],
  },
  {
    question: "What makes a meeting worth your time?",
    options: ["A clear agenda", "Ending on time", "Real decisions", "Everyone gets a say"],
  },
  {
    question: "What do audiences dislike most?",
    options: ["Slides full of text", "Running over time", "No chance to ask questions", "Microphone trouble"],
  },
  {
    question: "How many meetings did you sit through this week?",
    options: ["None", "One to three", "Four to ten", "More than ten"],
  },
  {
    question: "What is the best way to start a workshop?",
    options: ["An icebreaker", "Straight into the content", "A quick poll", "Introductions round the room"],
  },
];

async function seedHomePolls(): Promise<void> {
  const existing = await db.selectFrom("home_polls").select("id").execute();
  if (existing.length) return;
  await db
    .insertInto("home_polls")
    .values(
      HOME_POLLS.map((poll, position) => ({
        question: poll.question,
        options: JSON.stringify(poll.options.map((label) => ({ id: newId(6), label }))),
        position,
        active: position === 0,
        activated_at: position === 0 ? new Date() : null,
      })),
    )
    .execute();
  console.log("Added the home page questions.");
}

async function seedStaff(): Promise<void> {
  const email = process.env.SEED_STAFF_EMAIL ?? "amani@roomwave.jeffgicharu.com";
  const existing = await db
    .selectFrom("users")
    .select("id")
    .where((eb) => eb(eb.fn("lower", ["email"]), "=", email.toLowerCase()))
    .executeTakeFirst();
  if (existing) return;
  const password = process.env.SEED_STAFF_PASSWORD;
  if (!password || password.length < 10) {
    console.log("No staff account yet: set SEED_STAFF_PASSWORD (10 characters or more) to create one.");
    return;
  }
  await db
    .insertInto("users")
    .values({
      name: "Amani Odhiambo",
      email,
      password_hash: await hashPassword(password),
      role: "staff",
      organisation: "Roomwave",
    })
    .execute();
  console.log(`Added the staff account ${email}.`);
}


const WORDS = ["clarity", "teamwork", "energy", "focus", "growth", "trust", "speed", "fun", "learning", "balance", "curious", "ready", "busy", "hopeful"];
const QUESTIONS = [
  "How will this change affect teams outside Nairobi?",
  "Can we get the slides after the session?",
  "What support is there for first-time managers?",
  "When will the new tools be rolled out?",
  "How do we measure success for this plan?",
  "Is there funding for training next quarter?",
  "Will there be a follow-up session?",
];

const FIRST_NAMES = ["Brian", "Achieng", "Kevin", "Wanjiru", "Faith", "Hassan", "Mercy", "Dennis", "Naliaka", "Collins"];

/** Ratings that lean positive but use the whole scale, as real audiences do. */
function sampleRating(max: number): number {
  const centre = max * 0.72;
  const spread = max * 0.22;
  const value = centre + spread * (Math.random() + Math.random() + Math.random() - 1.5) * 1.6;
  return Math.max(1, Math.min(max, Math.round(value)));
}

function pick<T>(items: readonly T[], weights?: number[]): T {
  if (!weights) return items[Math.floor(Math.random() * items.length)]!;
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    roll -= weights[i]!;
    if (roll <= 0) return items[i]!;
  }
  return items[items.length - 1]!;
}

async function seedSampleSession(ownerId: string, presentationId: string, slides: Slide[], title: string, people: number, daysAgo: number) {
  const startedAt = new Date(Date.now() - daysAgo * 86_400_000 - 3 * 3_600_000);
  const endedAt = new Date(startedAt.getTime() + 75 * 60_000);
  const session = await db
    .insertInto("live_sessions")
    .values({
      presentation_id: presentationId,
      owner_id: ownerId,
      code: String(100000 + Math.floor(Math.random() * 900000)),
      title,
      theme: "ink",
      slides: JSON.stringify(slides),
      slide_states: JSON.stringify({}),
      remote_token: newToken(24),
      participant_limit: 2000,
      started_at: startedAt,
      ended_at: endedAt,
      last_activity_at: endedAt,
    })
    .returning("id")
    .executeTakeFirstOrThrow();

  const participants = await db
    .insertInto("participants")
    .values(Array.from({ length: people }, () => ({ session_id: session.id, token_hash: hashToken(newToken()), name: randomName(), joined_at: startedAt })))
    .returning("id")
    .execute();

  for (const slide of slides) {
    const answering = participants.filter(() => Math.random() < 0.88);
    if (slide.type === "poll") {
      const weights = slide.config.options.map((_, i) => 4 - Math.min(i, 3) + Math.random() * 2);
      await db
        .insertInto("responses")
        .values(answering.map((p) => ({ session_id: session.id, slide_id: slide.id, participant_id: p.id, kind: "poll" as const, option_ids: [pick(slide.config.options, weights).id] })))
        .execute();
    } else if (slide.type === "scale") {
      await db
        .insertInto("responses")
        .values(answering.map((p) => ({ session_id: session.id, slide_id: slide.id, participant_id: p.id, kind: "scale" as const, value: sampleRating(slide.config.max) })))
        .execute();
    } else if (slide.type === "quiz") {
      await db
        .insertInto("responses")
        .values(
          answering.map((p) => {
            const correct = Math.random() < 0.62;
            const option = correct ? slide.config.correctOptionId : pick(slide.config.options.filter((o) => o.id !== slide.config.correctOptionId)).id;
            const elapsed = Math.round(1500 + Math.random() * slide.config.timeLimit * 800);
            return { session_id: session.id, slide_id: slide.id, participant_id: p.id, kind: "quiz" as const, option_id: option, correct, points: quizPoints(correct, elapsed, slide.config.timeLimit), elapsed_ms: elapsed };
          }),
        )
        .execute();
    } else if (slide.type === "wordcloud") {
      const rows = answering.flatMap((p) => {
        const words = new Set<string>();
        const count = 1 + Math.floor(Math.random() * slide.config.maxEntries);
        while (words.size < count) words.add(pick(WORDS, WORDS.map((_, i) => 14 - i)));
        return [...words].map((word) => ({ session_id: session.id, slide_id: slide.id, participant_id: p.id, kind: "wordcloud" as const, word }));
      });
      if (rows.length) await db.insertInto("responses").values(rows).execute();
    } else if (slide.type === "qna") {
      const askers = participants.slice(0, Math.min(QUESTIONS.length, Math.ceil(people / 12)));
      for (const [i, p] of askers.entries()) {
        await db
          .insertInto("questions")
          .values({ session_id: session.id, slide_id: slide.id, participant_id: p.id, text: QUESTIONS[i]!, name: i % 2 ? pick(FIRST_NAMES) : null, status: i < 2 ? "answered" : "live", upvotes: Math.floor(Math.random() * people * 0.3), created_at: startedAt })
          .execute();
      }
    }
  }
  // Answers were given during the session, not when this script ran.
  await sql`update responses set created_at = ${startedAt}::timestamptz + random() * interval '70 minutes' where session_id = ${session.id}`.execute(db);
  await sql`update responses set updated_at = created_at where session_id = ${session.id}`.execute(db);
}

async function seedSampleCustomers(): Promise<void> {
  const existing = await db.selectFrom("users").select("id").where("is_sample", "=", true).executeTakeFirst();
  if (existing) return;
  // Nobody signs in to a sample account, so each gets a long random password.
  for (const customer of SAMPLE_CUSTOMERS) {
    const created = new Date(Date.now() - customer.daysAgo * 86_400_000 - Math.random() * 8 * 3_600_000);
    const user = await db
      .insertInto("users")
      .values({
        name: customer.name,
        email: customer.email,
        password_hash: await hashPassword(newToken()),
        plan: customer.plan,
        organisation: customer.organisation,
        trial_ends_at: customer.trialDays ? new Date(Date.now() + customer.trialDays * 86_400_000) : null,
        is_sample: true,
        created_at: created,
        last_active_at: new Date(Date.now() - Math.random() * Math.min(customer.daysAgo, 5) * 86_400_000),
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    if (!customer.session) continue;
    const template = templateById(customer.session.template)!;
    const doc = presentationFromTemplate(template);
    const title = customer.session.title ?? doc.title;
    const presentation = await db
      .insertInto("presentations")
      .values({ owner_id: user.id, title, theme: doc.theme, slides: JSON.stringify(doc.slides), created_at: created, updated_at: created })
      .returning("id")
      .executeTakeFirstOrThrow();
    await seedSampleSession(user.id, presentation.id, doc.slides, title, customer.session.people, customer.session.daysAgo);
  }
  await db
    .insertInto("contact_requests")
    .values(
      SAMPLE_REQUESTS.map((r) => ({
        name: r.name,
        email: r.email,
        organisation: r.organisation,
        topic: r.topic,
        message: r.message,
        is_sample: true,
        created_at: sql<Date>`now() - make_interval(hours => ${r.hoursAgo})`,
        handled_at: r.handledHoursAgo === undefined ? null : sql<Date>`now() - make_interval(hours => ${r.handledHoursAgo})`,
      })),
    )
    .execute();
  console.log(`Added ${SAMPLE_CUSTOMERS.length} sample customers.`);
}

/**
 * Every sample customer has a few presentations of their own, some already
 * run. Each is added by title, so one that exists is left alone.
 */
async function seedSampleDecks(): Promise<void> {
  let added = 0;
  for (const customer of SAMPLE_CUSTOMERS) {
    if (!customer.decks?.length) continue;
    const user = await db.selectFrom("users").select(["id", "created_at"]).where("email", "=", customer.email).where("is_sample", "=", true).executeTakeFirst();
    if (!user) continue;
    for (const deck of customer.decks) {
      const exists = await db.selectFrom("presentations").select("id").where("owner_id", "=", user.id).where("title", "=", deck.title).executeTakeFirst();
      if (exists) continue;
      const doc = presentationFromTemplate(templateById(deck.template)!);
      // Made a couple of days before it was used, after the account existed, and never in the future.
      const made = new Date(Math.min(Date.now() - 600_000, Math.max(user.created_at.getTime() + 3_600_000, Date.now() - (deck.daysAgo + 2) * 86_400_000)));
      const presentation = await db
        .insertInto("presentations")
        .values({ owner_id: user.id, title: deck.title, theme: doc.theme, slides: JSON.stringify(doc.slides), created_at: made, updated_at: made })
        .returning("id")
        .executeTakeFirstOrThrow();
      if (deck.people) await seedSampleSession(user.id, presentation.id, doc.slides, deck.title, deck.people, deck.daysAgo);
      added++;
    }
  }
  if (added) console.log(`Added ${added} presentations to sample customers.`);
}

/** A sample customer was last seen no earlier than their latest session ended. */
async function alignSampleActivity(): Promise<void> {
  await sql`
    update users u
       set last_active_at = s.last
      from (select owner_id, max(ended_at) as last from live_sessions where ended_at is not null group by owner_id) s
     where u.id = s.owner_id
       and u.is_sample
       and (u.last_active_at is null or u.last_active_at < s.last)`.execute(db);
}

/** The staff account visitors are shown: it reaches sample customers only. Nobody signs in to it with a password. */
async function seedTrainingStaff(): Promise<void> {
  const existing = await db.selectFrom("users").select("id").where("email", "=", TRAINING_STAFF.email).executeTakeFirst();
  if (existing) return;
  await db
    .insertInto("users")
    .values({
      name: TRAINING_STAFF.name,
      email: TRAINING_STAFF.email,
      password_hash: await hashPassword(newToken()),
      role: "staff",
      organisation: "Roomwave",
      is_sample: true,
    })
    .execute();
  console.log("Added the staff training account.");
}

await seedHomePolls();
await seedStaff();
await seedTrainingStaff();
await seedSampleCustomers();
await seedSampleDecks();
await alignSampleActivity();
await closeDatabase();
