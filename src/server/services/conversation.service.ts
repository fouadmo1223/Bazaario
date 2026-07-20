import { Types } from "mongoose";
import { connectToDatabase } from "@/server/database/connection";
import {
  Conversation,
  type ConversationDoc,
  type ConversationKind,
  type ConversationStatus,
} from "@/server/database/models/conversation.model";
import { Message, type MessageDoc } from "@/server/database/models/message.model";
import { Membership } from "@/server/database/models/membership.model";
import { User } from "@/server/database/models/user.model";
import { notificationService, publishRealtime } from "./notification.service";
import { ROLES, PERMISSIONS, roleHasPermission, type Role, type Permission } from "@/shared/constants/rbac";
import { paginationSchema, buildPaginated, type Paginated } from "@/shared/lib/pagination";
import { Errors } from "@/shared/lib/errors";
import { logger } from "@/shared/lib/logger";

export type Actor = { id: string; roles: Role[] };

/** Message bodies are capped so one paste cannot blow out the thread view. */
export const MAX_BODY_LENGTH = 5000;

function isSuperAdmin(actor: Actor): boolean {
  return actor.roles.includes(ROLES.SUPER_ADMIN);
}

function isParticipant(conversation: ConversationDoc, userId: string): boolean {
  return conversation.participants.some((p) => String(p.user) === userId);
}

/**
 * Does the actor hold `permission` on `vendorId` through an active membership?
 *
 * Deliberately does not reuse `requireVendorPermission` from the security layer:
 * that helper reads the session cookie, and this runs in contexts that have no
 * request — the Socket.IO process, and background sends.
 */
async function hasVendorPermission(
  userId: string,
  vendorId: string,
  permission: Permission,
): Promise<boolean> {
  const membership = await Membership.findOne({ user: userId, vendor: vendorId, status: "active" });
  if (!membership) return false;
  const role = membership.role as Role;
  return roleHasPermission(role, permission) || (membership.permissions as Permission[]).includes(permission);
}

/**
 * The single gate every read and write goes through.
 *
 * Access is granted by *any* of: super admin, being a recorded participant, or
 * holding `ticket:respond` on the thread's vendor. That last clause is what
 * makes a vendor inbox a shared inbox rather than one employee's private DMs —
 * see the note on the Conversation model.
 */
export async function assertCanAccess(
  conversationId: string,
  actor: Actor,
): Promise<ConversationDoc> {
  await connectToDatabase();
  if (!Types.ObjectId.isValid(conversationId)) throw Errors.notFound("Conversation not found");

  const conversation = await Conversation.findById(conversationId);
  if (!conversation) throw Errors.notFound("Conversation not found");

  if (isSuperAdmin(actor)) return conversation;
  if (isParticipant(conversation, actor.id)) return conversation;

  if (conversation.vendor) {
    const staff = await hasVendorPermission(actor.id, String(conversation.vendor), PERMISSIONS.TICKET_RESPOND);
    if (staff) return conversation;
  }

  throw Errors.forbidden("You do not have access to this conversation");
}

/** Non-throwing variant for the socket layer, which must not leak why a join failed. */
export async function canAccess(conversationId: string, actor: Actor): Promise<boolean> {
  try {
    await assertCanAccess(conversationId, actor);
    return true;
  } catch {
    return false;
  }
}

type StartInput = {
  kind: ConversationKind;
  vendorId?: string | null;
  /** Required when a super admin opens a thread *with* someone. */
  withUserId?: string | null;
  subject?: string | null;
  orderId?: string | null;
  productId?: string | null;
  body: string;
};

/**
 * Who is allowed to *open* each kind of thread. Reading and replying are
 * governed by `assertCanAccess`; this is the narrower question of who may
 * create one in the first place, and it is where the "customers cannot cold-DM
 * each other" rule lives.
 */
async function assertCanStart(actor: Actor, input: StartInput): Promise<void> {
  switch (input.kind) {
    case "customer_vendor":
      // Any signed-in shopper may write to a vendor. The vendor is a business
      // that chose to sell here; being reachable is the deal.
      if (!input.vendorId) throw Errors.validation("A vendor is required");
      return;

    case "admin_customer":
      // A shopper contacting platform support, or an admin reaching a shopper.
      if (isSuperAdmin(actor)) {
        if (!input.withUserId) throw Errors.validation("A recipient is required");
      }
      return;

    case "admin_vendor": {
      if (isSuperAdmin(actor)) {
        if (!input.vendorId) throw Errors.validation("A vendor is required");
        return;
      }
      // Vendor side: only staff who can speak for the vendor.
      if (!input.vendorId) throw Errors.validation("A vendor is required");
      const staff = await hasVendorPermission(actor.id, input.vendorId, PERMISSIONS.TICKET_RESPOND);
      if (!staff) throw Errors.forbidden("You cannot open a thread for this vendor");
      return;
    }

    case "internal":
      // Staff-to-admin. Customers have no business here, and letting them in
      // would expose internal threads through the same inbox they already use.
      if (!isSuperAdmin(actor) && actor.roles.every((r) => r === ROLES.CUSTOMER || r === ROLES.GUEST)) {
        throw Errors.forbidden("Internal threads are for staff");
      }
      if (!input.withUserId && !isSuperAdmin(actor)) return;
      return;
  }
}

/** Resolve the counterparty rows to seed `participants` with. */
async function initialParticipants(
  actor: Actor,
  input: StartInput,
): Promise<{ user: Types.ObjectId; role: Role }[]> {
  const rows: { user: Types.ObjectId; role: Role }[] = [
    { user: new Types.ObjectId(actor.id), role: actor.roles[0] ?? ROLES.CUSTOMER },
  ];

  if (input.withUserId && input.withUserId !== actor.id) {
    const other = await User.findById(input.withUserId).select("roles");
    if (!other) throw Errors.notFound("Recipient not found");
    rows.push({
      user: new Types.ObjectId(input.withUserId),
      role: ((other.roles as Role[])[0] ?? ROLES.CUSTOMER),
    });
  }

  return rows;
}

export const conversationService = {
  /**
   * Open a thread, or return the existing one.
   *
   * Reuse is keyed on (kind, vendor, opener, order) so a shopper asking a second
   * question about the same order lands back in the thread the vendor is already
   * reading, instead of forking a parallel one nobody notices. Threads that were
   * explicitly closed are not reused — reopening a resolved ticket by replying
   * would hide the new question inside a thread the vendor has filed away.
   */
  async start(actor: Actor, input: StartInput): Promise<ConversationDoc> {
    await connectToDatabase();
    await assertCanStart(actor, input);

    const body = input.body.trim();
    if (!body) throw Errors.validation("Message cannot be empty");
    if (body.length > MAX_BODY_LENGTH) throw Errors.validation("Message is too long");

    const existing = await Conversation.findOne({
      kind: input.kind,
      vendor: input.vendorId ?? null,
      order: input.orderId ?? null,
      "participants.user": actor.id,
      status: { $in: ["open", "pending"] },
    });

    const conversation =
      existing ??
      (await Conversation.create({
        kind: input.kind,
        vendor: input.vendorId ?? null,
        subject: input.subject?.trim() || null,
        order: input.orderId ?? null,
        product: input.productId ?? null,
        participants: await initialParticipants(actor, input),
        createdBy: actor.id,
      }));

    await this.send(actor, String(conversation._id), body);
    return conversation;
  },

  /**
   * Append a message and fan it out.
   *
   * The conversation's denormalized preview fields are updated in the same call
   * so the inbox list never shows a thread whose preview predates its newest
   * message.
   */
  async send(
    actor: Actor,
    conversationId: string,
    body: string,
    attachments: { url: string; name: string; mime?: string; size?: number }[] = [],
  ): Promise<MessageDoc> {
    const conversation = await assertCanAccess(conversationId, actor);

    const text = body.trim();
    if (!text) throw Errors.validation("Message cannot be empty");
    if (text.length > MAX_BODY_LENGTH) throw Errors.validation("Message is too long");

    const message = await Message.create({
      conversation: conversation._id,
      sender: actor.id,
      body: text,
      attachments,
      createdBy: actor.id,
    });

    // Answering pulls a thread back to "open" — a vendor replying to a ticket
    // they had marked pending has, by replying, made it active again.
    await Conversation.updateOne(
      { _id: conversation._id },
      {
        $set: {
          lastMessageAt: message.createdAt,
          lastMessagePreview: text.slice(0, 140),
          lastMessageBy: actor.id,
          ...(conversation.status === "pending" ? { status: "open" as ConversationStatus } : {}),
        },
        $inc: { messageCount: 1 },
      },
    );

    // A staff member who replies has joined the thread, whether or not they
    // were seeded into it — otherwise shared-inbox replies show no author in
    // the participant list and never get read receipts.
    if (!isParticipant(conversation, actor.id)) {
      await Conversation.updateOne(
        { _id: conversation._id, "participants.user": { $ne: actor.id } },
        {
          $push: {
            participants: {
              user: new Types.ObjectId(actor.id),
              role: actor.roles[0] ?? ROLES.CUSTOMER,
              joinedAt: new Date(),
              lastReadAt: new Date(),
            },
          },
        },
      );
    }

    const sender = await User.findById(actor.id).select("name email");
    const payload = {
      id: String(message._id),
      conversationId: String(conversation._id),
      body: text,
      attachments,
      system: false,
      senderId: actor.id,
      senderName: sender?.name ?? sender?.email ?? "Unknown",
      createdAt: message.createdAt.toISOString(),
    };

    await publishRealtime({ kind: "chat:message", conversationId: String(conversation._id), payload });
    await this.notifyOthers(conversation, actor, text);

    return message;
  },

  /**
   * In-app notification for everyone in the thread except the sender.
   *
   * Best-effort: a notification failure must not roll back a message the sender
   * has already seen appear in their own window.
   */
  async notifyOthers(conversation: ConversationDoc, actor: Actor, preview: string): Promise<void> {
    try {
      const recipients = conversation.participants
        .filter((p) => String(p.user) !== actor.id && !p.muted)
        .map((p) => String(p.user));
      if (!recipients.length) return;

      await notificationService.createMany(
        recipients.map((userId) => ({
          userId,
          vendorId: conversation.vendor ? String(conversation.vendor) : null,
          type: "ticket_reply" as const,
          title: conversation.subject || "New message",
          body: preview.slice(0, 140),
          link: `/messages/${String(conversation._id)}`,
        })),
      );
    } catch (err) {
      logger.error({ err, conversationId: String(conversation._id) }, "Failed to notify conversation participants");
    }
  },

  /** A system notice in the thread — status changes, order events. */
  async systemMessage(conversationId: string, body: string): Promise<void> {
    await connectToDatabase();
    const message = await Message.create({ conversation: conversationId, sender: null, body, system: true });
    await Conversation.updateOne(
      { _id: conversationId },
      { $set: { lastMessageAt: message.createdAt, lastMessagePreview: body.slice(0, 140) }, $inc: { messageCount: 1 } },
    );
    await publishRealtime({
      kind: "chat:message",
      conversationId,
      payload: {
        id: String(message._id),
        conversationId,
        body,
        attachments: [],
        system: true,
        senderId: null,
        senderName: "System",
        createdAt: message.createdAt.toISOString(),
      },
    });
  },

  /**
   * The actor's inbox.
   *
   * `vendorId` switches this from "threads I am in" to "every thread addressed
   * to this vendor" — the shared-inbox view — and is authorized by the caller
   * before it gets here.
   */
  async listForUser(
    actor: Actor,
    query: unknown,
    opts: { vendorId?: string; kind?: ConversationKind; status?: ConversationStatus } = {},
  ): Promise<Paginated<ConversationDoc>> {
    await connectToDatabase();
    const pagination = paginationSchema.parse(query);
    const skip = (pagination.page - 1) * pagination.limit;

    const filter: Record<string, unknown> = {};
    if (opts.vendorId) filter.vendor = opts.vendorId;
    else if (!opts.kind || !isSuperAdmin(actor)) filter["participants.user"] = actor.id;
    if (opts.kind) filter.kind = opts.kind;
    if (opts.status) filter.status = opts.status;

    const [items, total] = await Promise.all([
      Conversation.find(filter)
        .sort({ lastMessageAt: -1 })
        .skip(skip)
        .limit(pagination.limit)
        .populate("participants.user", "name email")
        .populate("vendor", "name slug")
        .exec(),
      Conversation.countDocuments(filter).exec(),
    ]);

    return buildPaginated(items, total, pagination);
  },

  /** One page of a thread, oldest-last, with the newest page returned first. */
  async messages(actor: Actor, conversationId: string, query: unknown): Promise<Paginated<MessageDoc>> {
    await assertCanAccess(conversationId, actor);
    const pagination = paginationSchema.parse(query);
    const skip = (pagination.page - 1) * pagination.limit;

    const [items, total] = await Promise.all([
      Message.find({ conversation: conversationId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(pagination.limit)
        .populate("sender", "name email")
        .exec(),
      Message.countDocuments({ conversation: conversationId }).exec(),
    ]);

    return buildPaginated(items, total, pagination);
  },

  async get(actor: Actor, conversationId: string): Promise<ConversationDoc> {
    const conversation = await assertCanAccess(conversationId, actor);
    await conversation.populate("participants.user", "name email");
    await conversation.populate("vendor", "name slug");
    return conversation;
  },

  /**
   * Mark the thread read up to now.
   *
   * Uses a positional update on the actor's own participant row; a staff member
   * reading a shared-inbox thread they never joined has nothing to mark, and
   * that is correct — they are not being counted as unread either.
   */
  async markRead(actor: Actor, conversationId: string): Promise<void> {
    await assertCanAccess(conversationId, actor);
    await Conversation.updateOne(
      { _id: conversationId, "participants.user": actor.id },
      { $set: { "participants.$.lastReadAt": new Date() } },
    );
  },

  /**
   * Unread totals per thread for the actor, as a map keyed by conversation id.
   *
   * Counted from `lastReadAt` rather than stored, so it cannot drift; one
   * aggregation covers the whole inbox instead of a query per row.
   */
  async unreadByConversation(actor: Actor, conversationIds: string[]): Promise<Record<string, number>> {
    await connectToDatabase();
    if (!conversationIds.length) return {};

    const conversations = await Conversation.find({ _id: { $in: conversationIds } })
      .select("participants")
      .exec();

    // Each thread has its own cutoff, so the match is an $or of per-thread
    // clauses rather than one range — this keeps the counting in Mongo instead
    // of shipping every message's timestamp back to count them here.
    const clauses = conversations.map((c) => {
      const mine = c.participants.find((p) => String(p.user) === actor.id);
      const cutoff = mine?.lastReadAt ?? null;
      return cutoff
        ? { conversation: c._id, createdAt: { $gt: cutoff } }
        : { conversation: c._id };
    });
    if (!clauses.length) return {};

    const counts = await Message.aggregate<{ _id: Types.ObjectId; count: number }>([
      {
        $match: {
          $or: clauses,
          sender: { $ne: new Types.ObjectId(actor.id) },
          deletedAt: null,
        },
      },
      { $group: { _id: "$conversation", count: { $sum: 1 } } },
    ]);

    const result: Record<string, number> = {};
    for (const row of counts) result[String(row._id)] = row.count;
    return result;
  },

  /** Total unread across every thread the actor participates in — for the nav badge. */
  async unreadTotal(actor: Actor): Promise<number> {
    await connectToDatabase();
    const conversations = await Conversation.find({ "participants.user": actor.id })
      .select("_id")
      .limit(200)
      .exec();
    const map = await this.unreadByConversation(actor, conversations.map((c) => String(c._id)));
    return Object.values(map).reduce((sum, n) => sum + n, 0);
  },

  /**
   * Change a thread's status. Only the answering side may resolve or close —
   * a shopper closing their own complaint is almost always a misclick, and a
   * vendor should not be able to make an unanswered question disappear from
   * the platform's view, so super admins can always act.
   */
  async setStatus(actor: Actor, conversationId: string, status: ConversationStatus): Promise<void> {
    const conversation = await assertCanAccess(conversationId, actor);

    if (!isSuperAdmin(actor)) {
      const responder = conversation.vendor
        ? await hasVendorPermission(actor.id, String(conversation.vendor), PERMISSIONS.TICKET_RESPOND)
        : false;
      if (!responder) throw Errors.forbidden("Only the responding side can change the status");
    }

    await Conversation.updateOne({ _id: conversationId }, { $set: { status, updatedBy: actor.id } });
    await this.systemMessage(conversationId, `Thread marked ${status}.`);
  },
};
