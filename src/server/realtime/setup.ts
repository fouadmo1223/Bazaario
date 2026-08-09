import { Server, type Socket } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import jwt from "jsonwebtoken";
import { REALTIME_CHANNEL, type RealtimeEvent } from "@/server/services/notification.service";
import { canAccess } from "@/server/services/conversation.service";
import { connectToDatabase } from "@/server/database/connection";
import { Membership } from "@/server/database/models/membership.model";
import { Order } from "@/server/database/models/order.model";
import { User } from "@/server/database/models/user.model";
import { mailer } from "@/server/mail/mailer";
import { getRedis } from "@/server/cache/redis";
import { logger } from "@/shared/lib/logger";
import { ROLES, type Role } from "@/shared/constants/rbac";

/**
 * Everything the realtime layer does once it has an `io` instance, shared by
 * both hosting shapes this app supports:
 *
 * - `src/server/realtime/server.ts` — a standalone always-on Node process
 *   (Railway/Fly/a VPS), one `io` instance for the process's whole lifetime.
 * - `src/pages/api/socket.ts` — a Vercel serverless function using the
 *   `res.socket.server` attach trick, where a single warm container may
 *   reuse the same `io` instance across nearby invocations but a cold start
 *   or a second concurrent instance gets its own. That's exactly why this
 *   module also wires up the Redis adapter (see `applyRedisAdapter` below)
 *   — without it, `io.to(room).emit(...)` only reaches sockets connected to
 *   *this* instance, and two users on different instances could never reach
 *   each other.
 */

type SocketUser = { id: string; email: string; roles: Role[] };
type AuthedSocket = Socket & { user?: SocketUser };

export const rooms = {
  user: (id: string) => `user:${id}`,
  vendor: (id: string) => `vendor:${id}`,
  order: (id: string) => `order:${id}`,
  conversation: (id: string) => `conversation:${id}`,
};

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
    const order = await Order.findById(orderId).select("customer vendor shipping.driver");
    if (!order) return false;
    if (order.customer && String(order.customer) === user.id) return true;
    if (order.shipping?.driver && String(order.shipping.driver) === user.id) return true;
    return canReadVendor(user, String(order.vendor));
  } catch {
    return false;
  }
}

async function isAssignedDriver(user: SocketUser, orderId: string): Promise<boolean> {
  try {
    await connectToDatabase();
    const order = await Order.findById(orderId).select("shipping.driver");
    return Boolean(order?.shipping?.driver && String(order.shipping.driver) === user.id);
  } catch {
    return false;
  }
}

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

/** Auth + room/event handlers. Idempotent per `io` instance — call once. */
export function attachRealtimeHandlers(io: Server): void {
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
     * Rooms this socket has been cleared for — see the git history of this
     * file for why every join is checked server-side rather than trusting
     * whatever room name the client asks for.
     */
    const authorized = new Set<string>();

    socket.join(rooms.user(user.id));

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

    socket.on("driver:location", async ({ orderId, lat, lng }: { orderId: string; lat: number; lng: number }) => {
      const room = rooms.order(orderId);
      if (!authorized.has(room)) return;
      if (typeof lat !== "number" || typeof lng !== "number") return;
      if (!(await isAssignedDriver(user, orderId))) return;
      socket.to(room).emit("order:location", { orderId, lat, lng, at: new Date().toISOString() });
    });

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
}

/**
 * Relay events published by Next.js server actions (which never hold a
 * socket themselves) into the right rooms. Subscribes once per `io`
 * instance; safe to call alongside the Redis adapter below — this is a
 * separate channel carrying application events, not Socket.IO's own
 * inter-instance protocol.
 */
export function attachRedisBridge(io: Server): void {
  const subscriber = getRedis().duplicate();

  subscriber.subscribe(REALTIME_CHANNEL, (err) => {
    if (err) logger.error({ err }, "Failed to subscribe to realtime channel");
    else logger.info(`Realtime subscribed to ${REALTIME_CHANNEL}`);
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
}

/**
 * Cross-instance room broadcast. Required the moment more than one warm
 * instance can be handling connections at once (multiple concurrent Vercel
 * invocations, or ever running more than one standalone process) — without
 * it, `io.to(room).emit()` only reaches sockets on the instance that made
 * the call. Uses the same Redis deployment as everything else in this app;
 * a separate pub/sub-dedicated connection pair per Socket.IO's own
 * requirements (the adapter puts each into subscriber mode).
 */
export function applyRedisAdapter(io: Server): void {
  const pubClient = getRedis().duplicate();
  const subClient = getRedis().duplicate();
  io.adapter(createAdapter(pubClient, subClient));
}
