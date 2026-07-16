import { connectToDatabase } from "@/server/database/connection";
import { Order, type OrderDoc, type OrderStatus } from "@/server/database/models/order.model";
import { paymentService } from "./payment.service";
import { Errors } from "@/shared/lib/errors";
import { writeAudit } from "./audit.service";
import { logger } from "@/shared/lib/logger";
import { paginationSchema, buildPaginated, toSortObject, type Paginated } from "@/shared/lib/pagination";

/**
 * Legal order status transitions. Encoding this as a machine prevents invalid
 * jumps (e.g. delivered → pending) that would corrupt reporting and inventory.
 */
const TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  pending: ["paid", "cancelled"],
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

export const orderService = {
  async getForMarket(marketId: string, orderId: string): Promise<OrderDoc> {
    await connectToDatabase();
    const order = await Order.findOne({ _id: orderId, market: marketId });
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

  async updateStatus(
    marketId: string,
    orderId: string,
    next: OrderStatus,
    actorId: string,
    note?: string,
  ): Promise<OrderDoc> {
    await connectToDatabase();
    const order = await this.getForMarket(marketId, orderId);
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
      actor: actorId, market: marketId, action: `order.status.${next}`,
      entity: "Order", entityId: orderId, diff: { from: current, to: next },
    });
    logger.info({ orderId, from: current, to: next }, "Order status changed");
    return order;
  },

  async cancel(marketId: string, orderId: string, actorId: string, reason?: string): Promise<OrderDoc> {
    return this.updateStatus(marketId, orderId, "cancelled", actorId, reason ?? "Cancelled");
  },

  /** Record a full or partial refund. Amount is validated against what remains. */
  async refund(
    marketId: string,
    orderId: string,
    actorId: string,
    input: { amount: number; reason?: string; reference?: string },
  ): Promise<OrderDoc> {
    await connectToDatabase();
    const order = await this.getForMarket(marketId, orderId);
    if (order.payment.status !== "paid" && order.payment.status !== "partially_refunded") {
      throw Errors.badRequest("Only paid orders can be refunded");
    }

    const alreadyRefunded = order.refunds.reduce((s, r) => s + r.amount, 0);
    const remaining = order.totals.grandTotal - alreadyRefunded;
    if (input.amount <= 0) throw Errors.badRequest("Refund amount must be positive");
    if (input.amount > remaining) {
      throw Errors.badRequest(`Refund exceeds remaining amount (${remaining.toFixed(2)})`);
    }

    order.refunds.push({
      amount: input.amount,
      reason: input.reason ?? null,
      reference: input.reference ?? null,
      at: new Date(),
      by: actorId as never,
    });

    const totalRefunded = alreadyRefunded + input.amount;
    const isFull = totalRefunded >= order.totals.grandTotal;
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
      actor: actorId, market: marketId, action: "order.refund",
      entity: "Order", entityId: orderId, diff: { amount: input.amount, full: isFull },
    });
    return order;
  },

  async addNote(marketId: string, orderId: string, actorId: string, text: string): Promise<OrderDoc> {
    await connectToDatabase();
    const order = await this.getForMarket(marketId, orderId);
    order.notes.push({ text, at: new Date(), by: actorId as never });
    await order.save();
    return order;
  },

  async assignDriver(marketId: string, orderId: string, driverId: string, actorId: string): Promise<OrderDoc> {
    await connectToDatabase();
    const order = await this.getForMarket(marketId, orderId);
    order.shipping.driver = driverId as never;
    order.timeline.push({ status: order.status, note: "Driver assigned", at: new Date(), by: actorId as never });
    await order.save();
    await writeAudit({
      actor: actorId, market: marketId, action: "order.assign_driver",
      entity: "Order", entityId: orderId, diff: { driver: driverId },
    });
    return order;
  },

  async listForMarket(marketId: string, query: unknown, filters: { status?: OrderStatus } = {}): Promise<Paginated<OrderDoc>> {
    await connectToDatabase();
    const pagination = paginationSchema.parse(query);
    const filter = { market: marketId, ...(filters.status ? { status: filters.status } : {}) };
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
  async listForDriver(marketId: string, driverId: string, query: unknown): Promise<Paginated<OrderDoc>> {
    await connectToDatabase();
    const pagination = paginationSchema.parse(query);
    const activeDelivery: OrderStatus[] = ["shipped", "out_for_delivery"];
    const filter = {
      market: marketId,
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
