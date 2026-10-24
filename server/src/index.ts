import Fastify from "fastify";
import cookie from "@fastify/cookie";
import websocket from "@fastify/websocket";
import { env } from "./env.js";
import authRoutes from "./routes/auth.js";
import meRoutes from "./routes/me.js";
import messageRoutes from "./routes/messages.js";
import voiceRoutes from "./routes/voice.js";
import chatWs from "./chat/ws.js";

const app = Fastify({ logger: true });

await app.register(cookie);
await app.register(websocket);

await app.register(authRoutes);
await app.register(meRoutes);
await app.register(messageRoutes);
await app.register(voiceRoutes);
await app.register(chatWs);

app.listen({ port: env.PORT, host: env.HOST }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
