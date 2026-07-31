import { Vendor } from "@/server/database/models/vendor.model";
import { Membership } from "@/server/database/models/membership.model";
import { connectToDatabase } from "@/server/database/connection";
import { orderService } from "@/server/services/order.service";
import type { OrderDoc, OrderStatus } from "@/server/database/models/order.model";
import type { Totals } from "@/server/services/pricing.service";
import type { Paginated } from "@/shared/lib/pagination";
import { ROLES } from "@/shared/constants/rbac";

/**
 * Read-side models for orders. Server Components render these and hand them to
 * client components, so everything here is plain and serializable — no Mongoose
 * documents or ObjectIds cross the boundary.
 */

export type OrderListItem = {
  id: string;
  number: string;
  status: OrderStatus;
  paymentStatus: string;
  paymentProvider: string;
  currency: string;
  grandTotal: number;
  itemCount: number;
  /** ISO — formatted in the view so the server and client agree on the value. */
  createdAt: string;
  vendorId: string;
  vendorName: string;
  vendorSlug: string;
  firstItemTitle: string;
  firstItemImage: string | null;
};

export type OrderDetailView = OrderListItem & {
  items: {
    title: string;
    image: string | null;
    sku: string | null;
    unitPrice: number;
    quantity: number;
    total: number;
  }[];
  totals: Totals;
  coupon: string | null;
  guestEmail: string | null;
  shipping: {
    method: string;
    driverId: string | null;
    /** Every field is optional in the schema, so the view mirrors that honestly. */
    address: {
      recipient: string | null;
      phone: string | null;
      line1: string | null;
      line2: string | null;
      city: string | null;
      region: string | null;
      postalCode: string | null;
      country: string | null;
    } | null;
  };
  timeline: { status: string; note: string | null; at: string }[];
  refunds: { amount: number; reason: string | null; at: string }[];
  refundedTotal: number;
  returns: {
    id: string;
    reason: string;
    note: string | null;
    status: "requested" | "approved" | "rejected";
    requestedAt: string;
    resolvedAt: string | null;
    resolutionNote: string | null;
  }[];
};

/** Vendor names for a set of orders, fetched in one query rather than per row. */
async function vendorLookup(orders: OrderDoc[]): Promise<Map<string, { name: string; slug: string }>> {
  const ids = [...new Set(orders.map((o) => String(o.vendor)))];
  const vendors = await Vendor.find({ _id: { $in: ids } }).select("name slug");
  return new Map(vendors.map((v) => [String(v._id), { name: v.name, slug: v.slug }]));
}

function toListItem(
  order: OrderDoc,
  vendors: Map<string, { name: string; slug: string }>,
): OrderListItem {
  const vendor = vendors.get(String(order.vendor));
  const first = order.items[0];
  return {
    id: String(order._id),
    number: order.number,
    status: order.status as OrderStatus,
    paymentStatus: order.payment.status,
    paymentProvider: order.payment.provider,
    currency: order.currency,
    grandTotal: order.totals.grandTotal,
    itemCount: order.items.reduce((n, i) => n + i.quantity, 0),
    createdAt: order.createdAt.toISOString(),
    vendorId: String(order.vendor),
    vendorName: vendor?.name ?? "Unknown vendor",
    vendorSlug: vendor?.slug ?? "",
    firstItemTitle: first?.title ?? "",
    firstItemImage: first?.image ?? null,
  };
}

function toDetail(
  order: OrderDoc,
  vendors: Map<string, { name: string; slug: string }>,
): OrderDetailView {
  const addr = order.shipping?.address;
  return {
    ...toListItem(order, vendors),
    items: order.items.map((i) => ({
      title: i.title,
      image: i.image ?? null,
      sku: i.sku ?? null,
      unitPrice: i.unitPrice,
      quantity: i.quantity,
      total: i.total,
    })),
    totals: order.totals,
    coupon: order.coupon ?? null,
    guestEmail: order.guestEmail ?? null,
    shipping: {
      method: order.shipping?.method ?? "standard",
      driverId: order.shipping?.driver ? String(order.shipping.driver) : null,
      address: addr
        ? {
            recipient: addr.recipient ?? null,
            phone: addr.phone ?? null,
            line1: addr.line1 ?? null,
            line2: addr.line2 ?? null,
            city: addr.city ?? null,
            region: addr.region ?? null,
            postalCode: addr.postalCode ?? null,
            country: addr.country ?? null,
          }
        : null,
    },
    timeline: order.timeline.map((t) => ({
      status: t.status,
      note: t.note ?? null,
      at: t.at.toISOString(),
    })),
    refunds: order.refunds.map((r) => ({
      amount: r.amount,
      reason: r.reason ?? null,
      at: r.at.toISOString(),
    })),
    refundedTotal: order.refunds.reduce((s, r) => s + r.amount, 0),
    returns: order.returns.map((r) => ({
      id: String(r._id),
      reason: r.reason,
      note: r.note ?? null,
      status: r.status as "requested" | "approved" | "rejected",
      requestedAt: r.requestedAt.toISOString(),
      resolvedAt: r.resolvedAt ? r.resolvedAt.toISOString() : null,
      resolutionNote: r.resolutionNote ?? null,
    })),
  };
}

/** A customer's own orders, newest first. */
export async function listCustomerOrders(
  customerId: string,
  query: { page?: string },
): Promise<Paginated<OrderListItem>> {
  await connectToDatabase();
  const result = await orderService.listForCustomer(customerId, { page: query.page ?? "1", limit: 10 });
  const vendors = await vendorLookup(result.items);
  return { ...result, items: result.items.map((o) => toListItem(o, vendors)) };
}

/** One of the customer's own orders. Throws NOT_FOUND when it isn't theirs. */
export async function getCustomerOrder(customerId: string, orderId: string): Promise<OrderDetailView> {
  await connectToDatabase();
  const order = await orderService.getForCustomer(customerId, orderId);
  const vendors = await vendorLookup([order]);
  return toDetail(order, vendors);
}

/** Orders for a vendor's dashboard, optionally filtered by status. */
export async function listVendorOrders(
  vendorId: string,
  query: { page?: string; status?: OrderStatus },
): Promise<Paginated<OrderListItem>> {
  await connectToDatabase();
  const result = await orderService.listForVendor(
    vendorId,
    { page: query.page ?? "1", limit: 20 },
    query.status ? { status: query.status } : {},
  );
  const vendors = await vendorLookup(result.items);
  return { ...result, items: result.items.map((o) => toListItem(o, vendors)) };
}

/** One order in the vendor's scope. */
export async function getVendorOrder(vendorId: string, orderId: string): Promise<OrderDetailView> {
  await connectToDatabase();
  const order = await orderService.getForVendor(vendorId, orderId);
  const vendors = await vendorLookup([order]);
  return toDetail(order, vendors);
}

export type DriverOption = { userId: string; name: string; email: string };

/** Vendor staff holding the delivery-driver role, for the assignment picker. */
export async function listVendorDrivers(vendorId: string): Promise<DriverOption[]> {
  await connectToDatabase();
  const memberships = await Membership.find({ vendor: vendorId, role: ROLES.DELIVERY_DRIVER, status: "active" })
    .populate<{ user: { _id: unknown; name: string; email: string } | null }>("user", "name email")
    .sort({ createdAt: -1 })
    .lean();

  // A membership whose user was hard-deleted would populate to null; skip it.
  return memberships
    .filter((m) => m.user != null)
    .map((m) => ({ userId: String(m.user!._id), name: m.user!.name, email: m.user!.email }));
}

/** Orders currently out for delivery with a given driver. */
export async function listDriverOrders(
  vendorId: string,
  driverId: string,
  query: { page?: string },
): Promise<Paginated<OrderListItem>> {
  await connectToDatabase();
  const result = await orderService.listForDriver(vendorId, driverId, { page: query.page ?? "1", limit: 20 });
  const vendors = await vendorLookup(result.items);
  return { ...result, items: result.items.map((o) => toListItem(o, vendors)) };
}
