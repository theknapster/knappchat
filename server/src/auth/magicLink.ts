import { randomBytes, randomInt, createHash, createHmac } from "node:crypto";
import { pool } from "../db.js";
import { env } from "../env.js";

const TOKEN_TTL_MS = 15 * 60 * 1000;
// a code is only 6 digits, so cap guesses per code and requests per email
const MAX_CODE_ATTEMPTS = 5;
const MAX_REQUESTS_PER_WINDOW = 5;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// keyed, so a leaked login_tokens table can't be brute-forced offline
function hashCode(email: string, code: string): string {
  return createHmac("sha256", env.JWT_SECRET).update(`${email}:${code}`).digest("hex");
}

export async function isRateLimited(email: string): Promise<boolean> {
  const { rows } = await pool.query<{ count: string }>(
    `select count(*) from login_tokens
      where email = $1 and created_at > now() - make_interval(secs => $2)`,
    [email, TOKEN_TTL_MS / 1000]
  );
  return Number(rows[0].count) >= MAX_REQUESTS_PER_WINDOW;
}

export async function createLoginToken(
  email: string
): Promise<{ token: string; code: string }> {
  const token = randomBytes(32).toString("hex");
  const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
  await pool.query(
    `insert into login_tokens (email, token_hash, code_hash, expires_at)
     values ($1, $2, $3, $4)`,
    [email, hashToken(token), hashCode(email, code), expiresAt]
  );
  return { token, code };
}

// Returns true when the code matched an active token (now consumed). A miss
// counts against every active code for the email, so requesting several
// emails doesn't buy extra guesses.
export async function consumeLoginCode(email: string, code: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    `update login_tokens
        set used_at = now()
      where id = (
        select id from login_tokens
         where email = $1
           and code_hash = $2
           and used_at is null
           and expires_at > now()
           and failed_attempts < $3
         order by created_at desc
         limit 1
      )`,
    [email, hashCode(email, code), MAX_CODE_ATTEMPTS]
  );
  if (rowCount) return true;
  await pool.query(
    `update login_tokens
        set failed_attempts = failed_attempts + 1
      where email = $1 and used_at is null and expires_at > now()`,
    [email]
  );
  return false;
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
