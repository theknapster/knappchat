# Deploying knappchat

This guide sets up knappchat on a single Linux server with a public IP
address, served over HTTPS from your own domain. It assumes Ubuntu 24.04 with
the default `ubuntu` user and the repo checked out at `~/knappchat`; adjust
paths in `deploy/` if yours differ.

## Architecture

```
browser ──https──> Caddy (:443, automatic Let's Encrypt)
                     ├─ example.com /api/*, /ws, /auth/callback ─> backend 127.0.0.1:8080 (systemd: knappchat)
                     ├─ example.com everything else ─────────────> static client build in /srv/knappchat
                     └─ livekit.example.com (wss signaling) ─────> LiveKit 127.0.0.1:7880 (docker)
browser ──udp/tcp direct──> LiveKit media 7882/udp, 7881/tcp, TURN 3478/udp + 30000-40000/udp
backend ──> Postgres 127.0.0.1:5433 (docker) ; your SMTP provider
```

| Piece | How it runs | Config | Logs |
|---|---|---|---|
| Backend | systemd `knappchat.service` (runs migrations, then `node dist/index.js`) | `server/.env` | `journalctl -u knappchat` |
| Client | static files in `/srv/knappchat` | built from `client/` | - |
| Caddy | systemd `caddy` | `/etc/caddy/Caddyfile` (template: `deploy/Caddyfile`) | `journalctl -u caddy` |
| Postgres 16 | docker compose, `127.0.0.1:5433` | `.env` | `docker compose logs postgres` |
| LiveKit | docker compose, host networking | `livekit.yaml` + `.env` | `docker compose logs livekit` |

Everything restarts on its own after a crash or reboot: systemd
`Restart=always`, and compose `restart: unless-stopped`.

Postgres is published on host port **5433**, so it won't clash with a system
PostgreSQL on 5432.

## 1. DNS

Create A (and optionally AAAA) records pointing at the server:

- `example.com` - the app
- `www.example.com` - redirects to the app (optional)
- `livekit.example.com` - LiveKit signaling over wss

## 2. Firewall

Allow inbound, from anywhere:

| Port | Purpose |
|---|---|
| 22/tcp | SSH |
| 80/tcp, 443/tcp | Caddy (HTTPS, HTTP->HTTPS redirect, certificate issuance) |
| 7881/tcp | LiveKit media over TCP (fallback) |
| 7882/udp | LiveKit media (UDP mux) |
| 3478/udp | LiveKit embedded TURN/STUN |
| 30000-40000/udp | TURN relay allocations |

Don't open 8080, 5433 or 7880: they listen on localhost or sit behind Caddy.
On cloud hosts the provider's security group is usually the real firewall,
so make sure the UDP rules exist there, not just in ufw.

## 3. Install prerequisites

- Docker Engine and the compose plugin, from Docker's apt repository
- Caddy, from Caddy's apt repository
- Node.js 22+, e.g. via [nvm](https://github.com/nvm-sh/nvm)
- `rsync`

## 4. Configure

```
cd ~/knappchat
cp .env.example .env               # docker compose: Postgres password, LiveKit keys
cp server/.env.example server/.env # backend
chmod 600 .env server/.env
```

Both files are gitignored. Generate fresh secrets; each example file shows
how.

**`.env`** (read by docker compose)
- `POSTGRES_PASSWORD` - only applied when the database volume is first
  created
- `LIVEKIT_KEYS` - `"APIkey: secret"`

**`server/.env`**
- `DATABASE_URL` - `postgres://knappchat:<POSTGRES_PASSWORD>@localhost:5433/knappchat`
- `JWT_SECRET` - long random string for signing session cookies
- `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` - the same pair as `LIVEKIT_KEYS`
- `LIVEKIT_URL=wss://livekit.example.com` - what browsers connect to
- `LIVEKIT_HTTP_URL=http://localhost:7880` - backend-only
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`,
  `SMTP_FROM` - outgoing mail for login links. Most providers use port 465
  with `SMTP_SECURE=true`, and the mailbox address and password as
  user/pass. Sending from your own domain's mail host, with SPF/DKIM set up,
  keeps login emails out of spam.
- `APP_URL=https://example.com` - base URL for magic links; an `https` URL
  also marks the session cookie `Secure`
- `HOST=127.0.0.1`, `PORT=8080` - keep the backend off the public interface

## 5. Install the service and proxy configs

Edit `deploy/Caddyfile` to use your domain. If your user, repo path or Node
version differ, edit `deploy/knappchat.service` too. Then:

```
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile
sudo cp deploy/knappchat.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable knappchat
sudo systemctl reload caddy
```

The service file hard-codes the nvm Node path; update it whenever you switch
Node versions.

## 6. Deploy

```
scripts/deploy.sh
```

This starts the docker services, runs `npm ci`, migrations and builds for
both packages, publishes `client/dist` to `/srv/knappchat`, and restarts the
backend. Run it again after every update; re-running is safe.

## 7. Test

Open `https://example.com` in two browsers (e.g. two private windows). Sign
in with a different email in each, then check chat, the online list,
nicknames, and voice between them. Check that the login email contains both
a link and a 6-digit code.

## Troubleshooting voice

**"could not establish pc connection" after ~15s** almost always means the
media ports are blocked. Look at LiveKit's `removing participant` log line.
If the browser's remote candidates are only `host` (no `srflx`/`relay`),
STUN on 3478/udp never answered, so check the UDP firewall rules first.

`livekit.yaml` uses LiveKit's standard setup for a server with a public IP:
`use_external_ip: true` finds the public address via STUN. Behind NAT or on
unusual networks, see LiveKit's self-hosting docs for `node_ip` and
`rtc.interfaces`.

Harmless startup warnings: a "UDP receive buffer is too small" notice
(`sysctl -w net.core.rmem_max=5000000` fixes it), and Docker bridge IPs
showing up as extra ICE candidates.

## Desktop app

The desktop app needs nothing extra on the server. It loads the deployed web
client, so redeploying with `scripts/deploy.sh` updates its UI too. Users
enter the server address (e.g. `https://example.com`) on first launch and
sign in with the 6-digit code from the login email. Builds and releases are
covered in [desktop/README.md](desktop/README.md).

## Local development

```
docker compose up -d
cd server && npm install && npm run migrate && npm run dev   # :8080
cd client && npm install && npm run dev                      # :5173
```

Vite proxies `/api`, `/ws` and `/auth/callback` to the backend (see
`client/vite.config.ts`). For dev, set `APP_URL=http://localhost:5173` and
`LIVEKIT_URL=ws://localhost:7880`. Stop `knappchat.service` first if it is
installed, since both use port 8080.

## Moving to a new host

`pg_dump --no-owner --no-privileges -U knappchat knappchat` inside the old
Postgres container, then pipe the dump into `psql` on the new one (after its
Postgres has finished initialising) before the first deploy.
