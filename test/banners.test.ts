import { describe, it, expect } from "vitest";
import { bannerService } from "@/server/services/banner.service";
import { makeVendor } from "./factories";

/**
 * The storefront only ever shows the single result of `getActive` — this file
 * pins the window/active logic that decides what that is, plus that authoring
 * stays vendor-scoped the same way every other dashboard content type does.
 */

describe("banner authoring", () => {
  it("creates, lists, updates, and deletes a vendor's banners", async () => {
    const vendor = await makeVendor();
    const vendorId = String(vendor._id);
    const actorId = String(vendor.owner);

    const created = await bannerService.create(
      vendorId,
      { message: "Free shipping this week", isActive: true },
      actorId,
    );
    expect(await bannerService.list(vendorId)).toHaveLength(1);

    const updated = await bannerService.update(
      vendorId,
      String(created._id),
      { message: "Free shipping extended", isActive: true },
      actorId,
    );
    expect(updated.message).toBe("Free shipping extended");

    await bannerService.remove(vendorId, String(created._id), actorId);
    expect(await bannerService.list(vendorId)).toHaveLength(0);
  });

  it("refuses to update or delete another vendor's banner", async () => {
    const vendor = await makeVendor();
    const other = await makeVendor();
    const banner = await bannerService.create(
      String(vendor._id),
      { message: "Mine", isActive: true },
      String(vendor.owner),
    );

    await expect(
      bannerService.update(String(other._id), String(banner._id), { message: "Stolen", isActive: true }, String(other.owner)),
    ).rejects.toThrow();
    await expect(
      bannerService.remove(String(other._id), String(banner._id), String(other.owner)),
    ).rejects.toThrow();
  });
});

describe("getActive", () => {
  it("returns null when there is nothing active", async () => {
    const vendor = await makeVendor();
    expect(await bannerService.getActive(String(vendor._id))).toBeNull();
  });

  it("ignores a banner marked inactive", async () => {
    const vendor = await makeVendor();
    await bannerService.create(String(vendor._id), { message: "Off", isActive: false }, String(vendor.owner));
    expect(await bannerService.getActive(String(vendor._id))).toBeNull();
  });

  it("ignores a banner outside its window, in either direction", async () => {
    const vendor = await makeVendor();
    const vendorId = String(vendor._id);
    const actorId = String(vendor.owner);
    const hour = 3600_000;

    await bannerService.create(
      vendorId,
      { message: "Not yet", isActive: true, startsAt: new Date(Date.now() + hour) },
      actorId,
    );
    await bannerService.create(
      vendorId,
      { message: "Expired", isActive: true, endsAt: new Date(Date.now() - hour) },
      actorId,
    );

    expect(await bannerService.getActive(vendorId)).toBeNull();
  });

  it("picks the most recently created active banner when several qualify", async () => {
    const vendor = await makeVendor();
    const vendorId = String(vendor._id);
    const actorId = String(vendor.owner);

    await bannerService.create(vendorId, { message: "Older", isActive: true }, actorId);
    const newer = await bannerService.create(vendorId, { message: "Newer", isActive: true }, actorId);

    const active = await bannerService.getActive(vendorId);
    expect(String(active!._id)).toBe(String(newer._id));
  });
});
