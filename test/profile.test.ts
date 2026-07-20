import { describe, it, expect } from "vitest";
import { profileService } from "@/server/services/profile.service";
import { Address } from "@/server/database/models/address.model";
import { User } from "@/server/database/models/user.model";
import { ROLES } from "@/shared/constants/rbac";
import { makeUser } from "./factories";

/**
 * Profile and address book.
 *
 * The service takes the acting user's id and scopes every query to it. These
 * tests exist mostly to pin that scoping: an address book is a list of home
 * addresses and phone numbers, so a missing `user:` clause is a privacy
 * incident rather than a glitch.
 */

const address = {
  recipient: "Casey Customer",
  phone: "+201112223334",
  line1: "15 Nile Corniche",
  city: "Cairo",
  country: "EG",
};

describe("profile updates", () => {
  it("updates the fields a user owns", async () => {
    const user = await makeUser();

    await profileService.update(String(user._id), {
      name: "New Name",
      phone: "+123456",
      avatar: "https://example.com/a.png",
    });

    const fresh = await User.findById(user._id);
    expect(fresh!.name).toBe("New Name");
    expect(fresh!.phone).toBe("+123456");
    expect(fresh!.avatar).toBe("https://example.com/a.png");
  });

  /**
   * The profile form must not be a privilege-escalation path. `update` accepts
   * a fixed shape rather than spreading its input, so extra keys are ignored
   * even if a caller sends them to the action by direct POST.
   */
  it("ignores attempts to change email, roles, or status", async () => {
    const user = await makeUser([ROLES.CUSTOMER]);
    const originalEmail = user.email;

    await profileService.update(String(user._id), {
      name: "Still Me",
      // Extra keys a hand-rolled POST could include.
      ...({ email: "attacker@evil.test", roles: [ROLES.SUPER_ADMIN], status: "active" } as object),
    } as Parameters<typeof profileService.update>[1]);

    const fresh = await User.findById(user._id);
    expect(fresh!.email).toBe(originalEmail);
    expect(fresh!.roles).toEqual([ROLES.CUSTOMER]);
  });
});

describe("address book", () => {
  it("makes the first address the default automatically", async () => {
    const user = await makeUser();

    const created = await profileService.addAddress(String(user._id), address);

    // Otherwise the user's first checkout has nothing preselected.
    expect(created.isDefault).toBe(true);
  });

  it("keeps exactly one default when another is added as default", async () => {
    const user = await makeUser();
    await profileService.addAddress(String(user._id), address);
    await profileService.addAddress(String(user._id), {
      ...address,
      line1: "9 Tahrir Square",
      isDefault: true,
    });

    const defaults = await Address.find({ user: user._id, isDefault: true });
    expect(defaults).toHaveLength(1);
    expect(defaults[0].line1).toBe("9 Tahrir Square");
  });

  it("keeps exactly one default when switching", async () => {
    const user = await makeUser();
    const first = await profileService.addAddress(String(user._id), address);
    const second = await profileService.addAddress(String(user._id), {
      ...address,
      line1: "9 Tahrir Square",
    });

    await profileService.setDefaultAddress(String(user._id), String(second._id));

    const defaults = await Address.find({ user: user._id, isDefault: true });
    expect(defaults).toHaveLength(1);
    expect(String(defaults[0]._id)).toBe(String(second._id));
    expect((await Address.findById(first._id))!.isDefault).toBe(false);
  });

  /** Deleting the default must promote another, or checkout preselects nothing. */
  it("promotes another address when the default is deleted", async () => {
    const user = await makeUser();
    const first = await profileService.addAddress(String(user._id), address);
    await profileService.addAddress(String(user._id), { ...address, line1: "9 Tahrir Square" });

    await profileService.deleteAddress(String(user._id), String(first._id));

    const remaining = await Address.find({ user: user._id });
    expect(remaining).toHaveLength(1);
    expect(remaining[0].isDefault).toBe(true);
  });

  it("lists only the requesting user's addresses", async () => {
    const user = await makeUser();
    const other = await makeUser();
    await profileService.addAddress(String(user._id), address);
    await profileService.addAddress(String(other._id), { ...address, line1: "Someone else's home" });

    const mine = await profileService.listAddresses(String(user._id));
    expect(mine).toHaveLength(1);
    expect(mine[0].line1).toBe(address.line1);
  });

  it("refuses to edit, delete, or promote another user's address", async () => {
    const owner = await makeUser();
    const attacker = await makeUser();
    const owned = await profileService.addAddress(String(owner._id), address);
    const id = String(owned._id);

    await expect(
      profileService.updateAddress(String(attacker._id), id, { ...address, city: "Hijacked" }),
    ).rejects.toThrow();
    await expect(profileService.deleteAddress(String(attacker._id), id)).rejects.toThrow();
    await expect(profileService.setDefaultAddress(String(attacker._id), id)).rejects.toThrow();

    const untouched = await Address.findById(id);
    expect(untouched).not.toBeNull();
    expect(untouched!.city).toBe(address.city);
  });
});
