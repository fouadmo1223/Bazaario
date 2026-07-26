import { createServer } from "node:http";
import { Server, type Socket } from "socket.io";
import Redis from "ioredis";
import jwt from "jsonwebtoken";
import { REALTIME_CHANNEL, type RealtimeEvent } from "@/server/services/notification.service";
import { canAccess } from "@/server/services/conversation.service";
import { connectToDatabase } from "@/server/database/connection";
import { Membership } from "@/server/database/models/membership.model";
import { Order } from "@/server/database/models/order.model";
import { User } from "@/server/database/models/user.model";
import { mailer } from "@/server/mail/mailer";
import { logger } from "@/shared/lib/logger";
import { ROLES, type Role } from "@/shared/constants/rbac";

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
  conversation: (id: string) => `conversation:${id}`,
};

/**
 * Room authorization.
 *
 * These deliberately re-query rather than trusting the JWT's `roles`: the token
 * carries global roles only, and vendor access lives in Membership, which can be
 * revoked while a socket is still connected on an unexpired token.
 */

async function canReadVendor(user: SocketUser, vendorId: string): Promise<boolean> {
  if (user.roles.includes(ROLES.SUPER_ADMIN)) return true;
  try {
    await connectToDatabase();
    const membership = await Membership.findOne({ user: user.id, vendor: vendorId, status: "active" }).select("_id");
    return membership != null;
  } catch {
    return false;
  }
}

async function canReadOrder(user: SocketUser, orderId: string): Promise<boolean> {
  if (user.roles.includes(ROLES.SUPER_ADMIN)) return true;
  try {
    await connectToDatabase();
    const order = await Order.findById(orderId).select("customer vendor");
    if (!order) return false;
    if (order.customer && String(order.customer) === user.id) return true;
    return canReadVendor(user, String(order.vendor));
  } catch {
    return false;
  }
}

/**
 * Fallback for a recipient with no active socket. Best-effort: a missed
 * notification email must never take down the relay loop, and `mailer`
 * already throws when SMTP isn't configured (dev has no SMTP_PASSWORD), so
 * that failure is expected and just logged like every other mailer call site.
 */
async function sendNotificationFallbackEmail(userId: string, payload: Record<string, unknown>): Promise<void> {
  try {
    await connectToDatabase();
    const user = await User.findById(userId).select("email");
    if (!user?.email) return;
    await mailer.sendNotificationFallback(user.email, {
      title: typeof payload.title === "string" ? payload.title : "New notification",
      body: typeof payload.body === "string" ? payload.body : null,
      link: typeof payload.link === "string" ? payload.link : null,
    });
  } catch (err) {
    logger.error({ err, userId }, "Failed to send notification fallback email");
  }
}

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

    /**
     * Rooms this socket has been cleared for.
     *
     * Every `*:subscribe` used to join whatever room the client named, with a
     * comment claiming authorization happened "server-side" — it did not. Any
     * authenticated shopper could join `vendor:<anyone>` and read a competitor's
     * live order feed, or `conversation:<any id>` and watch a stranger's support
     * thread. The join handlers below now check the database before joining, and
     * the emit handlers only trust rooms recorded here rather than re-deriving
     * permission from client input.
     */
    const authorized = new Set<string>();

    // Every user gets their own room for direct notifications.
    socket.join(rooms.user(user.id));

    // Presence is announced only to the rooms this socket shares, once it has
    // joined them — a global broadcast told every connected client the id of
    // every user who came online.

    socket.on("vendor:subscribe", async (vendorId: string) => {
      if (!(await canReadVendor(user, vendorId))) return;
      const room = rooms.vendor(vendorId);
      authorized.add(room);
      socket.join(room);
    });

    socket.on("order:subscribe", async (orderId: string) => {
      if (!(await canReadOrder(user, orderId))) return;
      const room = rooms.order(orderId);
      authorized.add(room);
      socket.join(room);
    });

    // --- Chat ---
    socket.on("conversation:join", async (conversationId: string) => {
      if (!(await canAccess(conversationId, user))) return;
      const room = rooms.conversation(conversationId);
      authorized.add(room);
      socket.join(room);
      socket.to(room).emit("presence:online", { userId: user.id });
    });

    socket.on("conversation:leave", (conversationId: string) => {
      const room = rooms.conversation(conversationId);
      authorized.delete(room);
      socket.leave(room);
    });

    socket.on("conversation:typing", ({ conversationId, typing }: { conversationId: string; typing: boolean }) => {
      const room = rooms.conversation(conversationId);
      if (!authorized.has(room)) return;
      socket.to(room).emit("conversation:typing", { userId: user.id, typing });
    });

    socket.on("conversation:read", ({ conversationId, messageId }: { conversationId: string; messageId: string }) => {
      const room = rooms.conversation(conversationId);
      if (!authorized.has(room)) return;
      socket.to(room).emit("conversation:read", { userId: user.id, messageId });
    });

    socket.on("disconnect", () => {
      for (const room of authorized) {
        socket.to(room).emit("presence:offline", { userId: user.id });
      }
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
      case "notification": {
        io.to(rooms.user(event.userId)).emit("notification", event.payload);

        // Email fallback: only for a recipient with no active socket right
        // now, and only when the notification opted into the "email" channel.
        const online = (io.sockets.adapter.rooms.get(rooms.user(event.userId))?.size ?? 0) > 0;
        if (!online && event.channels.includes("email")) {
          void sendNotificationFallbackEmail(event.userId, event.payload);
        }
        break;
      }
      case "order:update":
        io.to(rooms.order(event.orderId)).emit("order:update", event);
        io.to(rooms.vendor(event.vendor)).emit("order:update", event);
        break;
      case "chat:message":
        io.to(rooms.conversation(event.conversationId)).emit("chat:message", event.payload);
        break;
    }
  });

  httpServer.listen(PORT, () => {
    console.log(`Realtime server listening on :${PORT}`);
  });
}

start();
