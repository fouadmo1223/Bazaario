import { createServer } from "node:http";
import { Server, type Socket } from "socket.io";
import Redis from "ioredis";
import jwt from "jsonwebtoken";
import { REALTIME_CHANNEL, type RealtimeEvent } from "@/server/services/notification.service";
import type { Role } from "@/shared/constants/rbac";

/**
 * Standalone Socket.IO server.
 *
 * Vercel's serverless functions cannot hold long-lived connections, so this runs
 * as a separate Node process (container / Railway / Fly / a small VM). Next.js
 * server actions publish events to Redis; this process subscribes and fans them
 * out to the right rooms.
 *
 * Run with: `npm run realtime`
 */

type SocketUser = { id: string; email: string; roles: Role[] };
type AuthedSocket = Socket & { user?: SocketUser };

const PORT = Number(process.env.REALTIME_PORT ?? 4000);
const ORIGIN = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001";

/** Room naming — keep in one place so publishers and subscribers agree. */
export const rooms = {
  user: (id: string) => `user:${id}`,
  vendor: (id: string) => `vendor:${id}`,
  order: (id: string) => `order:${id}`,
  ticket: (id: string) => `ticket:${id}`,
};

function start() {
  const httpServer = createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", service: "realtime" }));
  });

  const io = new Server(httpServer, {
    cors: { origin: ORIGIN, credentials: true },
    path: "/socket.io",
  });

  // --- Authentication: verify the access token before allowing a connection ---
  io.use((socket: AuthedSocket, next) => {
    const token =
      (socket.handshake.auth?.token as string | undefined) ??
      socket.handshake.headers.authorization?.replace("Bearer ", "");

    if (!token) return next(new Error("Unauthorized: no token"));
    try {
      const secret = process.env.JWT_ACCESS_SECRET;
      if (!secret) return next(new Error("Server misconfigured"));
      const claims = jwt.verify(token, secret) as { sub: string; email: string; roles: Role[] };
      socket.user = { id: claims.sub, email: claims.email, roles: claims.roles };
      next();
    } catch {
      next(new Error("Unauthorized: invalid token"));
    }
  });

  io.on("connection", (socket: AuthedSocket) => {
    const user = socket.user;
    if (!user) return socket.disconnect(true);

    // Every user gets their own room for direct notifications.
    socket.join(rooms.user(user.id));

    // Presence: announce online status to interested rooms.
    socket.broadcast.emit("presence:online", { userId: user.id });

    /** Staff subscribe to their vendor's stream (authorization is re-checked server-side). */
    socket.on("vendor:subscribe", (vendorId: string) => {
      socket.join(rooms.vendor(vendorId));
    });
    socket.on("order:subscribe", (orderId: string) => {
      socket.join(rooms.order(orderId));
    });

    // --- Chat / support tickets ---
    socket.on("ticket:join", (ticketId: string) => socket.join(rooms.ticket(ticketId)));
    socket.on("ticket:typing", ({ ticketId, typing }: { ticketId: string; typing: boolean }) => {
      socket.to(rooms.ticket(ticketId)).emit("ticket:typing", { userId: user.id, typing });
    });
    socket.on("ticket:read", ({ ticketId, messageId }: { ticketId: string; messageId: string }) => {
      socket.to(rooms.ticket(ticketId)).emit("ticket:read", { userId: user.id, messageId });
    });

    socket.on("disconnect", () => {
      socket.broadcast.emit("presence:offline", { userId: user.id });
    });
  });

  // --- Redis bridge: relay events published by Next.js server actions ---
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) throw new Error("REDIS_URL is required for the realtime server");
  const subscriber = new Redis(redisUrl);

  subscriber.subscribe(REALTIME_CHANNEL, (err) => {
    if (err) console.error("Failed to subscribe to realtime channel", err);
    else console.log(`Realtime subscribed to ${REALTIME_CHANNEL}`);
  });

  subscriber.on("message", (_channel, raw) => {
    let event: RealtimeEvent;
    try {
      event = JSON.parse(raw) as RealtimeEvent;
    } catch {
      return;
    }

    switch (event.kind) {
      case "notification":
        io.to(rooms.user(event.userId)).emit("notification", event.payload);
        break;
      case "order:update":
        io.to(rooms.order(event.orderId)).emit("order:update", event);
        io.to(rooms.vendor(event.vendor)).emit("order:update", event);
        break;
      case "chat:message":
        io.to(rooms.ticket(event.ticketId)).emit("chat:message", event.payload);
        break;
    }
  });

  httpServer.listen(PORT, () => {
    console.log(`Realtime server listening on :${PORT}`);
  });
}

start();
