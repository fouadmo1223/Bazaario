import { Schema, model, models, type Model, type InferSchemaType, type HydratedDocument } from "mongoose";
import { basePlugin } from "../plugins/base.plugin";
import type { BaseFields } from "../types";

/**
 * One message in a Conversation.
 *
 * Messages are their own collection rather than an array on the conversation:
 * a busy support thread is unbounded, and Mongo's 16MB document ceiling makes
 * an embedded array a latent outage rather than a design choice. It also lets
 * the thread view paginate backwards without loading the whole history.
 */

const attachmentSchema = new Schema(
  {
    url: { type: String, required: true },
    name: { type: String, required: true },
    mime: { type: String, default: null },
    size: { type: Number, default: null },
  },
  { _id: false },
);

const messageSchema = new Schema({
  conversation: { type: Schema.Types.ObjectId, ref: "Conversation", required: true, index: true },
  /** Null for system messages ("Order marked shipped", "Thread closed by admin"). */
  sender: { type: Schema.Types.ObjectId, ref: "User", default: null },
  // Not required: an attachment-only message (a photo with no caption) is a
  // normal thing to send, and `required` rejects the empty string.
  body: { type: String, default: "" },
  attachments: { type: [attachmentSchema], default: [] },
  /** System messages are rendered as a centred notice, not a chat bubble. */
  system: { type: Boolean, default: false },
  editedAt: { type: Date, default: null },
});

messageSchema.plugin(basePlugin);

// The only read path that matters: a page of one thread, newest first.
messageSchema.index({ conversation: 1, createdAt: -1 });

export type MessageRaw = InferSchemaType<typeof messageSchema> & BaseFields;
export type MessageDoc = HydratedDocument<MessageRaw>;

export const Message: Model<MessageRaw> =
  (models.Message as Model<MessageRaw>) ??
  model<MessageRaw>("Message", messageSchema);
