import type { FastifyInstance } from "fastify";
import { AccessToken } from "livekit-server-sdk";
import { env } from "../env.js";
import { pool } from "../db.js";
import { requireAuth } from "../auth/session.js";

export const VOICE_ROOM_NAME = "main-voice";

export default async function voiceRoutes(app: FastifyInstance) {
  app.post("/voice/token", { preHandler: requireAuth }, async (request) => {
    const user = request.user!;
    const { rows } = await pool.query<{ nickname: string | null }>(
      "select nickname from users where id = $1",
      [user.userId]
    );
    const at = new AccessToken(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET, {
      identity: user.userId,
      name: rows[0]?.nickname ?? user.email,
      ttl: "10m",
    });
    at.addGrant({
      room: VOICE_ROOM_NAME,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
    });

    return { token: await at.toJwt(), url: env.LIVEKIT_URL };
  });
}
