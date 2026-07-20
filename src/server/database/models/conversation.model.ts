import { Schema, model, models, type Model, type InferSchemaType, type HydratedDocument } from "mongoose";
import { basePlugin } from "../plugins/base.plugin";
import type { BaseFields } from "../types";
import { ROLES } from "@/shared/constants/rbac";

/**
 * A thread. Every chat in the platform is one of four shapes, and the `kind`
 * decides both who may read it and where it surfaces in the UI:
 *
 * | kind              | between                          | vendor field |
 * |-------------------|----------------------------------|--------------|
 * | `customer_vendor` | a shopper and a vendor's staff    | required     |
 * | `admin_vendor`    | the platform and a vendor's staff | required     |
 * | `admin_customer`  | the platform and a shopper        | null         |
 * | `internal`        | staff and super admins            | optional     |
 *
 * **Vendor-side threads are addressed to the vendor, not to a person.** Any
 * active staff member holding `ticket:respond` on `vendor` can read and reply,
 * even if they are not in `participants`. Pinning a thread to one employee
 * means it dies when that employee is off shift or leaves the company — the
 * shopper is then talking to nobody, with no signal that they are.
 *
 * `participants` therefore records who has *actually* taken part (for read
 * receipts and unread counts), and is not by itself the access-control list.
 * `conversation.service.assertCanAccess` is.
 */

export const CONVERSATION_KINDS = [
  "customer_vendor",
  "admin_vendor",
  "admin_customer",
  "internal",
] as const;

export const CONVERSATION_STATUSES = ["open", "pending", "resolved", "closed"] as const;

const participantSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    /** Role *at the time of joining* — a label for the UI, never an authorization input. */
    role: { type: String, enum: Object.values(ROLES), required: true },
    joinedAt: { type: Date, default: Date.now },
    /**
     * Unread counts are derived by counting messages newer than this, which
     * keeps them correct without a per-user counter to drift out of sync.
     */
    lastReadAt: { type: Date, default: null },
    muted: { type: Boolean, default: false },
  },
  { _id: false },
);

const conversationSchema = new Schema({
  kind: { type: String, enum: CONVERSATION_KINDS, required: true, index: true },
  vendor: { type: Schema.Types.ObjectId, ref: "Vendor", default: null, index: true },
  subject: { type: String, default: null },
  participants: { type: [participantSchema], default: [] },

  /** Optional deep-link context, so "about order #1032" is one click, not a paste. */
  order: { type: Schema.Types.ObjectId, ref: "Order", default: null },
  product: { type: Schema.Types.ObjectId, ref: "Product", default: null },

  status: { type: String, enum: CONVERSATION_STATUSES, default: "open", index: true },

  /**
   * Denormalized so the inbox list renders from one query instead of an N+1
   * over messages. Written in the same call that inserts the message.
   */
  lastMessageAt: { type: Date, default: Date.now },
  lastMessagePreview: { type: String, default: null },
  lastMessageBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  messageCount: { type: Number, default: 0 },
});

conversationSchema.plugin(basePlugin);

// Inbox: "my threads, newest first".
conversationSchema.index({ "participants.user": 1, lastMessageAt: -1 });
// Vendor inbox: every thread addressed to the vendor, filtered by status.
conversationSchema.index({ vendor: 1, status: 1, lastMessageAt: -1 });
// Admin inbox across all vendors.
conversationSchema.index({ kind: 1, status: 1, lastMessageAt: -1 });

export type ConversationKind = (typeof CONVERSATION_KINDS)[number];
export type ConversationStatus = (typeof CONVERSATION_STATUSES)[number];
export type ConversationRaw = InferSchemaType<typeof conversationSchema> & BaseFields;
export type ConversationDoc = HydratedDocument<ConversationRaw>;

export const Conversation: Model<ConversationRaw> =
  (models.Conversation as Model<ConversationRaw>) ??
  model<ConversationRaw>("Conversation", conversationSchema);
