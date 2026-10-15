import { resolveMx } from "node:dns/promises";

import { sql } from "kysely";

import { config } from "../config.ts";
import { db } from "../db/database.ts";

export interface Email {
  kind: "password_reset" | "session_report";
  to: string;
  userId: string | null;
  subject: string;
  html: string;
  text: string;
  attachments?: { filename: string; content: Buffer }[];
}

export type SendOutcome = "sent" | "skipped" | "failed";

// Addresses that can never belong to a person: reserved names, and this
// site's own domain, which receives no mail.
const RESERVED = /(^|\.)(example|test|invalid|localhost|local)$|(^|\.)example\.(com|net|org)$|(^|\.)jeffgicharu\.com$/i;

async function domainTakesMail(domain: string): Promise<boolean> {
  try {
    const records = await resolveMx(domain);
    return records.some((record) => record.exchange && record.exchange !== ".");
  } catch {
    return false;
  }
}

async function log(email: Email, status: SendOutcome, detail: string | null): Promise<void> {
  await db
    .insertInto("email_log")
    .values({ kind: email.kind, to_address: email.to, user_id: email.userId, status, detail })
    .execute();
}

/**
 * Sends through Resend. The whole site may send EMAIL_DAILY_CAP emails in any
 * 24 hours (its share of the account's daily allowance), and one address at
 * most three. Anything over the cap is recorded and not sent.
 */
export async function sendEmail(email: Email): Promise<SendOutcome> {
  const domain = email.to.split("@")[1] ?? "";
  if (!domain || RESERVED.test(domain)) {
    await log(email, "skipped", "reserved domain");
    return "skipped";
  }
  const [{ total }, { mine }] = await Promise.all([
    db
      .selectFrom("email_log")
      .select((eb) => eb.fn.countAll<number>().as("total"))
      .where("status", "=", "sent")
      .where("created_at", ">=", sql<Date>`now() - interval '24 hours'`)
      .executeTakeFirstOrThrow(),
    db
      .selectFrom("email_log")
      .select((eb) => eb.fn.countAll<number>().as("mine"))
      .where("status", "=", "sent")
      .where("to_address", "=", email.to)
      .where("created_at", ">=", sql<Date>`now() - interval '24 hours'`)
      .executeTakeFirstOrThrow(),
  ]);
  if (Number(total) >= config.EMAIL_DAILY_CAP) {
    await log(email, "skipped", "daily cap reached");
    return "skipped";
  }
  if (Number(mine) >= 3) {
    await log(email, "skipped", "address cap reached");
    return "skipped";
  }
  if (!(await domainTakesMail(domain))) {
    await log(email, "skipped", "domain takes no mail");
    return "skipped";
  }
  if (!config.RESEND_API_KEY) {
    await log(email, "skipped", "no sending key configured");
    return "skipped";
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${config.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: config.EMAIL_FROM,
      to: [email.to],
      subject: email.subject,
      html: email.html,
      text: email.text,
      attachments: email.attachments?.map((a) => ({ filename: a.filename, content: a.content.toString("base64") })),
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    const detail = `Resend answered ${response.status}`;
    await log(email, "failed", detail);
    if (response.status >= 500 || response.status === 429) throw new Error(detail);
    return "failed";
  }
  const body = (await response.json().catch(() => ({}))) as { id?: string };
  await log(email, "sent", body.id ?? null);
  return "sent";
}
