import { describe, it, expect } from "vitest";
import { vendorStaffService } from "@/server/services/vendor-staff.service";
import { User } from "@/server/database/models/user.model";
import { Membership } from "@/server/database/models/membership.model";
import { verifyPassword } from "@/server/security/password";
import { ROLES } from "@/shared/constants/rbac";
import { makeUser, makeVendor, makeMembership } from "./factories";

/**
 * Super admin staffing a vendor.
 *
 * The interesting cases are all about *not* over-granting: a vendor-scoped role
 * must not become a platform-wide one, and re-adding somebody must not quietly
 * duplicate or escalate. Authorization itself lives in the action
 * (`requireSuperAdmin`) — these test the service it calls.
 */

const PASSWORD = "Str0ngPassword";

async function admin() {
  return makeUser([ROLES.CUSTOMER, ROLES.SUPER_ADMIN]);
}

describe("creating a new user on a vendor", () => {
  it("creates the account and the membership together", async () => {
    const [actor, vendor] = await Promise.all([admin(), makeVendor()]);

    const result = await vendorStaffService.createOrAttach(
      {
        vendorId: String(vendor._id),
        email: "new.staff@test.local",
        name: "New Staff",
        role: ROLES.SUPPORT,
        password: PASSWORD,
      },
      String(actor._id),
    );

    expect(result.created).toBe(true);
    expect(result.user.email).toBe("new.staff@test.local");
    expect(result.membership.role).toBe(ROLES.SUPPORT);
    expect(result.membership.status).toBe("active");
    expect(String(result.membership.vendor)).toBe(String(vendor._id));
  });

  it("stores the password hashed, and it actually works", async () => {
    const [actor, vendor] = await Promise.all([admin(), makeVendor()]);

    const { user } = await vendorStaffService.createOrAttach(
      {
        vendorId: String(vendor._id),
        email: "hashed@test.local",
        name: "Hashed",
        role: ROLES.MARKETING,
        password: PASSWORD,
      },
      String(actor._id),
    );

    const stored = await User.findById(user._id).select("+passwordHash");
    const hash = stored!.passwordHash!;
    expect(hash).not.toBe(PASSWORD);
    await expect(verifyPassword(PASSWORD, hash)).resolves.toBe(true);
  });

  it("refuses to create a user with no password", async () => {
    const [actor, vendor] = await Promise.all([admin(), makeVendor()]);

    await expect(
      vendorStaffService.createOrAttach(
        {
          vendorId: String(vendor._id),
          email: "nopassword@test.local",
          name: "No Password",
          role: ROLES.SUPPORT,
        },
        String(actor._id),
      ),
    ).rejects.toThrow(/password/i);

    expect(await User.findOne({ email: "nopassword@test.local" })).toBeNull();
  });

  it("refuses an unknown vendor", async () => {
    const actor = await admin();
    await expect(
      vendorStaffService.createOrAttach(
        {
          vendorId: "6a5f00000000000000000009",
          email: "orphan@test.local",
          name: "Orphan",
          role: ROLES.SUPPORT,
          password: PASSWORD,
        },
        String(actor._id),
      ),
    ).rejects.toThrow(/vendor not found/i);

    // Nothing half-created: the vendor is checked before the user is inserted.
    expect(await User.findOne({ email: "orphan@test.local" })).toBeNull();
  });
});

describe("attaching an existing user", () => {
  it("reuses the account instead of failing on the duplicate email", async () => {
    const [actor, vendor, existing] = await Promise.all([admin(), makeVendor(), makeUser()]);

    const result = await vendorStaffService.createOrAttach(
      {
        vendorId: String(vendor._id),
        email: existing.email,
        name: "Ignored For Existing",
        role: ROLES.DELIVERY_DRIVER,
        password: PASSWORD,
      },
      String(actor._id),
    );

    expect(result.created).toBe(false);
    expect(String(result.user._id)).toBe(String(existing._id));
  });

  /** An admin adding staff must not be able to reset an existing password. */
  it("does not change an existing user's password", async () => {
    const [actor, vendor, existing] = await Promise.all([admin(), makeVendor(), makeUser()]);
    const before = (await User.findById(existing._id).select("+passwordHash"))!.passwordHash;

    await vendorStaffService.createOrAttach(
      {
        vendorId: String(vendor._id),
        email: existing.email,
        name: "Whatever",
        role: ROLES.SUPPORT,
        password: "Different1Password",
      },
      String(actor._id),
    );

    const after = (await User.findById(existing._id).select("+passwordHash"))!.passwordHash;
    expect(after).toBe(before);
  });

  it("changes the role of somebody already on the vendor", async () => {
    const [actor, vendor, staff] = await Promise.all([admin(), makeVendor(), makeUser()]);
    await makeMembership(staff._id, vendor._id, ROLES.SUPPORT);

    const result = await vendorStaffService.createOrAttach(
      {
        vendorId: String(vendor._id),
        email: staff.email,
        name: staff.name,
        role: ROLES.MARKETING,
        password: PASSWORD,
      },
      String(actor._id),
    );

    expect(result.membership.role).toBe(ROLES.MARKETING);
    // Updated, not duplicated — {user, vendor} is unique.
    expect(await Membership.countDocuments({ user: staff._id, vendor: vendor._id })).toBe(1);
  });

  it("re-activates a suspended member rather than failing on the unique index", async () => {
    const [actor, vendor, staff] = await Promise.all([admin(), makeVendor(), makeUser()]);
    await makeMembership(staff._id, vendor._id, ROLES.SUPPORT, { status: "suspended" });

    const result = await vendorStaffService.createOrAttach(
      {
        vendorId: String(vendor._id),
        email: staff.email,
        name: staff.name,
        role: ROLES.SUPPORT,
        password: PASSWORD,
      },
      String(actor._id),
    );

    expect(result.membership.status).toBe("active");
  });

  it("refuses a no-op that would silently do nothing", async () => {
    const [actor, vendor, staff] = await Promise.all([admin(), makeVendor(), makeUser()]);
    await makeMembership(staff._id, vendor._id, ROLES.SUPPORT);

    await expect(
      vendorStaffService.createOrAttach(
        {
          vendorId: String(vendor._id),
          email: staff.email,
          name: staff.name,
          role: ROLES.SUPPORT,
          password: PASSWORD,
        },
        String(actor._id),
      ),
    ).rejects.toThrow(/already has the support role/i);
  });
});

/**
 * The escalation cases. A vendor-scoped grant must stay vendor-scoped: the
 * membership is what `requireVendorPermission` reads, and it names one vendor.
 */
describe("scope of the grant", () => {
  it("does not grant the role on any other vendor", async () => {
    const [actor, mine, theirs] = await Promise.all([admin(), makeVendor(), makeVendor()]);

    const { user } = await vendorStaffService.createOrAttach(
      {
        vendorId: String(mine._id),
        email: "scoped@test.local",
        name: "Scoped",
        role: ROLES.VENDOR,
        password: PASSWORD,
      },
      String(actor._id),
    );

    expect(await Membership.findOne({ user: user._id, vendor: theirs._id })).toBeNull();
  });

  it("never grants super_admin, whatever is asked for", async () => {
    const [actor, vendor] = await Promise.all([admin(), makeVendor()]);

    await expect(
      vendorStaffService.createOrAttach(
        {
          vendorId: String(vendor._id),
          email: "escalate@test.local",
          name: "Escalate",
          // The schema's enum excludes it; this is the runtime backstop.
          role: ROLES.SUPER_ADMIN as never,
          password: PASSWORD,
        },
        String(actor._id),
      ),
    ).rejects.toThrow();

    const user = await User.findOne({ email: "escalate@test.local" });
    expect(user?.roles ?? []).not.toContain(ROLES.SUPER_ADMIN);
  });
});

describe("suspending staff", () => {
  it("suspends without deleting the membership", async () => {
    const [actor, vendor, staff] = await Promise.all([admin(), makeVendor(), makeUser()]);
    await makeMembership(staff._id, vendor._id, ROLES.SUPPORT);

    const membership = await vendorStaffService.suspend(
      String(vendor._id),
      String(staff._id),
      String(actor._id),
    );

    expect(membership.status).toBe("suspended");
    expect(await Membership.countDocuments({ user: staff._id, vendor: vendor._id })).toBe(1);
  });

  /** Locking an owner out of the store they own is never what was meant. */
  it("refuses to suspend the vendor's owner", async () => {
    const [actor, vendor] = await Promise.all([admin(), makeVendor()]);

    await expect(
      vendorStaffService.suspend(String(vendor._id), String(vendor.owner), String(actor._id)),
    ).rejects.toThrow(/reassign the vendor's owner/i);
  });

  it("refuses somebody who is not a member", async () => {
    const [actor, vendor, stranger] = await Promise.all([admin(), makeVendor(), makeUser()]);

    await expect(
      vendorStaffService.suspend(String(vendor._id), String(stranger._id), String(actor._id)),
    ).rejects.toThrow(/not a member/i);
  });
});

describe("listing staff", () => {
  it("returns only that vendor's members", async () => {
    const [mine, theirs, a, b] = await Promise.all([
      makeVendor(),
      makeVendor(),
      makeUser(),
      makeUser(),
    ]);
    await makeMembership(a._id, mine._id, ROLES.SUPPORT);
    await makeMembership(b._id, theirs._id, ROLES.SUPPORT);

    const staff = await vendorStaffService.list(String(mine._id));
    const ids = staff.map((m) => String(m.user._id ?? m.user));

    expect(ids).toContain(String(a._id));
    expect(ids).not.toContain(String(b._id));
  });
});
