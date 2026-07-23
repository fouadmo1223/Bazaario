import { z } from "zod";
import { CONVERSATION_KINDS, CONVERSATION_STATUSES } from "@/server/database/models/conversation.model";
import { MAX_BODY_LENGTH } from "@/server/services/conversation.service";

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid id");

const body = z
  .string()
  .trim()
  .min(1, "Message cannot be empty")
  .max(MAX_BODY_LENGTH, `Message cannot exceed ${MAX_BODY_LENGTH} characters`);

export const startConversationSchema = z.object({
  kind: z.enum(CONVERSATION_KINDS),
  vendorId: objectId.nullish(),
  withUserId: objectId.nullish(),
  subject: z.string().trim().max(200).nullish(),
  orderId: objectId.nullish(),
  productId: objectId.nullish(),
  body,
});

export const sendMessageSchema = z
  .object({
    conversationId: objectId,
    // Optional here (not the shared `body`, which requires ≥1 char): a message
    // may be an attachment with no caption. The refinement below still forbids
    // a message that is entirely empty.
    body: z.string().trim().max(MAX_BODY_LENGTH).default(""),
    attachments: z
      .array(
        z.object({
          url: z.string().url(),
          name: z.string().trim().min(1).max(200),
          mime: z.string().max(100).optional(),
          size: z.number().int().nonnegative().optional(),
        }),
      )
      .max(10)
      .default([]),
  })
  .refine((d) => d.body.length > 0 || d.attachments.length > 0, {
    message: "Message cannot be empty",
    path: ["body"],
  });

export const setStatusSchema = z.object({
  conversationId: objectId,
  status: z.enum(CONVERSATION_STATUSES),
});

export type StartConversationInput = z.infer<typeof startConversationSchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
