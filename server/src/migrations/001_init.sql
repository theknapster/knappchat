create extension if not exists pgcrypto;

create table users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  created_at timestamptz not null default now()
);

create table login_tokens (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  token_hash text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index login_tokens_token_hash_idx on login_tokens (token_hash);

create table messages (
  id bigserial primary key,
  user_id uuid not null references users (id),
  body text not null,
  created_at timestamptz not null default now()
);

create index messages_created_at_idx on messages (created_at desc);
