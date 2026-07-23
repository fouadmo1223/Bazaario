import { describe, it, expect, beforeAll } from "vitest";
import { wishlistService } from "@/server/services/wishlist.service";
import { Wishlist } from "@/server/database/models/wishlist.model";
import { makeUser, makeVendor, makeProduct } from "./factories";

/**
 * One wishlist per owner, and the null side of that uniqueness.
 *
 * The trap is the unique index on `{user}` / `{guestToken}`: the schema defaults
 * both to `null`, so *every* user-owned list carries `guestToken: null` and every
 * guest list carries `user: null`. A `sparse` unique index does not save you —
 * sparse omits only *absent* fields, and these are present-and-null — so the
 * second user to save anything collides with the first on `guestToken: null`.
 * A partial index keyed on the field actually holding a value is what keeps the
 * null sides out. These tests build the real indexes and exercise both sides.
 */

beforeAll(async () => {
  // Reconcile the collection's indexes with the schema so the uniqueness is
  // actually enforced here. `syncIndexes` (not `init`) because a test datastore
  // may still hold an earlier definition of these indexes under the same name —
  // `init` would collide with it; `syncIndexes` drops the stale one and rebuilds.
  await Wishlist.syncIndexes();
});

describe("saving items", () => {
  it("lets two different users each save the same product", async () => {
    const vendor = await makeVendor();
    const [product, a, b] = await Promise.all([
      makeProduct(vendor._id),
      makeUser(),
      makeUser(),
    ]);

    // The regression: both lists are user-owned, so both hold guestToken: null.
    // A sparse unique index rejects the second with an E11000 duplicate key.
    await wishlistService.add({ userId: String(a._id) }, String(product._id));
    await wishlistService.add({ userId: String(b._id) }, String(product._id));

    await expect(
      wishlistService.has({ userId: String(a._id) }, String(product._id)),
    ).resolves.toBe(true);
    await expect(
      wishlistService.has({ userId: String(b._id) }, String(product._id)),
    ).resolves.toBe(true);
  });

  it("lets a guest and a user hold separate lists at once", async () => {
    const vendor = await makeVendor();
    const [product, user] = await Promise.all([makeProduct(vendor._id), makeUser()]);

    await wishlistService.add({ guestToken: "guest-token-1" }, String(product._id));
    await wishlistService.add({ userId: String(user._id) }, String(product._id));

    expect(await Wishlist.countDocuments({})).toBe(2);
  });

  it("is a no-op to add the same product twice", async () => {
    const vendor = await makeVendor();
    const [product, user] = await Promise.all([makeProduct(vendor._id), makeUser()]);
    const owner = { userId: String(user._id) };

    await wishlistService.add(owner, String(product._id));
    const list = await wishlistService.add(owner, String(product._id));

    expect(list.items).toHaveLength(1);
  });

  it("refuses a product that is not active", async () => {
    const vendor = await makeVendor();
    const [product, user] = await Promise.all([
      makeProduct(vendor._id, { status: "draft" }),
      makeUser(),
    ]);

    await expect(
      wishlistService.add({ userId: String(user._id) }, String(product._id)),
    ).rejects.toThrow(/not available/i);
  });
});

describe("toggling", () => {
  it("saves on the first click and removes on the second", async () => {
    const vendor = await makeVendor();
    const [product, user] = await Promise.all([makeProduct(vendor._id), makeUser()]);
    const owner = { userId: String(user._id) };
    const id = String(product._id);

    const first = await wishlistService.toggle(owner, id);
    expect(first.saved).toBe(true);
    expect(first.list.items).toHaveLength(1);

    const second = await wishlistService.toggle(owner, id);
    expect(second.saved).toBe(false);
    expect(second.list.items).toHaveLength(0);
  });
});

describe("merging a guest list into a user on login", () => {
  it("unions both lists and drops the guest one", async () => {
    const vendor = await makeVendor();
    const [shared, guestOnly, userOnly, user] = await Promise.all([
      makeProduct(vendor._id),
      makeProduct(vendor._id),
      makeProduct(vendor._id),
      makeUser(),
    ]);
    const token = "guest-token-merge";

    await wishlistService.add({ guestToken: token }, String(shared._id));
    await wishlistService.add({ guestToken: token }, String(guestOnly._id));
    await wishlistService.add({ userId: String(user._id) }, String(shared._id));
    await wishlistService.add({ userId: String(user._id) }, String(userOnly._id));

    const merged = await wishlistService.mergeGuestIntoUser(token, String(user._id));

    // Union without duplicating the product both lists held.
    expect(merged.items).toHaveLength(3);
    expect(await Wishlist.findOne({ guestToken: token })).toBeNull();
  });
});
