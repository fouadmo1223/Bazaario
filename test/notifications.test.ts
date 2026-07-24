import { describe, it, expect } from "vitest";
import { notificationService } from "@/server/services/notification.service";
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
