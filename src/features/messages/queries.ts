import { conversationService, type Actor } from "@/server/services/conversation.service";
import type { ConversationKind, ConversationStatus } from "@/server/database/models/conversation.model";
import type { ChatMessagePayload } from "@/shared/hooks/use-socket";

/**
 * Read models for the messaging screens. Server Components render these and
 * hand them to client components, so every field is plain and serializable —
 * no Mongoose documents or ObjectIds cross the boundary.
 */

export type ConversationRow = {
  id: string;
  kind: ConversationKind;
  status: ConversationStatus;
  subject: string | null;
  vendorName: string | null;
  vendorSlug: string | null;
  /** Everyone in the thread except the viewer — the "who am I talking to" line. */
  counterparties: string[];
  lastMessagePreview: string | null;
  lastMessageAt: string;
  messageCount: number;
  unread: number;
};

type PopulatedUser = { _id: unknown; name?: string | null; email?: string | null };
type PopulatedVendor = { _id: unknown; name?: string | null; slug?: string | null };

function displayName(user: PopulatedUser | null | undefined): string {
  if (!user) return "Unknown";
  return user.name || user.email || "Unknown";
}

export type Inbox = {
  items: ConversationRow[];
  page: number;
  totalPages: number;
  total: number;
};

/**
 * One inbox, for any of the three audiences.
 *
 * `vendorId` switches from "threads I am in" to the vendor's shared inbox, and
 * `platform` to every thread addressed to the platform. The caller must have
 * already authorized the vendor — this function does not re-check it, because
 * the pages that pass it have to resolve the vendor with
 * `requireVendorPermission` anyway to know which one to show. The `platform`
 * scope is re-checked in the service, since it is not tied to a vendor.
 */
export async function listInbox(
  actor: Actor,
  query: { page?: string },
  opts: {
    vendorId?: string;
    kind?: ConversationKind;
    status?: ConversationStatus;
    platform?: boolean;
  } = {},
): Promise<Inbox> {
  const paginated = await conversationService.listForUser(actor, { page: query.page }, opts);
  const ids = paginated.items.map((c) => String(c._id));
  const unread = await conversationService.unreadByConversation(actor, ids);

  const items: ConversationRow[] = paginated.items.map((c) => {
    const vendor = c.vendor as unknown as PopulatedVendor | null;
    return {
      id: String(c._id),
      kind: c.kind,
      status: c.status,
      subject: c.subject ?? null,
      vendorName: vendor?.name ?? null,
      vendorSlug: vendor?.slug ?? null,
      counterparties: c.participants
        .filter((p) => String((p.user as unknown as PopulatedUser)?._id ?? p.user) !== actor.id)
        .map((p) => displayName(p.user as unknown as PopulatedUser)),
      lastMessagePreview: c.lastMessagePreview ?? null,
      lastMessageAt: c.lastMessageAt.toISOString(),
      messageCount: c.messageCount,
      unread: unread[String(c._id)] ?? 0,
    };
  });

  return {
    items,
    page: paginated.page,
    totalPages: paginated.totalPages,
    total: paginated.total,
  };
}

export type Thread = {
  id: string;
  kind: ConversationKind;
  status: ConversationStatus;
  subject: string | null;
  vendorName: string | null;
  counterparties: string[];
  orderId: string | null;
  messages: ChatMessagePayload[];
  /** Whether the viewer may resolve/close — drives whether those controls render. */
  canModerate: boolean;
};

/**
 * A thread and its most recent page of messages.
 *
 * Messages come back newest-first from the service (that is the useful order
 * for pagination) and are reversed here, because a chat log reads top-down.
 */
export async function getThread(
  actor: Actor,
  conversationId: string,
  opts: { canModerate?: boolean } = {},
): Promise<Thread> {
  const conversation = await conversationService.get(actor, conversationId);
  const page = await conversationService.messages(actor, conversationId, { limit: "50" });

  const vendor = conversation.vendor as unknown as PopulatedVendor | null;

  const messages: ChatMessagePayload[] = page.items
    .slice()
    .reverse()
    .map((m) => {
      const sender = m.sender as unknown as PopulatedUser | null;
      return {
        id: String(m._id),
        conversationId,
        body: m.body,
        attachments: m.attachments.map((a) => ({
          url: a.url,
          name: a.name,
          mime: a.mime ?? undefined,
          size: a.size ?? undefined,
        })),
        system: m.system,
        senderId: sender ? String(sender._id) : null,
        senderName: m.system ? "System" : displayName(sender),
        createdAt: m.createdAt.toISOString(),
      };
    });

  // Reading the thread is what marks it read; doing it here means the badge
  // clears on open without the client needing a second round-trip.
  await conversationService.markRead(actor, conversationId);

  return {
    id: conversationId,
    kind: conversation.kind,
    status: conversation.status,
    subject: conversation.subject ?? null,
    vendorName: vendor?.name ?? null,
    counterparties: conversation.participants
      .filter((p) => String((p.user as unknown as PopulatedUser)?._id ?? p.user) !== actor.id)
      .map((p) => displayName(p.user as unknown as PopulatedUser)),
    orderId: conversation.order ? String(conversation.order) : null,
    messages,
    canModerate: opts.canModerate ?? false,
  };
}
