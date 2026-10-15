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

/** Why an email to this address cannot go out now: the reason for the log and words for the person. */
export interface Hold {
  detail: string;
  message: string;
}

/**
 * The whole site may send EMAIL_DAILY_CAP emails in any 24 hours (its share
 * of the account's daily allowance), and one address at most three.
 */
export async function emailHold(to: string): Promise<Hold | null> {
  const domain = to.split("@")[1] ?? "";
  if (!domain || RESERVED.test(domain)) {
    return { detail: "reserved domain", message: `We cannot deliver email to ${to}. Change the email on your account, or download the PDF.` };
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
      .where("to_address", "=", to)
      .where("created_at", ">=", sql<Date>`now() - interval '24 hours'`)
      .executeTakeFirstOrThrow(),
  ]);
  if (Number(total) >= config.EMAIL_DAILY_CAP) {
    return { detail: "daily cap reached", message: "We have sent all the email we can today. Download the PDF instead, or try again tomorrow." };
  }
  if (Number(mine) >= 3) {
    return { detail: "address cap reached", message: "That address has had three emails from us today. Download the PDF instead." };
  }
  if (!(await domainTakesMail(domain))) {
    return { detail: "domain takes no mail", message: `We cannot deliver email to ${to}. Change the email on your account, or download the PDF.` };
  }
  if (!config.RESEND_API_KEY) {
    return { detail: "no sending key configured", message: "Emailed reports are not available right now. Download the PDF instead." };
  }
  return null;
}

/** Sends through Resend, unless something holds it back; then it is recorded and not sent. */
export async function sendEmail(email: Email): Promise<SendOutcome> {
  const hold = await emailHold(email.to);
  if (hold) {
    await log(email, "skipped", hold.detail);
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
