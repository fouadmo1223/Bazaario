import { connectToDatabase } from "@/server/database/connection";
import { Order } from "@/server/database/models/order.model";
import { Product } from "@/server/database/models/product.model";
import { User } from "@/server/database/models/user.model";
import { Types } from "mongoose";
import { cached } from "@/server/cache/redis";

export type Range = { from: Date; to: Date };

export type RevenuePoint = { date: string; revenue: number; orders: number };
export type TopProduct = { productId: string; title: string; units: number; revenue: number };
export type KpiSummary = {
  revenue: number;
  orders: number;
  averageOrderValue: number;
  customers: number;
  conversionProxy: number;
};

/** Orders that count toward revenue (exclude cancelled/unpaid). */
const REVENUE_MATCH = { "payment.status": { $in: ["paid", "partially_refunded"] } };

const oid = (id: string) => new Types.ObjectId(id);

export const analyticsService = {
  /** Headline KPIs for a vendor over a date range. */
  async kpis(vendorId: string, range: Range): Promise<KpiSummary> {
    await connectToDatabase();
    const match = {
      vendor: oid(vendorId),
      createdAt: { $gte: range.from, $lte: range.to },
      ...REVENUE_MATCH,
    };

    const [agg] = await Order.aggregate<{ revenue: number; orders: number; customers: string[] }>([
      { $match: match },
      {
        $group: {
          _id: null,
          revenue: { $sum: "$totals.grandTotal" },
          orders: { $sum: 1 },
          customers: { $addToSet: "$customer" },
        },
      },
    ]);

    const revenue = agg?.revenue ?? 0;
    const orders = agg?.orders ?? 0;
    const customers = agg?.customers?.filter(Boolean).length ?? 0;

    return {
      revenue: Math.round(revenue * 100) / 100,
      orders,
      averageOrderValue: orders ? Math.round((revenue / orders) * 100) / 100 : 0,
      customers,
      conversionProxy: 0, // requires traffic data; wired when analytics ingestion lands
    };
  },

  /** Daily revenue/order series for charts (Recharts-ready). */
  async revenueSeries(vendorId: string, range: Range): Promise<RevenuePoint[]> {
    await connectToDatabase();
    const rows = await Order.aggregate<{ _id: string; revenue: number; orders: number }>([
      {
        $match: {
          vendor: oid(vendorId),
          createdAt: { $gte: range.from, $lte: range.to },
          ...REVENUE_MATCH,
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          revenue: { $sum: "$totals.grandTotal" },
          orders: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    return rows.map((r) => ({
      date: r._id,
      revenue: Math.round(r.revenue * 100) / 100,
      orders: r.orders,
    }));
  },

  /** Best sellers by units, unwinding order line items. */
  async topProducts(vendorId: string, range: Range, limit = 10): Promise<TopProduct[]> {
    await connectToDatabase();
    return Order.aggregate<TopProduct>([
      {
        $match: {
          vendor: oid(vendorId),
          createdAt: { $gte: range.from, $lte: range.to },
          ...REVENUE_MATCH,
        },
      },
      { $unwind: "$items" },
      {
        $group: {
          _id: "$items.product",
          title: { $first: "$items.title" },
          units: { $sum: "$items.quantity" },
          revenue: { $sum: "$items.total" },
        },
      },
      { $sort: { units: -1 } },
      { $limit: limit },
      { $project: { _id: 0, productId: { $toString: "$_id" }, title: 1, units: 1, revenue: 1 } },
    ]);
  },

  /** Order status distribution — powers the dashboard funnel. */
  async statusBreakdown(vendorId: string, range: Range): Promise<{ status: string; count: number }[]> {
    await connectToDatabase();
    const rows = await Order.aggregate<{ _id: string; count: number }>([
      { $match: { vendor: oid(vendorId), createdAt: { $gte: range.from, $lte: range.to } } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);
    return rows.map((r) => ({ status: r._id, count: r.count }));
  },

  /**
   * Retention proxy: share of customers in the range with more than one paid
   * order (repeat-purchase rate).
   */
  async retention(vendorId: string, range: Range): Promise<{ repeatRate: number; repeat: number; total: number }> {
    await connectToDatabase();
    const rows = await Order.aggregate<{ _id: Types.ObjectId; orders: number }>([
      {
        $match: {
          vendor: oid(vendorId),
          customer: { $ne: null },
          createdAt: { $gte: range.from, $lte: range.to },
          ...REVENUE_MATCH,
        },
      },
      { $group: { _id: "$customer", orders: { $sum: 1 } } },
    ]);
    const total = rows.length;
    const repeat = rows.filter((r) => r.orders > 1).length;
    return { repeatRate: total ? Math.round((repeat / total) * 1000) / 10 : 0, repeat, total };
  },

  /** Inventory health — products at or below their low-stock threshold. */
  async lowStock(vendorId: string, limit = 20) {
    await connectToDatabase();
    return Product.find({ vendor: vendorId, status: "active", trackInventory: true, stock: { $lte: 5 } })
      .select("title stock sku")
      .sort({ stock: 1 })
      .limit(limit)
      .lean();
  },

  /** Platform-wide totals for the Super Admin console (cached — expensive). */
  async platformOverview() {
    return cached("platform:overview", 300, async () => {
      await connectToDatabase();
      const [orderAgg] = await Order.aggregate<{ revenue: number; orders: number }>([
        { $match: REVENUE_MATCH },
        { $group: { _id: null, revenue: { $sum: "$totals.grandTotal" }, orders: { $sum: 1 } } },
      ]);
      const [users, products] = await Promise.all([
        User.countDocuments({}),
        Product.countDocuments({ status: "active" }),
      ]);
      return {
        revenue: Math.round((orderAgg?.revenue ?? 0) * 100) / 100,
        orders: orderAgg?.orders ?? 0,
        users,
        products,
      };
    });
  },
};
