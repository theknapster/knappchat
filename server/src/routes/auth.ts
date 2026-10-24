import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { env } from "../env.js";
import { sendMagicLinkEmail } from "../mailer.js";
import {
  createLoginToken,
  consumeLoginToken,
  findOrCreateUser,
} from "../auth/magicLink.js";
import { signSession, setSessionCookie, clearSessionCookie } from "../auth/session.js";

const requestLinkBody = z.object({ email: z.string().email() });

export default async function authRoutes(app: FastifyInstance) {
  app.post("/auth/request-link", async (request, reply) => {
    const parsed = requestLinkBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid email" });
    }
    const email = parsed.data.email.toLowerCase().trim();
    const token = await createLoginToken(email);
    const link = `${env.APP_URL}/auth/callback?token=${token}`;
    await sendMagicLinkEmail(email, link);
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
