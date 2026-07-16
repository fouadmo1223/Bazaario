import { connectToDatabase } from "@/server/database/connection";
import { Cart } from "@/server/database/models/cart.model";
import { Order, type OrderDoc } from "@/server/database/models/order.model";
import { Product } from "@/server/database/models/product.model";
import { Variant } from "@/server/database/models/variant.model";
import { Coupon } from "@/server/database/models/coupon.model";
import { Vendor } from "@/server/database/models/vendor.model";
import { getRedis } from "@/server/cache/redis";
import { Errors } from "@/shared/lib/errors";
import { validateCoupon, computeTotals, vendorTaxRate, type CartLine } from "./pricing.service";
import { writeAudit } from "./audit.service";
import { logger } from "@/shared/lib/logger";
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

      if (track && !backorder && item.quantity > stock) {
        throw Errors.conflict(`Only ${stock} of "${product.title}" left`);
      }

      lines.push({ unitPrice: price, quantity: item.quantity });
      orderItems.push({
        product: product._id,
        variant: item.variant ?? null,
        title: product.title,
        image: item.image ?? null,
        sku: sku ?? null,
        unitPrice: price,
        quantity: item.quantity,
        total: Math.round(price * item.quantity * 100) / 100,
      });
    }

    // Coupon (optional).
    let coupon = null;
    const subtotalPreview = lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
    if (cart.coupon) {
      coupon = await validateCoupon(vendorId, cart.coupon, subtotalPreview);
    }

    const taxRate = vendorTaxRate(vendor.settings);
    const totals = computeTotals(lines, {
      coupon,
      taxRate,
      shippingBase: input.shippingBase ?? 0,
      taxInclusive: vendor.settings.taxInclusive,
    });

    const number = await nextOrderNumber(vendorId);

    // Reserve inventory by decrementing stock on the source documents.
    for (const item of cart.items) {
      if (item.variant) {
        await Variant.updateOne({ _id: item.variant }, { $inc: { stock: -item.quantity } });
      } else {
        await Product.updateOne({ _id: item.product }, { $inc: { stock: -item.quantity, soldCount: item.quantity } });
      }
    }

    const order = await Order.create({
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
