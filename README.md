# knappchat

A small, self-hosted Discord-style chat app: one text channel, one voice room,
and passwordless email login. Built for a group of friends, not for scale.

## Features

- **Passwordless login** - enter your email, then click the link or type the 6-digit code
- **Text chat** - real-time over WebSocket, history stored in Postgres
- **Voice chat** - WebRTC through a self-hosted [LiveKit](https://livekit.io) server
- **Online list** - see who is connected right now
- **Nicknames** - set a display name; it updates everywhere live
- **Desktop app** (Windows, Linux) - global toggle-mute and push-to-talk hotkeys,
  including mouse buttons, that work while the app is in the background
- **In-browser mute hotkey** - configurable per browser (default Alt+M; tab must be focused)

## Stack

| Part | Tech |
|---|---|
| `server/` | Node 22, TypeScript, Fastify, `pg`, `jose` (JWT sessions), nodemailer, LiveKit server SDK |
| `client/` | React 19, Vite, `livekit-client` |
| `desktop/` | Electron shell around the web client, `uiohook-napi` for global hotkeys |
| Infra | Postgres 16 and LiveKit via Docker Compose; Caddy for HTTPS |

## Quick start (local development)

Requires Docker and Node 22+.

```
cp .env.example .env               # fill in a Postgres password and LiveKit key pair
cp server/.env.example server/.env # matching values, plus SMTP settings
docker compose up -d
cd server && npm install && npm run migrate && npm run dev
cd client && npm install && npm run dev
```

Then open http://localhost:5173. For local development, set
`APP_URL=http://localhost:5173` and `LIVEKIT_URL=ws://localhost:7880` in
`server/.env`. Login links are sent through the SMTP server you configure.

## Desktop app

Download it from [Releases](https://github.com/theknapster/knappchat/releases).
See [desktop/README.md](desktop/README.md) for usage, building and releasing.

## Deploying

See [DEPLOYMENT.md](DEPLOYMENT.md). It covers DNS, firewall ports, Caddy,
systemd, and a one-command `scripts/deploy.sh`.

## Project layout

```
client/            React frontend
desktop/           Electron desktop app (global hotkeys)
server/            Fastify backend (src/migrations holds the SQL migrations)
deploy/            Caddyfile and systemd unit templates
scripts/deploy.sh  build, publish and restart on the server
.github/workflows  desktop app builds and releases
docker-compose.yml Postgres + LiveKit
livekit.yaml       LiveKit config (keys come from .env)
```

## License

[MIT](LICENSE)
