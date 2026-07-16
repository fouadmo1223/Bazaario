import { connectToDatabase } from "@/server/database/connection";
import { Notification, type NotificationDoc, type NotificationType } from "@/server/database/models/notification.model";
import { getRedis } from "@/server/cache/redis";
import { logger } from "@/shared/lib/logger";
import { paginationSchema, buildPaginated, type Paginated } from "@/shared/lib/pagination";
import { Errors } from "@/shared/lib/errors";

export type CreateNotificationInput = {
  userId: string;
  vendorId?: string | null;
  type: NotificationType;
  title: string;
  body?: string;
  link?: string;
  data?: unknown;
  channels?: ("in_app" | "email" | "push" | "sms")[];
};

/** Redis pub/sub channel the Socket.IO server subscribes to. */
export const REALTIME_CHANNEL = "realtime:events";

export type RealtimeEvent =
  | { kind: "notification"; userId: string; payload: Record<string, unknown> }
  | { kind: "order:update"; vendor: string; orderId: string; status: string }
  | { kind: "chat:message"; ticketId: string; payload: Record<string, unknown> };

/**
 * Publish an event for the Socket.IO server to fan out. Serverless functions
 * can't hold sockets, so they publish to Redis and the standalone realtime
 * server relays to connected clients.
 */
export async function publishRealtime(event: RealtimeEvent): Promise<void> {
  try {
    await getRedis().publish(REALTIME_CHANNEL, JSON.stringify(event));
  } catch (err) {
    logger.error({ err, kind: event.kind }, "Failed to publish realtime event");
  }
}

export const notificationService = {
  async create(input: CreateNotificationInput): Promise<NotificationDoc> {
    await connectToDatabase();
    const notification = await Notification.create({
      user: input.userId,
      vendor: input.vendorId ?? null,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      link: input.link ?? null,
      data: input.data ?? null,
      channels: input.channels ?? ["in_app"],
    });

    // Push to the user's socket room in real time.
    await publishRealtime({
      kind: "notification",
      userId: input.userId,
      payload: {
        id: String(notification._id),
        type: notification.type,
        title: notification.title,
        body: notification.body,
        link: notification.link,
        createdAt: notification.createdAt,
      },
    });

    return notification;
  },

  /** Bulk create (campaigns). Uses insertMany for a single round-trip. */
  async createMany(inputs: CreateNotificationInput[]): Promise<number> {
    await connectToDatabase();
    if (!inputs.length) return 0;
    const docs = await Notification.insertMany(
      inputs.map((i) => ({
        user: i.userId,
        vendor: i.vendorId ?? null,
        type: i.type,
        title: i.title,
        body: i.body ?? null,
        link: i.link ?? null,
        data: i.data ?? null,
        channels: i.channels ?? ["in_app"],
      })),
    );
    await Promise.all(
      inputs.map((i, idx) =>
        publishRealtime({
          kind: "notification",
          userId: i.userId,
          payload: { id: String(docs[idx]._id), type: i.type, title: i.title, link: i.link ?? null },
        }),
      ),
    );
    return docs.length;
  },

  async list(userId: string, query: unknown): Promise<Paginated<NotificationDoc>> {
    await connectToDatabase();
    const pagination = paginationSchema.parse(query);
    const skip = (pagination.page - 1) * pagination.limit;
    const [items, total] = await Promise.all([
      Notification.find({ user: userId }).sort({ createdAt: -1 }).skip(skip).limit(pagination.limit).exec(),
      Notification.countDocuments({ user: userId }).exec(),
    ]);
    return buildPaginated(items, total, pagination);
  },

  async unreadCount(userId: string): Promise<number> {
    await connectToDatabase();
    return Notification.countDocuments({ user: userId, readAt: null });
  },

  async markRead(userId: string, notificationId: string): Promise<void> {
    await connectToDatabase();
    const result = await Notification.updateOne(
      { _id: notificationId, user: userId },
      { $set: { readAt: new Date() } },
    );
    if (result.matchedCount === 0) throw Errors.notFound("Notification not found");
  },

  async markAllRead(userId: string): Promise<number> {
    await connectToDatabase();
    const result = await Notification.updateMany(
      { user: userId, readAt: null },
      { $set: { readAt: new Date() } },
    );
    return result.modifiedCount;
  },
};
