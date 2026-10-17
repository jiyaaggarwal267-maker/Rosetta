import nodemailer, { type Transporter } from "nodemailer";
import { env } from "./env";

/**
 * Outgoing email over SMTP (Gmail by default). Every send is best effort:
 * a failed email is logged and never breaks the request that caused it.
 */

export const mailConfigured = () => Boolean(env.smtpUser && env.smtpPass);

const globalMail = globalThis as unknown as { __rosettaMail?: Transporter };
function transporter() {
  return (globalMail.__rosettaMail ??= nodemailer.createTransport({
    host: env.smtpHost,
    port: env.smtpPort,
    secure: env.smtpPort === 465,
    auth: { user: env.smtpUser, pass: env.smtpPass },
  }));
}

/** Sample-team addresses aren't real inboxes. */
const deliverable = (to: string) => Boolean(to) && !to.endsWith("@demo.rosetta.dev");

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** A plain, branded email: heading, a few paragraphs, one button. */
function layout(opts: { heading: string; paragraphs: string[]; button?: { label: string; url: string }; footer?: string }) {
  const p = opts.paragraphs
    .map((t) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#1A3D63">${escape(t)}</p>`)
    .join("");
  const button = opts.button
    ? `<p style="margin:24px 0"><a href="${escape(opts.button.url)}" style="display:inline-block;background:#0A1931;color:#F6FAFD;text-decoration:none;font-weight:600;font-size:14px;padding:12px 20px;border-radius:10px">${escape(opts.button.label)}</a></p>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#F6FAFD;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F6FAFD;padding:32px 16px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#FFFFFF;border-radius:16px;padding:32px;box-shadow:0 0 0 1px rgba(26,61,99,0.10)">
<tr><td>
<p style="margin:0 0 24px;font-size:16px;font-weight:700;color:#0A1931">◐ Rosetta</p>
<h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:#0A1931">${escape(opts.heading)}</h1>
${p}${button}
<p style="margin:24px 0 0;font-size:12px;line-height:1.5;color:#4A6785">${escape(opts.footer ?? "You're getting this because you're part of a Rosetta workspace.")}</p>
</td></tr></table></td></tr></table></body></html>`;
}

async function send(to: string, subject: string, html: string, text: string) {
  if (!mailConfigured() || !deliverable(to)) return false;
  try {
    await transporter().sendMail({
      from: env.smtpFrom || `Rosetta <${env.smtpUser}>`,
      to,
      subject,
      html,
      text,
    });
    return true;
  } catch (error) {
    console.warn("[rosetta] email failed:", error instanceof Error ? error.message : error);
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* The emails                                                          */
/* ------------------------------------------------------------------ */

/** The weekly report: its own full-width layout, built in report.ts. */
export function sendWeeklyReport(o: { to: string; subject: string; html: string; text: string }) {
  return send(o.to, o.subject, o.html, o.text);
}

export function sendInvite(o: { to: string; name: string; inviter: string; orgName: string; role: string; code: string }) {
  const url = `${env.appUrl}/join?code=${o.code}`;
  return send(
    o.to,
    `${o.inviter} invited you to ${o.orgName} on Rosetta`,
    layout({
      heading: `Join ${o.orgName} on Rosetta`,
      paragraphs: [
        `Hi ${o.name}, ${o.inviter} added you as ${o.role}.`,
        "Rosetta explains every code change your team ships, written for the way you read it.",
        `Your invite code is ${o.code}.`,
      ],
      button: { label: "Join your team", url },
    }),
    `Hi ${o.name}, ${o.inviter} added you to ${o.orgName} on Rosetta as ${o.role}. Join: ${url} (code ${o.code})`,
  );
}

export function sendReport(o: { to: string; toName: string; fromName: string; title: string; text: string; ticketId: string }) {
  const url = `${env.appUrl}/app/questions/${o.ticketId}`;
  return send(
    o.to,
    `${o.fromName} thinks an explanation is wrong: ${o.title}`,
    layout({
      heading: `${o.fromName} reported a possible mistake`,
      paragraphs: [`In the explanation of “${o.title}”:`, `“${o.text}”`, "Check it against your code. You can fix the text, or ask Rosetta to explain it again."],
      button: { label: "See the report", url },
    }),
    `${o.fromName} reported: ${o.text}
See it: ${url}`,
  );
}

export function sendQuestion(o: { to: string; toName: string; fromName: string; subject: string; text: string; ticketId: string }) {
  const url = `${env.appUrl}/app/questions/${o.ticketId}`;
  return send(
    o.to,
    `${o.fromName} asked you: ${o.subject}`,
    layout({
      heading: `${o.fromName} has a question for you`,
      paragraphs: [`“${o.text}”`, "Answer in your own words. Rosetta rewrites your reply for them."],
      button: { label: "Answer the question", url },
    }),
    `${o.fromName} asked: ${o.text}\nAnswer: ${url}`,
  );
}

export function sendReply(o: { to: string; fromName: string; subject: string; text: string; ticketId: string }) {
  const url = `${env.appUrl}/app/questions/${o.ticketId}`;
  return send(
    o.to,
    `${o.fromName} replied: ${o.subject}`,
    layout({
      heading: `${o.fromName} replied`,
      paragraphs: [`“${o.text}”`, "Open Rosetta to read it at your level."],
      button: { label: "Read the reply", url },
    }),
    `${o.fromName} replied: ${o.text}\nRead it: ${url}`,
  );
}

export function sendNewChange(o: { to: string; managerName: string; authorName: string; title: string; summary: string; cardId: string }) {
  const url = `${env.appUrl}/app/c/${o.cardId}`;
  return send(
    o.to,
    `New from ${o.authorName}: ${o.title}`,
    layout({
      heading: `${o.authorName} shipped a change`,
      paragraphs: [o.title, o.summary],
      button: { label: "See how it works", url },
    }),
    `${o.authorName} shipped: ${o.title}\n${o.summary}\n${url}`,
  );
}

export function sendPasswordReset(o: { to: string; name: string; token: string }) {
  const url = `${env.appUrl}/reset?token=${o.token}`;
  return send(
    o.to,
    "Reset your Rosetta password",
    layout({
      heading: "Reset your password",
      paragraphs: [`Hi ${o.name}, someone asked to reset the password for this account.`, "The link works for one hour."],
      button: { label: "Choose a new password", url },
      footer: "If this wasn't you, ignore this email. Your password stays the same.",
    }),
    `Reset your Rosetta password (valid 1 hour): ${url}`,
  );
}
