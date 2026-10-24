import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { pool } from "../db.js";
import { getSessionUser, requireAuth } from "../auth/session.js";
import { renameUser } from "../chat/ws.js";

const MAX_NICKNAME_LENGTH = 32;

// empty string clears the nickname (display falls back to email)
const nicknameBody = z.object({
  nickname: z
    .string()
    .trim()
    .max(MAX_NICKNAME_LENGTH)
    .regex(/^[^\p{C}]*$/u, "nickname contains invalid characters"),
});

export default async function meRoutes(app: FastifyInstance) {
  app.get("/me", async (request) => {
    const session = await getSessionUser(request);
    if (!session) return { user: null };
    const { rows } = await pool.query<{ nickname: string | null }>(
      "select nickname from users where id = $1",
      [session.userId]
    );
    return { user: { ...session, nickname: rows[0]?.nickname ?? null } };
  });

  app.put("/me/nickname", { preHandler: requireAuth }, async (request, reply) => {
    const parsed = nicknameBody.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: parsed.error.issues[0]?.message ?? "invalid nickname" });
    }
    const user = request.user!;
    const nickname = parsed.data.nickname || null;
    await pool.query("update users set nickname = $1 where id = $2", [
      nickname,
      user.userId,
    ]);
    renameUser(user.userId, nickname ?? user.email);
    return { nickname };
  });
}
