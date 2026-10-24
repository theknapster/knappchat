import { randomBytes, createHash } from "node:crypto";
import { pool } from "../db.js";

const TOKEN_TTL_MS = 15 * 60 * 1000;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createLoginToken(email: string): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
  await pool.query(
    `insert into login_tokens (email, token_hash, expires_at) values ($1, $2, $3)`,
    [email, hashToken(token), expiresAt]
  );
  return token;
}

export async function consumeLoginToken(token: string): Promise<string | null> {
  const hash = hashToken(token);
  const { rows } = await pool.query<{ id: string; email: string }>(
    `update login_tokens
       set used_at = now()
     where token_hash = $1
       and used_at is null
       and expires_at > now()
     returning id, email`,
    [hash]
  );
  return rows[0]?.email ?? null;
}

export async function findOrCreateUser(
  email: string
): Promise<{ id: string; email: string }> {
  const { rows } = await pool.query<{ id: string; email: string }>(
    `insert into users (email) values ($1)
     on conflict (email) do update set email = excluded.email
     returning id, email`,
    [email]
  );
  return rows[0];
}
