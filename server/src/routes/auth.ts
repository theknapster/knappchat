import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { env } from "../env.js";
import { sendMagicLinkEmail } from "../mailer.js";
import {
  createLoginToken,
  consumeLoginToken,
  consumeLoginCode,
  findOrCreateUser,
  isRateLimited,
} from "../auth/magicLink.js";
import { signSession, setSessionCookie, clearSessionCookie } from "../auth/session.js";

const requestLinkBody = z.object({ email: z.string().email() });
const verifyCodeBody = z.object({
  email: z.string().email(),
  code: z.string().transform((v) => v.replace(/\s/g, "")).pipe(z.string().regex(/^\d{6}$/)),
});

export default async function authRoutes(app: FastifyInstance) {
  app.post("/auth/request-link", async (request, reply) => {
    const parsed = requestLinkBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid email" });
    }
    const email = parsed.data.email.toLowerCase().trim();
    if (await isRateLimited(email)) {
      return reply
        .code(429)
        .send({ error: "too many login emails; wait a few minutes and try again" });
    }
    const { token, code } = await createLoginToken(email);
    const link = `${env.APP_URL}/auth/callback?token=${token}`;
    await sendMagicLinkEmail(email, link, code);
    return { ok: true };
  });

  app.post("/auth/verify-code", async (request, reply) => {
    const parsed = verifyCodeBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "enter the 6-digit code from the email" });
    }
    const email = parsed.data.email.toLowerCase().trim();
    if (!(await consumeLoginCode(email, parsed.data.code))) {
      return reply.code(400).send({ error: "wrong or expired code" });
    }
    const user = await findOrCreateUser(email);
    const session = await signSession({ userId: user.id, email: user.email });
    setSessionCookie(reply, session);
    return { ok: true };
  });

  app.get("/auth/callback", async (request, reply) => {
    const { token } = request.query as { token?: string };
    if (!token) return reply.code(400).send({ error: "missing token" });

    const email = await consumeLoginToken(token);
    if (!email) return reply.code(400).send({ error: "invalid or expired token" });

    const user = await findOrCreateUser(email);
    const session = await signSession({ userId: user.id, email: user.email });
    setSessionCookie(reply, session);
    return reply.redirect(env.APP_URL);
  });

  app.post("/auth/logout", async (_request, reply) => {
    clearSessionCookie(reply);
    return { ok: true };
  });
}
