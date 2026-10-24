-- 6-digit code sent alongside the magic link, for clients that can't open
-- the link themselves (the desktop app)
alter table login_tokens
  add column code_hash text,
  add column failed_attempts integer not null default 0;

create index login_tokens_email_idx on login_tokens (email, created_at desc);
