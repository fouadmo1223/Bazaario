import { connectToDatabase } from "@/server/database/connection";
import { Cart } from "@/server/database/models/cart.model";
import { Order, type OrderDoc } from "@/server/database/models/order.model";
import { Product } from "@/server/database/models/product.model";
import { Variant } from "@/server/database/models/variant.model";
import { Coupon } from "@/server/database/models/coupon.model";
import { Vendor } from "@/server/database/models/vendor.model";
import { getRedis } from "@/server/cache/redis";
import { Errors } from "@/shared/lib/errors";
import { validateCoupon, computeTotals, subtotalOf, vendorTaxRate, type CartLine } from "./pricing.service";
import { writeAudit } from "./audit.service";
import { logger } from "@/shared/lib/logger";
import { toMinor, toMajor, timesQuantity } from "@/shared/lib/money";
import type { Types } from "mongoose";

type OrderItemInput = {
  product: Types.ObjectId;
  variant: Types.ObjectId | null;
  title: string;
  image: string | null;
  sku: string | null;
  unitPrice: number;
  quantity: number;
  total: number;
};

export type CheckoutInput = {
  paymentProvider: "stripe" | "paymob" | "cod" | "wallet";
  shippingMethod?: string;
  shippingBase?: number;
  address: {
    recipient: string; phone: string; line1: string; line2?: string;
    city: string; region?: string; postalCode?: string; country: string;
    geo?: { lat: number; lng: number };
  };
  guestEmail?: string;
};

type CheckoutOwner = { userId?: string; guestToken?: string };

/** Generate a per-vendor sequential order number using an atomic Redis counter. */
async function nextOrderNumber(vendorId: string): Promise<string> {
  const seq = await getRedis().incr(`vendor:${vendorId}:order_seq`);
  return `${1000 + seq}`;
}

/** One line's claim on stock, resolved before anything is written. */
type Reservation = {
  title: string;
  product: Types.ObjectId;
  variant: Types.ObjectId | null;
  quantity: number;
  /**
   * Whether the decrement must be refused when stock is short. False when the
   * product doesn't track inventory or allows backorders — those are *meant* to
   * go negative/unbounded, so guarding them would break the feature.
   */
  guarded: boolean;
};

/**
 * Take `quantity` off a line's stock, atomically.
 *
 * The `stock: { $gte: quantity }` filter is what makes this safe: the read and
 * the write are one operation, so two concurrent checkouts for the last unit
 * cannot both succeed — whichever loses matches no document and is told so.
 * Returns false when the claim was refused.
 */
async function decrementStock(r: Reservation): Promise<boolean> {
  if (r.variant) {
    const filter = r.guarded
      ? { _id: r.variant, stock: { $gte: r.quantity } }
      : { _id: r.variant };
    const res = await Variant.updateOne(filter, { $inc: { stock: -r.quantity } });
    return res.matchedCount > 0;
  }

  const filter = r.guarded
    ? { _id: r.product, stock: { $gte: r.quantity } }
    : { _id: r.product };
  const res = await Product.updateOne(filter, {
    $inc: { stock: -r.quantity, soldCount: r.quantity },
  });
  return res.matchedCount > 0;
}

/** Undo a reservation. Unconditional — putting stock back must never be refused. */
async function restoreStock(r: Reservation): Promise<void> {
  if (r.variant) {
    await Variant.updateOne({ _id: r.variant }, { $inc: { stock: r.quantity } });
  } else {
    await Product.updateOne(
      { _id: r.product },
      { $inc: { stock: r.quantity, soldCount: -r.quantity } },
    );
  }
}

/**
 * Reserve stock for every line, all-or-nothing.
 *
 * Each decrement is atomic, but a multi-line order is still several writes, so a
 * refusal partway through would leave earlier lines reserved against an order
 * that never exists. Anything already taken is put back before throwing.
 *
 * A transaction would be the textbook answer and would also cover the Order
 * insert; it needs a replica set (Atlas has one, a standalone dev mongod may
 * not), so this keeps the guarantee without that dependency.
 */
async function reserveInventory(reservations: Reservation[]): Promise<void> {
  const applied: Reservation[] = [];
  try {
    for (const r of reservations) {
      const taken = await decrementStock(r);
      if (!taken) {
        throw Errors.conflict(`"${r.title}" just sold out — please adjust your cart`);
      }
      applied.push(r);
    }
  } catch (err) {
    for (const r of applied.reverse()) {
      // Best effort: one failed rollback must not mask the original error.
      await restoreStock(r).catch((e) =>
        logger.error({ err: e, product: String(r.product) }, "Failed to release reserved stock"),
      );
    }
    throw err;
  }
}

/**
 * Checkout orchestration: re-price the cart from source of truth, validate
 * stock, reserve inventory, create the order, and clear the cart. Payment
 * capture happens separately (COD is captured on delivery; Stripe/Paymob via
 * webhook). Returns the created order in `pending` state.
 */
export const checkoutService = {
  async createOrder(vendorId: string, owner: CheckoutOwner, input: CheckoutInput): Promise<OrderDoc> {
    await connectToDatabase();

    const cartFilter = owner.userId
      ? { vendor: vendorId, user: owner.userId }
      : { vendor: vendorId, guestToken: owner.guestToken };
    const cart = await Cart.findOne(cartFilter);
    if (!cart || cart.items.length === 0) throw Errors.badRequest("Your cart is empty");
    if (!owner.userId && !input.guestEmail) throw Errors.badRequest("Email is required for guest checkout");

    const vendor = await Vendor.findById(vendorId);
    if (!vendor || vendor.status !== "active") throw Errors.notFound("Vendor unavailable");

    // Re-price every line from the DB (never trust cart snapshots at money-time).
    const lines: CartLine[] = [];
    const orderItems: OrderItemInput[] = [];
    const reservations: Reservation[] = [];

    for (const item of cart.items) {
      const product = await Product.findOne({ _id: item.product, vendor: vendorId, status: "active" });
      if (!product) throw Errors.conflict(`"${item.title}" is no longer available`);

      let price = product.price;
      let stock = product.stock;
      let sku = product.sku;
      const track = product.trackInventory;
      const backorder = product.allowBackorder;

      if (item.variant) {
        const variant = await Variant.findOne({ _id: item.variant, product: product._id, isActive: true });
        if (!variant) throw Errors.conflict(`A variant of "${item.title}" is unavailable`);
        price = variant.price;
        stock = variant.stock;
        sku = variant.sku;
      }

      // An early, friendlier check — but not the guarantee. Stock can still go
      // between here and the reservation below, which is where it's enforced.
      if (track && !backorder && item.quantity > stock) {
        throw Errors.conflict(`Only ${stock} of "${product.title}" left`);
      }

      lines.push({
        unitPrice: price,
        quantity: item.quantity,
        // Carried so a product/category-scoped coupon can tell which lines it
        // may discount. Free here — the product is already loaded for re-pricing.
        productId: String(product._id),
        categories: (product.categories ?? []).map((c) => String(c)),
      });
      orderItems.push({
        product: product._id,
        variant: item.variant ?? null,
        title: product.title,
        image: item.image ?? null,
        sku: sku ?? null,
        unitPrice: price,
        quantity: item.quantity,
        total: toMajor(timesQuantity(toMinor(price), item.quantity)),
      });
      reservations.push({
        title: product.title,
        product: product._id,
        variant: item.variant ?? null,
        quantity: item.quantity,
        guarded: track && !backorder,
      });
    }

    // Coupon (optional).
    let coupon = null;
    // Exact: this subtotal decides whether the minimum spend is met, and float
    // drift here refuses a coupon on a cart that qualifies.
    const subtotalPreview = toMajor(subtotalOf(lines));
    if (cart.coupon) {
      // Pass the owner and the priced lines so the per-user limit and any
      // product/category scope are enforced here, at the moment of charge.
      coupon = await validateCoupon(vendorId, cart.coupon, subtotalPreview, {
        userId: owner.userId,
        lines,
      });
    }

    const taxRate = vendorTaxRate(vendor.settings);
    const totals = computeTotals(lines, {
      coupon,
      taxRate,
      shippingBase: input.shippingBase ?? 0,
      taxInclusive: vendor.settings.taxInclusive,
    });

    const number = await nextOrderNumber(vendorId);

    // Claim the stock atomically. Throws (having put back anything it took) if
    // another checkout won the last unit in the meantime.
    await reserveInventory(reservations);

    let order: OrderDoc;
    try {
      order = await Order.create({
        vendor: vendorId,
        number,
        customer: owner.userId ?? null,
        guestEmail: input.guestEmail ?? null,
        items: orderItems,
        totals,
        currency: vendor.settings.currency,
        coupon: cart.coupon ?? null,
        status: "pending",
        timeline: [{ status: "pending", note: "Order placed", at: new Date() }],
        payment: {
          provider: input.paymentProvider,
          status: "pending", // captured later: COD on delivery, Stripe/Paymob via webhook
        },
        shipping: {
          address: input.address,
          method: input.shippingMethod ?? "standard",
        },
        billingAddress: input.address,
        createdBy: owner.userId ?? null,
      });
    } catch (err) {
      // Stock is reserved but no order owns it — release it or it's lost stock.
      for (const r of reservations.reverse()) {
        await restoreStock(r).catch((e) =>
          logger.error({ err: e, product: String(r.product) }, "Failed to release stock after order insert failed"),
        );
      }
      throw err;
    }

    if (coupon) await Coupon.updateOne({ _id: coupon._id }, { $inc: { usedCount: 1 } });
    await Vendor.updateOne({ _id: vendorId }, { $inc: { "stats.orders": 1 } });

    // Empty the cart (guest cart is deleted).
    if (owner.guestToken) await Cart.deleteOne({ _id: cart._id }).setOptions({ withDeleted: true });
    else { cart.set("items", []); cart.coupon = null; await cart.save(); }

    await writeAudit({
      actor: owner.userId ?? null, vendor: vendorId, action: "order.create",
      entity: "Order", entityId: String(order._id), diff: { number, total: totals.grandTotal },
    });
    logger.info({ orderId: String(order._id), number }, "Order created");
    return order;
  },
};
