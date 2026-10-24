import nodemailer from "nodemailer";
import { env } from "./env.js";

const transport = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: env.SMTP_SECURE,
  auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
});

export async function sendMagicLinkEmail(email: string, link: string) {
  await transport.sendMail({
    from: env.SMTP_FROM,
    to: email,
    subject: "Your login link",
    text: `Click to log in: ${link}\n\nThis link expires in 15 minutes.`,
    html: `<p><a href="${link}">Click to log in</a></p><p>This link expires in 15 minutes.</p>`,
  });
}
