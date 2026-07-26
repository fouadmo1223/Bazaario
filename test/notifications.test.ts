import { describe, it, expect, vi } from "vitest";
import Redis from "ioredis";
import { notificationService, REALTIME_CHANNEL, type RealtimeEvent } from "@/server/services/notification.service";
import { conversationService } from "@/server/services/conversation.service";
import { Notification } from "@/server/database/models/notification.model";
import { ROLES } from "@/shared/constants/rbac";
import { makeUser, makeVendor, makeMembership, actor } from "./factories";

/**
 * Notifications.
 *
 * Two things are worth pinning here, and neither is the bell's markup.
 *
 * The first is ownership. Every mutation takes an id and nothing else — the
 * caller is never asked which user they are, because the service supplies that
 * from the session. If that scoping is ever dropped, `markRead` becomes a way to
 * reach into someone else's inbox with a guessed id, and nothing about the call
 * site would look wrong.
 *
 * The second is the deep link. Chat notifications shipped pointing at
 * `/messages/{id}`, a route that never existed, so every one of them 404'd. That
 * bug was invisible until something finally rendered the links, which is exactly
 * the kind of thing a test should have caught.
 */

async function notify(userId: string, title = "Hello") {
  return notificationService.create({ userId, type: "system", title });
}

describe("notification ownership", () => {
  it("marks the owner's notification read", async () => {
    const user = await makeUser();
    const n = await notify(String(user._id));

    await notificationService.markRead(String(user._id), String(n._id));

    const after = await Notification.findById(n._id);
    expect(after!.readAt).not.toBeNull();
  });

  /**
   * The action takes only a notification id, so this is the check standing
   * between a guessed id and someone else's inbox.
   */
  it("refuses to mark another user's notification read", async () => {
    const owner = await makeUser();
    const stranger = await makeUser();
    const n = await notify(String(owner._id));

    await expect(
      notificationService.markRead(String(stranger._id), String(n._id)),
    ).rejects.toThrow();

    // Still unread: the write was refused, not merely unreported.
    const after = await Notification.findById(n._id);
    expect(after!.readAt).toBeNull();
  });

  it("marks all of the caller's unread without touching anyone else's", async () => {
    const user = await makeUser();
    const other = await makeUser();
    await notify(String(user._id), "mine 1");
    await notify(String(user._id), "mine 2");
    const theirs = await notify(String(other._id), "theirs");

    const updated = await notificationService.markAllRead(String(user._id));

    expect(updated).toBe(2);
    expect(await notificationService.unreadCount(String(user._id))).toBe(0);
    expect(await notificationService.unreadCount(String(other._id))).toBe(1);
    expect((await Notification.findById(theirs._id))!.readAt).toBeNull();
  });

  it("counts only the caller's unread", async () => {
    const user = await makeUser();
    const other = await makeUser();
    const read = await notify(String(user._id), "already read");
    await notify(String(user._id), "unread");
    await notify(String(other._id), "not mine");

    await notificationService.markRead(String(user._id), String(read._id));

    expect(await notificationService.unreadCount(String(user._id))).toBe(1);
  });

  it("lists only the caller's notifications, newest first", async () => {
    const user = await makeUser();
    const other = await makeUser();
    await notify(String(user._id), "older");
    await notify(String(user._id), "newer");
    await notify(String(other._id), "not mine");

    const page = await notificationService.list(String(user._id), {});

    expect(page.items).toHaveLength(2);
    expect(page.items.map((n) => n.title)).toEqual(["newer", "older"]);
  });
});

describe("chat notification deep link", () => {
  /**
   * The regression. A shopper opens a thread, staff reply (which joins them to
   * it), and the shopper's next message notifies that staff member — so the link
   * on a real chat notification is what gets asserted, not a hand-built string.
   */
  it("points at a route that exists", async () => {
    const customer = await makeUser();
    const vendor = await makeVendor();
    const staff = await makeUser();
    await makeMembership(staff._id, vendor._id, ROLES.SUPPORT);

    const conversation = await conversationService.start(actor(customer), {
      kind: "customer_vendor",
      vendorId: String(vendor._id),
      body: "Is this in stock?",
    });
    const conversationId = String(conversation._id);

    // Replying is what adds a shared-inbox staff member to the participants.
    await conversationService.send(actor(staff), conversationId, "Yes, it is.");
    await conversationService.send(actor(customer), conversationId, "Great, thanks.");

    const forStaff = await Notification.find({ user: staff._id }).sort({ createdAt: -1 });
    expect(forStaff.length).toBeGreaterThan(0);

    const link = forStaff[0]!.link;
    expect(link).toBe(`/account/messages/${conversationId}`);

    // The shape that shipped broken: `/messages/{id}` has no route behind it.
    expect(link).not.toBe(`/messages/${conversationId}`);
    expect(link!.startsWith("/messages/")).toBe(false);
  });
});

/**
 * The realtime server decides whether to send the email fallback purely from
 * `channels` on the event it relays — it never re-reads the stored
 * notification. So the event `notificationService` publishes is the contract;
 * a raw subscriber here (mirroring what the standalone realtime process does)
 * is what pins it, since nothing else in this suite touches Redis pub/sub.
 */
describe("realtime event channels", () => {
  /** `send()` also publishes a `chat:message` event before `notification` — filter for kind. */
  async function collectNotification(
    trigger: () => Promise<unknown>,
  ): Promise<RealtimeEvent & { kind: "notification" }> {
    const sub = new Redis(process.env.REDIS_URL!);
    const events: RealtimeEvent[] = [];
    await sub.subscribe(REALTIME_CHANNEL);
    sub.on("message", (_channel, raw) => events.push(JSON.parse(raw) as RealtimeEvent));
    try {
      await trigger();
      await vi.waitFor(() => {
        if (!events.some((e) => e.kind === "notification")) throw new Error("no notification event received yet");
      });
      return events.find((e): e is RealtimeEvent & { kind: "notification" } => e.kind === "notification")!;
    } finally {
      await sub.quit();
    }
  }

  it("defaults an in-app notification to no email fallback", async () => {
    const user = await makeUser();
    const event = await collectNotification(() => notify(String(user._id)));
    expect(event.channels).toEqual(["in_app"]);
  });

  it("carries an explicit email channel through to the published event", async () => {
    const user = await makeUser();
    const event = await collectNotification(() =>
      notificationService.create({ userId: String(user._id), type: "system", title: "Hi", channels: ["in_app", "email"] }),
    );
    expect(event.channels).toEqual(["in_app", "email"]);
  });

  it("opts a chat reply into the email fallback, for a recipient who might not have the tab open", async () => {
    const customer = await makeUser();
    const vendor = await makeVendor();
    const staff = await makeUser();
    await makeMembership(staff._id, vendor._id, ROLES.SUPPORT);

    const conversation = await conversationService.start(actor(customer), {
      kind: "customer_vendor",
      vendorId: String(vendor._id),
      body: "Is this in stock?",
    });

    const event = await collectNotification(() =>
      conversationService.send(actor(staff), String(conversation._id), "Yes, it is."),
    );
    expect(event.channels).toContain("email");
  });
});
