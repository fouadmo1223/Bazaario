import { connectToDatabase } from "@/server/database/connection";
import { Order, type OrderDoc, type OrderStatus } from "@/server/database/models/order.model";
import { Vendor } from "@/server/database/models/vendor.model";
import { paymentService } from "./payment.service";
import { cartService } from "./cart.service";
import { Errors } from "@/shared/lib/errors";
import { writeAudit } from "./audit.service";
import { logger } from "@/shared/lib/logger";
import { paginationSchema, buildPaginated, toSortObject, type Paginated } from "@/shared/lib/pagination";
import { toMinor, toMajor, addMinor, subMinor, sumAmounts } from "@/shared/lib/money";

/**
 * Legal order status transitions. Encoding this as a machine prevents invalid
 * jumps (e.g. delivered → pending) that would corrupt reporting and inventory.
 */
const TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  // COD orders go straight to `processing` — they are not paid until delivery,
  // so forcing them through `paid` first would misreport revenue.
  pending: ["paid", "processing", "cancelled"],
  paid: ["processing", "cancelled", "refunded"],
  processing: ["shipped", "cancelled", "refunded"],
  shipped: ["out_for_delivery", "delivered", "refunded"],
  out_for_delivery: ["delivered", "shipped", "refunded"],
  delivered: ["refunded"],
  cancelled: [],
  refunded: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/**
 * The statuses an order may legally move to next. The dashboard offers exactly
 * these, so the UI can't present a transition the service would then reject.
 */
export function allowedTransitions(from: OrderStatus): readonly OrderStatus[] {
  return TRANSITIONS[from];
}

export const orderService = {
  async getForVendor(vendorId: string, orderId: string): Promise<OrderDoc> {
    await connectToDatabase();
    const order = await Order.findOne({ _id: orderId, vendor: vendorId });
    if (!order) throw Errors.notFound("Order not found");
    return order;
  },

  /** A customer may only read their own orders. */
  async getForCustomer(customerId: string, orderId: string): Promise<OrderDoc> {
    await connectToDatabase();
    const order = await Order.findOne({ _id: orderId, customer: customerId });
    if (!order) throw Errors.notFound("Order not found");
    return order;
  },

  /**
   * Re-add a past order's items to the customer's cart for that vendor.
   *
   * Best-effort per line: a product can be discontinued, deactivated, or sold
   * out since the order shipped, and none of that should block the lines that
   * are still buyable. `cartService.addItem` re-reads price and stock itself,
   * so this never trusts the order's frozen snapshot for either.
   */
  async reorder(
    customerId: string,
    orderId: string,
  ): Promise<{ added: number; skipped: { title: string; reason: string }[]; vendorSlug: string }> {
    await connectToDatabase();
    const order = await Order.findOne({ _id: orderId, customer: customerId });
    if (!order) throw Errors.notFound("Order not found");

    const vendor = await Vendor.findById(order.vendor).select("slug");
    if (!vendor) throw Errors.notFound("Vendor not found");

    const owner = { userId: customerId };
    let added = 0;
    const skipped: { title: string; reason: string }[] = [];

    for (const item of order.items) {
      try {
        await cartService.addItem(String(order.vendor), owner, {
          productId: String(item.product),
          variantId: item.variant ? String(item.variant) : undefined,
          quantity: item.quantity,
        });
        added++;
      } catch (err) {
        skipped.push({ title: item.title, reason: err instanceof Error ? err.message : "Not available" });
      }
    }

    return { added, skipped, vendorSlug: vendor.slug };
  },

  async updateStatus(
    vendorId: string,
    orderId: string,
    next: OrderStatus,
    actorId: string,
    note?: string,
  ): Promise<OrderDoc> {
    await connectToDatabase();
    const order = await this.getForVendor(vendorId, orderId);
    const current = order.status as OrderStatus;

    if (current === next) return order;
    if (!canTransition(current, next)) {
      throw Errors.badRequest(`Cannot change an order from "${current}" to "${next}"`);
    }

    order.status = next;
    order.timeline.push({ status: next, note: note ?? null, at: new Date(), by: actorId as never });

    // COD is captured when the courier hands over the goods.
    if (next === "delivered" && order.payment.provider === "cod" && order.payment.status !== "paid") {
      order.payment.status = "paid";
      order.payment.paidAt = new Date();
    }
    // Cancelling a not-yet-shipped order returns the reserved stock.
    if (next === "cancelled") {
      await paymentService.releaseInventory(order);
    }

    await order.save();
    await writeAudit({
      actor: actorId, vendor: vendorId, action: `order.status.${next}`,
      entity: "Order", entityId: orderId, diff: { from: current, to: next },
    });
    logger.info({ orderId, from: current, to: next }, "Order status changed");
    return order;
  },

  async cancel(vendorId: string, orderId: string, actorId: string, reason?: string): Promise<OrderDoc> {
    return this.updateStatus(vendorId, orderId, "cancelled", actorId, reason ?? "Cancelled");
  },

  /** Record a full or partial refund. Amount is validated against what remains. */
  async refund(
    vendorId: string,
    orderId: string,
    actorId: string,
    input: { amount: number; reason?: string; reference?: string },
  ): Promise<OrderDoc> {
    await connectToDatabase();
    const order = await this.getForVendor(vendorId, orderId);
    if (order.payment.status !== "paid" && order.payment.status !== "partially_refunded") {
      throw Errors.badRequest("Only paid orders can be refunded");
    }

    // Compared in whole cents, not floats. See shared/lib/money.ts: on the raw
    // values a refund that exactly settles the balance can read as both "more
    // than remaining" and "less than the total", so a fully refunded order gets
    // stuck in `partially_refunded` and its stock is never released.
    const total = toMinor(order.totals.grandTotal);
    const alreadyRefunded = sumAmounts(order.refunds.map((r) => r.amount));
    const remaining = subMinor(total, alreadyRefunded);
    const amount = toMinor(input.amount);

    if (amount <= 0) throw Errors.badRequest("Refund amount must be positive");
    if (amount > remaining) {
      throw Errors.badRequest(`Refund exceeds remaining amount (${toMajor(remaining).toFixed(2)})`);
    }

    order.refunds.push({
      amount: input.amount,
      reason: input.reason ?? null,
      reference: input.reference ?? null,
      at: new Date(),
      by: actorId as never,
    });

    const isFull = addMinor(alreadyRefunded, amount) >= total;
    order.payment.status = isFull ? "refunded" : "partially_refunded";
    if (isFull) {
      order.status = "refunded";
      await paymentService.releaseInventory(order);
    }
    order.timeline.push({
      status: order.status,
      note: `Refunded ${input.amount.toFixed(2)}`,
      at: new Date(),
      by: actorId as never,
    });

    await order.save();
    await writeAudit({
      actor: actorId, vendor: vendorId, action: "order.refund",
      entity: "Order", entityId: orderId, diff: { amount: input.amount, full: isFull },
    });
    return order;
  },

  /**
   * Customer requests a return on a delivered order.
   *
   * A layer on top of the order, not a new order status: it doesn't move
   * money by itself, and it doesn't need one open at a time to be exclusive
   * with other order activity the way a status transition would.
   */
  async requestReturn(
    customerId: string,
    orderId: string,
    input: { reason: string; note?: string },
  ): Promise<OrderDoc> {
    await connectToDatabase();
    const order = await Order.findOne({ _id: orderId, customer: customerId });
    if (!order) throw Errors.notFound("Order not found");
    if (order.status !== "delivered") {
      throw Errors.badRequest("Only a delivered order can be returned");
    }
    if (order.returns.some((r) => r.status === "requested")) {
      throw Errors.conflict("A return request is already pending for this order");
    }

    order.returns.push({
      reason: input.reason,
      note: input.note ?? null,
      status: "requested",
      requestedAt: new Date(),
    } as never);
    order.timeline.push({
      status: order.status,
      note: `Return requested: ${input.reason}`,
      at: new Date(),
      by: customerId as never,
    });
    await order.save();
    return order;
  },

  /** Vendor accepts or declines a pending return request. Approving does not itself refund — see `refund`. */
  async resolveReturn(
    vendorId: string,
    orderId: string,
    returnId: string,
    actorId: string,
    decision: "approved" | "rejected",
    note?: string,
  ): Promise<OrderDoc> {
    await connectToDatabase();
    const order = await this.getForVendor(vendorId, orderId);
    const entry = order.returns.id(returnId);
    if (!entry || entry.status !== "requested") {
      throw Errors.notFound("No pending return request");
    }

    entry.status = decision;
    entry.resolvedAt = new Date();
    entry.resolvedBy = actorId as never;
    entry.resolutionNote = note ?? null;
    order.timeline.push({
      status: order.status,
      note: `Return ${decision}${note ? `: ${note}` : ""}`,
      at: new Date(),
      by: actorId as never,
    });

    await order.save();
    await writeAudit({
      actor: actorId, vendor: vendorId, action: `order.return_${decision}`,
      entity: "Order", entityId: orderId, diff: { returnId, note: note ?? null },
    });
    return order;
  },

  async addNote(vendorId: string, orderId: string, actorId: string, text: string): Promise<OrderDoc> {
    await connectToDatabase();
    const order = await this.getForVendor(vendorId, orderId);
    order.notes.push({ text, at: new Date(), by: actorId as never });
    await order.save();
    return order;
  },

  async assignDriver(vendorId: string, orderId: string, driverId: string, actorId: string): Promise<OrderDoc> {
    await connectToDatabase();
    const order = await this.getForVendor(vendorId, orderId);
    order.shipping.driver = driverId as never;
    order.timeline.push({ status: order.status, note: "Driver assigned", at: new Date(), by: actorId as never });
    await order.save();
    await writeAudit({
      actor: actorId, vendor: vendorId, action: "order.assign_driver",
      entity: "Order", entityId: orderId, diff: { driver: driverId },
    });
    return order;
  },

  async listForVendor(vendorId: string, query: unknown, filters: { status?: OrderStatus } = {}): Promise<Paginated<OrderDoc>> {
    await connectToDatabase();
    const pagination = paginationSchema.parse(query);
    const filter = { vendor: vendorId, ...(filters.status ? { status: filters.status } : {}) };
    const skip = (pagination.page - 1) * pagination.limit;
    const [items, total] = await Promise.all([
      Order.find(filter).sort(toSortObject(pagination)).skip(skip).limit(pagination.limit).exec(),
      Order.countDocuments(filter).exec(),
    ]);
    return buildPaginated(items, total, pagination);
  },

  async listForCustomer(customerId: string, query: unknown): Promise<Paginated<OrderDoc>> {
    await connectToDatabase();
    const pagination = paginationSchema.parse(query);
    const skip = (pagination.page - 1) * pagination.limit;
    const [items, total] = await Promise.all([
      Order.find({ customer: customerId }).sort(toSortObject(pagination)).skip(skip).limit(pagination.limit).exec(),
      Order.countDocuments({ customer: customerId }).exec(),
    ]);
    return buildPaginated(items, total, pagination);
  },

  /** Orders assigned to a delivery driver. */
  async listForDriver(vendorId: string, driverId: string, query: unknown): Promise<Paginated<OrderDoc>> {
    await connectToDatabase();
    const pagination = paginationSchema.parse(query);
    const activeDelivery: OrderStatus[] = ["shipped", "out_for_delivery"];
    const filter = {
      vendor: vendorId,
      "shipping.driver": driverId,
      status: { $in: activeDelivery },
    };
    const skip = (pagination.page - 1) * pagination.limit;
    const [items, total] = await Promise.all([
      Order.find(filter).sort(toSortObject(pagination)).skip(skip).limit(pagination.limit).exec(),
      Order.countDocuments(filter).exec(),
    ]);
    return buildPaginated(items, total, pagination);
  },
};
