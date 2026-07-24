import { describe, it, expect } from "vitest";
import { conversationService, assertCanAccess } from "@/server/services/conversation.service";
import { Conversation } from "@/server/database/models/conversation.model";
import { Message } from "@/server/database/models/message.model";
import { ROLES } from "@/shared/constants/rbac";
import { makeUser, makeVendor, makeMembership, actor } from "./factories";

/**
 * Who can read and write a thread.
 *
 * This is the security boundary of the messaging feature: everything else in it
 * assumes `assertCanAccess` is correct. The socket server's room joins call the
 * same function, so a hole here is also a hole in the live feed.
 */
describe("conversation access control", () => {
  it("lets a participant read their own thread", async () => {
    const customer = await makeUser();
    const vendor = await makeVendor();

    const conversation = await conversationService.start(actor(customer), {
      kind: "customer_vendor",
      vendorId: String(vendor._id),
      body: "Is this in stock?",
    });

    await expect(assertCanAccess(String(conversation._id), actor(customer))).resolves.toBeTruthy();
  });

  it("refuses an unrelated customer", async () => {
    const customer = await makeUser();
    const stranger = await makeUser();
    const vendor = await makeVendor();

    const conversation = await conversationService.start(actor(customer), {
      kind: "customer_vendor",
      vendorId: String(vendor._id),
      body: "Is this in stock?",
    });

    await expect(assertCanAccess(String(conversation._id), actor(stranger))).rejects.toThrow();
  });

  /**
   * The shared-inbox rule. Staff are not participants when a customer opens a
   * thread, so if access required participation the vendor could never see its
   * own mail.
   */
  it("grants a vendor's staff a thread they were never added to", async () => {
    const customer = await makeUser();
    const vendor = await makeVendor();
    const staff = await makeUser([ROLES.CUSTOMER, ROLES.VENDOR]);
    await makeMembership(staff._id, vendor._id, ROLES.VENDOR);

    const conversation = await conversationService.start(actor(customer), {
      kind: "customer_vendor",
      vendorId: String(vendor._id),
      body: "Is this in stock?",
    });

    const participantIds = conversation.participants.map((p) => String(p.user));
    expect(participantIds).not.toContain(String(staff._id));

    await expect(assertCanAccess(String(conversation._id), actor(staff))).resolves.toBeTruthy();
  });

  /** Tenant isolation: the whole point of scoping threads to a vendor. */
  it("refuses staff of a different vendor", async () => {
    const customer = await makeUser();
    const vendorA = await makeVendor();
    const vendorB = await makeVendor();
    const staffB = await makeUser([ROLES.CUSTOMER, ROLES.VENDOR]);
    await makeMembership(staffB._id, vendorB._id, ROLES.VENDOR);

    const conversation = await conversationService.start(actor(customer), {
      kind: "customer_vendor",
      vendorId: String(vendorA._id),
      body: "Is this in stock?",
    });

    await expect(assertCanAccess(String(conversation._id), actor(staffB))).rejects.toThrow();
  });

  /**
   * A membership is revoked by flipping status, not by deleting the row. If the
   * guard only checked for existence, a suspended employee would keep reading
   * the vendor's mail.
   */
  it("refuses staff whose membership is no longer active", async () => {
    const customer = await makeUser();
    const vendor = await makeVendor();
    const staff = await makeUser([ROLES.CUSTOMER, ROLES.VENDOR]);
    await makeMembership(staff._id, vendor._id, ROLES.VENDOR, { status: "suspended" });

    const conversation = await conversationService.start(actor(customer), {
      kind: "customer_vendor",
      vendorId: String(vendor._id),
      body: "Is this in stock?",
    });

    await expect(assertCanAccess(String(conversation._id), actor(staff))).rejects.toThrow();
  });

  it("grants a super admin any thread", async () => {
    const customer = await makeUser();
    const vendor = await makeVendor();
    const admin = await makeUser([ROLES.SUPER_ADMIN]);

    const conversation = await conversationService.start(actor(customer), {
      kind: "customer_vendor",
      vendorId: String(vendor._id),
      body: "Is this in stock?",
    });

    await expect(assertCanAccess(String(conversation._id), actor(admin))).resolves.toBeTruthy();
  });

  it("reports a missing thread as not found rather than throwing something opaque", async () => {
    const customer = await makeUser();
    await expect(
      assertCanAccess("6a5e5a8c808217f1e9088d1f", actor(customer)),
    ).rejects.toThrow(/not found/i);
  });

  it("rejects a malformed id without hitting the database", async () => {
    const customer = await makeUser();
    await expect(assertCanAccess("not-an-object-id", actor(customer))).rejects.toThrow();
  });
});

describe("sending", () => {
  it("refuses a message from someone with no access", async () => {
    const customer = await makeUser();
    const stranger = await makeUser();
    const vendor = await makeVendor();

    const conversation = await conversationService.start(actor(customer), {
      kind: "customer_vendor",
      vendorId: String(vendor._id),
      body: "Hello",
    });

    await expect(
      conversationService.send(actor(stranger), String(conversation._id), "let me in"),
    ).rejects.toThrow();

    expect(await Message.countDocuments({ conversation: conversation._id })).toBe(1);
  });

  it("rejects empty and oversized bodies", async () => {
    const customer = await makeUser();
    const vendor = await makeVendor();
    const conversation = await conversationService.start(actor(customer), {
      kind: "customer_vendor",
      vendorId: String(vendor._id),
      body: "Hello",
    });

    await expect(
      conversationService.send(actor(customer), String(conversation._id), "   "),
    ).rejects.toThrow();

    await expect(
      conversationService.send(actor(customer), String(conversation._id), "x".repeat(5001)),
    ).rejects.toThrow();
  });

  /**
   * Attachments.
   *
   * A photo with no caption is a normal message, so an empty body is only empty
   * when nothing is attached either. The stored URLs are also filtered: they end
   * up as media sources in the *other* participant's browser, so anything not
   * from our own chat folder is dropped rather than served.
   */
  describe("attachments", () => {
    const ours = (name: string) =>
      `https://res.cloudinary.com/test-cloud/image/upload/v1712345678/chat/sender/${name}`;

    async function thread() {
      const customer = await makeUser();
      const vendor = await makeVendor();
      const conversation = await conversationService.start(actor(customer), {
        kind: "customer_vendor",
        vendorId: String(vendor._id),
        body: "Hello",
      });
      return { customer, conversation };
    }

    it("accepts a message that is an attachment with no text", async () => {
      const { customer, conversation } = await thread();

      const message = await conversationService.send(
        actor(customer),
        String(conversation._id),
        "",
        [{ url: ours("photo.png"), name: "photo.png", mime: "image/png" }],
      );

      expect(message.body).toBe("");
      expect(message.attachments).toHaveLength(1);
      expect(message.attachments[0]!.url).toBe(ours("photo.png"));
    });

    /** The inbox has to show something for a message with no words in it. */
    it("gives an attachment-only message a preview", async () => {
      const { customer, conversation } = await thread();

      await conversationService.send(actor(customer), String(conversation._id), "", [
        { url: ours("photo.png"), name: "photo.png", mime: "image/png" },
      ]);

      const updated = await Conversation.findById(conversation._id);
      expect(updated!.lastMessagePreview).toContain("attachment");
    });

    it("drops attachment URLs that are not ours", async () => {
      const { customer, conversation } = await thread();

      const message = await conversationService.send(
        actor(customer),
        String(conversation._id),
        "look at this",
        [
          { url: "https://evil.example.com/payload.png", name: "payload.png" },
          { url: ours("keep.png"), name: "keep.png" },
        ],
      );

      expect(message.attachments).toHaveLength(1);
      expect(message.attachments[0]!.url).toBe(ours("keep.png"));
    });

    /** Nothing to say and nothing that survived filtering is still empty. */
    it("rejects a message whose only attachment was rejected", async () => {
      const { customer, conversation } = await thread();

      await expect(
        conversationService.send(actor(customer), String(conversation._id), "", [
          { url: "https://evil.example.com/payload.png", name: "payload.png" },
        ]),
      ).rejects.toThrow();
    });
  });

  /** The inbox list renders from these denormalized fields, not from Message. */
  it("keeps the conversation preview in step with the newest message", async () => {
    const customer = await makeUser();
    const vendor = await makeVendor();
    const conversation = await conversationService.start(actor(customer), {
      kind: "customer_vendor",
      vendorId: String(vendor._id),
      body: "First",
    });

    await conversationService.send(actor(customer), String(conversation._id), "Second");

    const fresh = await Conversation.findById(conversation._id);
    expect(fresh!.lastMessagePreview).toBe("Second");
    expect(fresh!.messageCount).toBe(2);
    expect(String(fresh!.lastMessageBy)).toBe(String(customer._id));
  });

  /**
   * A staff member replying from the shared inbox has to become a participant,
   * or they are never counted for read receipts and unread counts.
   */
  it("adds a replying staff member to the participants", async () => {
    const customer = await makeUser();
    const vendor = await makeVendor();
    const staff = await makeUser([ROLES.CUSTOMER, ROLES.VENDOR]);
    await makeMembership(staff._id, vendor._id, ROLES.VENDOR);

    const conversation = await conversationService.start(actor(customer), {
      kind: "customer_vendor",
      vendorId: String(vendor._id),
      body: "Question",
    });

    await conversationService.send(actor(staff), String(conversation._id), "Answer");

    const fresh = await Conversation.findById(conversation._id);
    const ids = fresh!.participants.map((p) => String(p.user));
    expect(ids).toContain(String(staff._id));
    // And exactly once, however many times they reply.
    await conversationService.send(actor(staff), String(conversation._id), "Also this");
    const again = await Conversation.findById(conversation._id);
    expect(again!.participants.filter((p) => String(p.user) === String(staff._id))).toHaveLength(1);
  });
});
