import type { FastifyInstance } from "fastify";
import type { WebSocket } from "ws";
import { pool } from "../db.js";
import { getSessionUser } from "../auth/session.js";

const MAX_MESSAGE_LENGTH = 2000;
const HISTORY_LIMIT = 50;

interface ConnectedUser {
  userId: string;
  name: string;
}

// one entry per open socket; a user with several tabs appears once in presence
const clients = new Map<WebSocket, ConnectedUser>();

function broadcast(payload: unknown) {
  const data = JSON.stringify(payload);
  for (const client of clients.keys()) {
    if (client.readyState === client.OPEN) client.send(data);
  }
}

function presenceList(): ConnectedUser[] {
  const byId = new Map<string, ConnectedUser>();
  for (const user of clients.values()) byId.set(user.userId, user);
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function broadcastPresence() {
  broadcast({ type: "presence", users: presenceList() });
}

export function renameUser(userId: string, name: string) {
  for (const user of clients.values()) {
    if (user.userId === userId) user.name = name;
  }
  broadcast({ type: "renamed", userId, name });
  broadcastPresence();
}

export default async function chatWs(app: FastifyInstance) {
  app.get("/ws", { websocket: true }, async (socket, request) => {
    const user = await getSessionUser(request);
    if (!user) {
      socket.close(4001, "unauthorized");
      return;
    }

    const { rows: me } = await pool.query<{ nickname: string | null }>(
      "select nickname from users where id = $1",
      [user.userId]
    );
    const connected: ConnectedUser = {
      userId: user.userId,
      name: me[0]?.nickname ?? user.email,
    };
    clients.set(socket, connected);

    const { rows: history } = await pool.query(
      `select m.id, m.body, m.created_at, m.user_id as author_id,
              coalesce(u.nickname, u.email) as author_name
         from messages m
         join users u on u.id = m.user_id
        order by m.id desc
        limit $1`,
      [HISTORY_LIMIT]
    );
    socket.send(
      JSON.stringify({ type: "history", messages: history.reverse() })
    );
    broadcastPresence();

    socket.on("message", async (raw) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (
        typeof parsed !== "object" ||
        parsed === null ||
        (parsed as { type?: string }).type !== "send"
      ) {
        return;
      }
      const body = String((parsed as { body?: unknown }).body ?? "").trim();
      if (!body || body.length > MAX_MESSAGE_LENGTH) return;

      const { rows } = await pool.query(
        `insert into messages (user_id, body) values ($1, $2)
         returning id, body, created_at`,
        [user.userId, body]
      );
      const message = {
        ...rows[0],
        author_id: user.userId,
        author_name: connected.name,
      };
      broadcast({ type: "message", message });
    });

    socket.on("close", () => {
      clients.delete(socket);
      broadcastPresence();
    });
  });
}
