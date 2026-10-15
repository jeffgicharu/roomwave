import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { User } from "@roomwave/shared";

import { closeDatabase, db } from "../src/db/database.ts";
import { refreshSamples } from "../src/jobs/handlers.ts";
import { redis } from "../src/redis.ts";
import { TRAINING_STAFF } from "../src/samples.ts";
import { Browser, resetDatabase, startServer } from "./harness.ts";

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

describe("the staff training account", () => {
  let training: Browser;
  let sampleId: string;
  let realId: string;
  let realSessionId: string;

  beforeAll(async () => {
    // A real customer with a session of their own.
    const customer = new Browser(server.url);
    const signup = await customer.request<{ user: User }>("POST", "/api/auth/signup", {
      name: "Real Customer",
      email: "real.customer@gmail.com",
      password: "a long enough password",
    });
    realId = signup.body.user.id;
    const list = await customer.request<{ presentations: { id: string }[] }>("GET", "/api/presentations");
    const started = await customer.request<{ sessionId: string }>("POST", `/api/presentations/${list.body.presentations[0]!.id}/present`);
    realSessionId = started.body.sessionId;

    const sample = await db
      .insertInto("users")
      .values({ name: "Sample Customer", email: "sample.customer@gmail.com", is_sample: true, password_hash: "x" })
      .returning("id")
      .executeTakeFirstOrThrow();
    sampleId = sample.id;
    await db
      .insertInto("users")
      .values({ name: TRAINING_STAFF.name, email: TRAINING_STAFF.email, role: "staff", is_sample: true, password_hash: "x" })
      .execute();
    await db
      .insertInto("contact_requests")
      .values([
        { name: "Sample Request", email: "sample.request@gmail.com", organisation: "", user_id: null, topic: "event", message: "A sample message.", is_sample: true },
        { name: "Real Person", email: "real.person@gmail.com", organisation: "", user_id: null, topic: "support", message: "A private message." },
      ])
      .execute();
    training = new Browser(server.url);
  });

  it("opens without a password", async () => {
    const opened = await training.request<{ user: User }>("POST", "/api/auth/training");
    expect(opened.status).toBe(200);
    expect(opened.body.user).toMatchObject({ role: "staff", isSample: true });
  });

  it("sees sample customers and requests only", async () => {
    const customers = await training.request<{ customers: { id: string }[] }>("GET", "/api/staff/customers");
    expect(customers.body.customers.map((c) => c.id)).toEqual([sampleId]);
    const requests = await training.request<{ requests: { email: string }[] }>("GET", "/api/staff/requests");
    expect(requests.body.requests.map((r) => r.email)).toEqual(["sample.request@gmail.com"]);
    expect((await training.request("GET", `/api/staff/customers/${realId}`)).status).toBe(404);
    expect((await training.request("GET", `/api/staff/customers/${sampleId}`)).status).toBe(200);
    const sessions = await training.request<{ sessions: unknown[] }>("GET", "/api/staff/sessions");
    expect(sessions.body.sessions).toHaveLength(0);
  });

  it("changes sample customers and nobody else", async () => {
    expect((await training.request("POST", `/api/staff/customers/${sampleId}/suspend`, { suspended: true })).status).toBe(200);
    expect((await training.request("POST", `/api/staff/customers/${realId}/suspend`, { suspended: true })).status).toBe(404);
    expect((await training.request("POST", `/api/staff/customers/${realId}/extend-trial`, {})).status).toBe(404);
    expect((await training.request("POST", `/api/staff/sessions/${realSessionId}/end`, {})).status).toBe(404);
    expect((await training.request("GET", `/api/sessions/${realSessionId}/results`)).status).toBe(404);
    const real = await db.selectFrom("users").select("suspended_at").where("id", "=", realId).executeTakeFirstOrThrow();
    expect(real.suspended_at).toBeNull();
    const session = await db.selectFrom("live_sessions").select("ended_at").where("id", "=", realSessionId).executeTakeFirstOrThrow();
    expect(session.ended_at).toBeNull();
  });

  it("cannot change its own account", async () => {
    expect((await training.request("PATCH", "/api/account", { name: "Someone else", email: "x@gmail.com" })).status).toBe(403);
  });

  it("is put back by the nightly refresh", async () => {
    await refreshSamples();
    const sample = await db.selectFrom("users").select("suspended_at").where("id", "=", sampleId).executeTakeFirstOrThrow();
    expect(sample.suspended_at).toBeNull();
    const actions = await db.selectFrom("staff_actions").select("id").execute();
    expect(actions).toHaveLength(0);
  });
});
