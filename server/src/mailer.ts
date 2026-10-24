import nodemailer from "nodemailer";
import { env } from "./env.js";

const transport = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: env.SMTP_SECURE,
  auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
});

export async function sendMagicLinkEmail(email: string, link: string, code: string) {
  await transport.sendMail({
    from: env.SMTP_FROM,
    to: email,
    subject: `Your knappchat login code: ${code}`,
    text:
      `Click to log in: ${link}\n\n` +
      `Or enter this code in the app: ${code}\n\n` +
      `The link and code expire in 15 minutes.`,
    html:
      `<p><a href="${link}">Click to log in</a></p>` +
      `<p>Or enter this code in the app:</p>` +
      `<p style="font-size:24px;font-weight:bold;letter-spacing:4px;font-family:monospace">${code}</p>` +
      `<p>The link and code expire in 15 minutes.</p>`,
  });
}
