"use server";

import { revalidatePath } from "next/cache";
import { conversationService } from "@/server/services/conversation.service";
import { requireUser } from "@/server/security/current-user";
import { rateLimit } from "@/server/security/rate-limit";
import { toFailure, ok, type ApiResult } from "@/shared/lib/api-response";
import { Errors } from "@/shared/lib/errors";
import { startConversationSchema, sendMessageSchema, setStatusSchema } from "./schemas";
import type { ChatMessagePayload } from "@/shared/hooks/use-socket";

/**
 * Chat mutations.
 *
 * Every action re-authenticates: server actions are reachable by direct POST,
 * so a check the calling page did is not a check this endpoint did. Access to
 * the specific thread is then decided inside `conversationService`, which is
 * the only place that rule is written down.
 */

/**
 * Sending is rate limited per user rather than per thread. The abuse this
 * guards is a script blasting messages at many vendors at once, which a
 * per-thread limit would not touch.
 */
const SEND_LIMIT = { max: 30, windowSec: 60 };
const START_LIMIT = { max: 10, windowSec: 300 };

export async function startConversationAction(input: unknown): Promise<ApiResult<{ conversationId: string }>> {
  try {
    const user = await requireUser();
    await rateLimit(`chat:start:${user.id}`, START_LIMIT);

    const parsed = startConversationSchema.safeParse(input);
    if (!parsed.success) throw Errors.validation("Invalid message", parsed.error.flatten());

    const conversation = await conversationService.start(user, {
      kind: parsed.data.kind,
      vendorId: parsed.data.vendorId ?? null,
      withUserId: parsed.data.withUserId ?? null,
      subject: parsed.data.subject ?? null,
      orderId: parsed.data.orderId ?? null,
      productId: parsed.data.productId ?? null,
      body: parsed.data.body,
    });

    revalidatePath("/account/messages");
    revalidatePath("/dashboard/messages");
    return ok({ conversationId: String(conversation._id) }, { message: "Message sent." });
  } catch (err) {
    return toFailure(err);
  }
}

export async function sendMessageAction(input: unknown): Promise<ApiResult<ChatMessagePayload>> {
  try {
    const user = await requireUser();
    await rateLimit(`chat:send:${user.id}`, SEND_LIMIT);

    const parsed = sendMessageSchema.safeParse(input);
    if (!parsed.success) throw Errors.validation("Invalid message", parsed.error.flatten());

    const message = await conversationService.send(
      user,
      parsed.data.conversationId,
      parsed.data.body,
      parsed.data.attachments,
    );

    // Returned so the sender's own window can render it immediately rather than
    // waiting for the socket to echo it back — the thread hook de-duplicates
    // by id when the echo does arrive.
    return ok({
      id: String(message._id),
      conversationId: parsed.data.conversationId,
      body: message.body,
      attachments: parsed.data.attachments,
      system: false,
      senderId: user.id,
      senderName: user.email,
      createdAt: message.createdAt.toISOString(),
    });
  } catch (err) {
    return toFailure(err);
  }
}

export async function markConversationReadAction(conversationId: string): Promise<ApiResult<null>> {
  try {
    const user = await requireUser();
    await conversationService.markRead(user, conversationId);
    return ok(null);
  } catch (err) {
    return toFailure(err);
  }
}

export async function setConversationStatusAction(input: unknown): Promise<ApiResult<null>> {
  try {
    const user = await requireUser();
    const parsed = setStatusSchema.safeParse(input);
    if (!parsed.success) throw Errors.validation("Invalid status", parsed.error.flatten());

    await conversationService.setStatus(user, parsed.data.conversationId, parsed.data.status);

    revalidatePath("/dashboard/messages");
    revalidatePath(`/dashboard/messages/${parsed.data.conversationId}`);
    return ok(null, { message: `Thread marked ${parsed.data.status}.` });
  } catch (err) {
    return toFailure(err);
  }
}
