import { config } from "../config.ts";

const INK = "#1D1430";
const MUTED = "#5E536E";
const PAPER = "#FBF7F0";
const LINE = "#E6DCCD";
const SIGNAL = "#FF6A2B";

function escape(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** The mark: five rising bars, drawn with table cells so it shows even when images are blocked. */
function mark(): string {
  const heights = [8, 14, 20, 14, 22];
  const bars = heights
    .map(
      (h) =>
        `<td valign="bottom" style="padding:0 1px;"><div style="width:4px;height:${h}px;background:${SIGNAL};border-radius:2px;"></div></td>`,
    )
    .join("");
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="display:inline-table;vertical-align:middle;"><tr>${bars}</tr></table>`;
}

function layout(title: string, bodyHtml: string): string {
  const site = config.SITE_URL;
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escape(title)}</title></head>
<body style="margin:0;padding:0;background:${PAPER};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAPER};">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
<tr><td style="padding:0 0 20px 4px;font-family:Arial,Helvetica,sans-serif;font-size:22px;font-weight:bold;color:${INK};letter-spacing:-0.5px;">
${mark()}&nbsp;&nbsp;roomwave
</td></tr>
<tr><td style="background:#ffffff;border:1px solid ${LINE};border-radius:14px;padding:32px 28px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.55;color:${INK};">
${bodyHtml}
</td></tr>
<tr><td style="padding:20px 4px 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.5;color:${MUTED};">
This mailbox does not receive replies. If you need help, write to us from <a href="${site}/contact" style="color:${MUTED};">${site.replace(/^https?:\/\//, "")}/contact</a>.
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

function button(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;"><tr><td style="background:${SIGNAL};border-radius:999px;">
<a href="${href}" style="display:inline-block;padding:13px 26px;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;color:${INK};text-decoration:none;">${escape(label)}</a>
</td></tr></table>`;
}

export function passwordResetEmail(name: string, token: string): { subject: string; html: string; text: string } {
  const link = `${config.SITE_URL}/reset-password?token=${encodeURIComponent(token)}`;
  const subject = "Reset your Roomwave password";
  const html = layout(
    subject,
    `<p style="margin:0 0 16px;font-size:20px;font-weight:bold;">Hello ${escape(name)},</p>
<p style="margin:0 0 8px;">Someone asked to reset the password for your Roomwave account. If it was you, choose a new password with the button below. The link works for one hour, and only once.</p>
${button(link, "Choose a new password")}
<p style="margin:0;color:${MUTED};font-size:14px;">If you did not ask for this, you can ignore this email. Your password stays as it is.</p>`,
  );
  const text = `Hello ${name},

Someone asked to reset the password for your Roomwave account. If it was you, choose a new password here (the link works for one hour, and only once):

${link}

If you did not ask for this, you can ignore this email. Your password stays as it is.

This mailbox does not receive replies. If you need help, write to us from ${config.SITE_URL}/contact.`;
  return { subject, html, text };
}

export function sessionReportEmail(
  name: string,
  title: string,
  startedAt: Date,
  participants: number,
  responses: number,
  resultsUrl: string,
): { subject: string; html: string; text: string } {
  const date = startedAt.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Nairobi" });
  const subject = `Results: ${title}`;
  const html = layout(
    subject,
    `<p style="margin:0 0 16px;font-size:20px;font-weight:bold;">Hello ${escape(name)},</p>
<p style="margin:0 0 16px;">Here are the results of <strong>${escape(title)}</strong>, presented on ${date}. The full report is attached as a PDF.</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 8px;"><tr>
<td style="padding:12px 20px 12px 0;"><div style="font-size:28px;font-weight:bold;">${participants}</div><div style="color:${MUTED};font-size:14px;">people took part</div></td>
<td style="padding:12px 0 12px 20px;border-left:1px solid ${LINE};"><div style="font-size:28px;font-weight:bold;">${responses}</div><div style="color:${MUTED};font-size:14px;">answers given</div></td>
</tr></table>
${button(resultsUrl, "Open the results")}`,
  );
  const text = `Hello ${name},

Here are the results of "${title}", presented on ${date}. The full report is attached as a PDF.

${participants} people took part and gave ${responses} answers.

Open the results: ${resultsUrl}

This mailbox does not receive replies. If you need help, write to us from ${config.SITE_URL}/contact.`;
  return { subject, html, text };
}
