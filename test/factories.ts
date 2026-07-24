import { Types } from "mongoose";
import { User, type UserDoc } from "@/server/database/models/user.model";
import { Vendor, type VendorDoc } from "@/server/database/models/vendor.model";
import { Membership, type MembershipDoc } from "@/server/database/models/membership.model";
import { Product, type ProductDoc } from "@/server/database/models/product.model";
import { Cart, type CartDoc } from "@/server/database/models/cart.model";
import { Coupon, type CouponDoc } from "@/server/database/models/coupon.model";
import { ROLES, type Role, type Permission } from "@/shared/constants/rbac";
import type { Actor } from "@/server/services/conversation.service";

/**
 * Minimal builders for test fixtures.
 *
 * Each takes only the fields a test might reasonably vary and fills the rest
 * with defaults, so a test's body shows exactly what matters to it. There is
 * deliberately no open `overrides` bag: passing `Record<string, unknown>` into
 * `Model.create` collapses Mongoose's overloads and every call silently infers
 * `never`, which costs more in confusion than the flexibility is worth.
 */

let counter = 0;
const unique = () => `${Date.now()}-${counter++}`;

export async function makeUser(
  roles: Role[] = [ROLES.CUSTOMER],
  opts: { status?: "active" | "pending" | "suspended"; name?: string } = {},
): Promise<UserDoc> {
  const n = unique();
  return User.create({
    email: `user-${n}@test.local`,
    name: opts.name ?? `User ${n}`,
    passwordHash: "not-a-real-hash",
    roles,
    status: opts.status ?? "active",
    emailVerifiedAt: new Date(),
  });
}

export async function makeVendor(
  opts: { status?: "active" | "pending" | "suspended"; name?: string } = {},
): Promise<VendorDoc> {
  const n = unique();
  const owner = await makeUser([ROLES.CUSTOMER, ROLES.VENDOR]);
  return Vendor.create({
    name: opts.name ?? `Vendor ${n}`,
    slug: `vendor-${n}`,
    owner: owner._id,
    status: opts.status ?? "active",
  });
}

/**
 * Bind a user to a vendor so vendor-scoped permission checks pass.
 *
 * The role is narrowed to the four the Membership schema accepts — `customer`
 * and `super_admin` are global roles with no meaning inside a vendor, so the
 * schema rejects them and the type should too.
 */
export type MembershipRole =
  | typeof ROLES.VENDOR
  | typeof ROLES.MARKETING
  | typeof ROLES.SUPPORT
  | typeof ROLES.DELIVERY_DRIVER;

export async function makeMembership(
  userId: Types.ObjectId | string,
  vendorId: Types.ObjectId | string,
  role: MembershipRole = ROLES.VENDOR,
  opts: { permissions?: Permission[]; status?: "active" | "invited" | "suspended" } = {},
): Promise<MembershipDoc> {
  return Membership.create({
    user: userId,
    vendor: vendorId,
    role,
    permissions: opts.permissions ?? [],
    status: opts.status ?? "active",
  });
}

export async function makeProduct(
  vendorId: Types.ObjectId | string,
  opts: {
    price?: number;
    stock?: number;
    title?: string;
    trackInventory?: boolean;
    allowBackorder?: boolean;
    status?: "draft" | "active" | "archived";
    /** A variable product prices through its Variants, not this row. */
    type?: "simple" | "variable";
  } = {},
): Promise<ProductDoc> {
  const n = unique();
  return Product.create({
    vendor: vendorId,
    type: opts.type ?? "simple",
    title: opts.title ?? `Product ${n}`,
    slug: `product-${n}`,
    price: opts.price ?? 25,
    stock: opts.stock ?? 10,
    trackInventory: opts.trackInventory ?? true,
    allowBackorder: opts.allowBackorder ?? false,
    status: opts.status ?? "active",
  });
}

/** A one-line cart, which is all the checkout tests need. */
export async function makeCart(
  vendorId: Types.ObjectId | string,
  userId: Types.ObjectId | string,
  product: ProductDoc,
  quantity = 1,
): Promise<CartDoc> {
  return Cart.create({
    vendor: vendorId,
    user: userId,
    items: [
      {
        product: product._id,
        title: product.title,
        unitPrice: product.price,
        quantity,
      },
    ],
  });
}

/**
 * A coupon, defaulting to an unconstrained 10% off.
 *
 * Every constraint is opt-in so a test that cares about, say, expiry says only
 * that — the rest stays out of the way.
 */
export async function makeCoupon(
  vendorId: Types.ObjectId | string,
  opts: {
    code?: string;
    type?: "percentage" | "fixed" | "free_shipping";
    value?: number;
    minSpend?: number;
    maxDiscount?: number | null;
    usageLimit?: number | null;
    perUserLimit?: number | null;
    usedCount?: number;
    appliesToProducts?: (Types.ObjectId | string)[];
    appliesToCategories?: (Types.ObjectId | string)[];
    startsAt?: Date | null;
    expiresAt?: Date | null;
    isActive?: boolean;
  } = {},
): Promise<CouponDoc> {
  return Coupon.create({
    vendor: vendorId,
    code: opts.code ?? `SAVE-${unique()}`,
    type: opts.type ?? "percentage",
    value: opts.value ?? 10,
    minSpend: opts.minSpend ?? 0,
    maxDiscount: opts.maxDiscount ?? null,
    usageLimit: opts.usageLimit ?? null,
    perUserLimit: opts.perUserLimit ?? null,
    usedCount: opts.usedCount ?? 0,
    appliesToProducts: opts.appliesToProducts ?? [],
    appliesToCategories: opts.appliesToCategories ?? [],
    startsAt: opts.startsAt ?? null,
    expiresAt: opts.expiresAt ?? null,
    isActive: opts.isActive ?? true,
  });
}

/** A plausible shipping address — no test asserts on it. */
export const testAddress = {
  recipient: "Test Recipient",
  phone: "+10000000000",
  line1: "1 Test Street",
  city: "Testville",
  country: "US",
};

/** The shape services take as the acting user. */
export function actor(user: UserDoc): Actor {
  return { id: String(user._id), roles: user.roles as Role[] };
}
