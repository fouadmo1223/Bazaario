import { Schema, model, models, type Model, type InferSchemaType, type HydratedDocument } from "mongoose";
import { basePlugin } from "../plugins/base.plugin";
import type { BaseFields } from "../types";

export const NOTIFICATION_TYPES = [
  "order_placed", "order_status", "payment_received", "refund_issued",
  "low_stock", "back_in_stock", "review_posted", "ticket_reply",
  "campaign", "system",
] as const;

const notificationSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  vendor: { type: Schema.Types.ObjectId, ref: "Vendor", default: null, index: true },
  type: { type: String, enum: NOTIFICATION_TYPES, required: true },
  title: { type: String, required: true },
  body: { type: String, default: null },
  /** Deep-link target for the client, e.g. /account/orders/123 */
  link: { type: String, default: null },
  data: { type: Schema.Types.Mixed, default: null },
  channels: { type: [String], enum: ["in_app", "email", "push", "sms"], default: ["in_app"] },
  readAt: { type: Date, default: null, index: true },
});

notificationSchema.plugin(basePlugin);
notificationSchema.index({ user: 1, readAt: 1, createdAt: -1 });

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];
export type NotificationRaw = InferSchemaType<typeof notificationSchema> & BaseFields;
export type NotificationDoc = HydratedDocument<NotificationRaw>;

export const Notification: Model<NotificationRaw> =
  (models.Notification as Model<NotificationRaw>) ??
  model<NotificationRaw>("Notification", notificationSchema);
