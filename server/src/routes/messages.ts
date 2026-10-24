import type { FastifyInstance } from "fastify";
import { pool } from "../db.js";
import { requireAuth } from "../auth/session.js";

export default async function messageRoutes(app: FastifyInstance) {
  app.get(
    "/messages",
    { preHandler: requireAuth },
    async (request) => {
      const { before, limit } = request.query as {
        before?: string;
        limit?: string;
      };
      const take = Math.min(Number(limit) || 50, 100);

      const { rows } = before
        ? await pool.query(
            `select m.id, m.body, m.created_at, m.user_id as author_id,
                    coalesce(u.nickname, u.email) as author_name
               from messages m
               join users u on u.id = m.user_id
              where m.id < $1
              order by m.id desc
              limit $2`,
            [before, take]
          )
        : await pool.query(
            `select m.id, m.body, m.created_at, m.user_id as author_id,
                    coalesce(u.nickname, u.email) as author_name
               from messages m
               join users u on u.id = m.user_id
              order by m.id desc
              limit $1`,
            [take]
          );

      return { messages: rows.reverse() };
    }
  );
}
