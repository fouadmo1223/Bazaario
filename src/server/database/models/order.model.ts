import { Schema, model, models, type Model, type InferSchemaType, type HydratedDocument } from "mongoose";
import { basePlugin } from "../plugins/base.plugin";
import type { BaseFields } from "../types";

export const ORDER_STATUSES = [
  "pending",       // created, awaiting payment
  "paid",          // payment captured
  "processing",    // being prepared
  "shipped",       // handed to delivery
  "out_for_delivery",
  "delivered",
  "cancelled",
  "refunded",
] as const;

export const PAYMENT_STATUSES = ["pending", "authorized", "paid", "failed", "refunded", "partially_refunded"] as const;

const orderItemSchema = new Schema(
  {
    product: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    variant: { type: Schema.Types.ObjectId, ref: "Variant", default: null },
    title: { type: String, required: true },
    image: { type: String, default: null },
    sku: { type: String, default: null },
    unitPrice: { type: Number, required: true },
    quantity: { type: Number, required: true, min: 1 },
    total: { type: Number, required: true },
  },
  { _id: false },
);

const timelineEntrySchema = new Schema(
  {
    status: { type: String, required: true },
    note: { type: String, default: null },
    at: { type: Date, default: Date.now },
    by: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { _id: false },
);

const addressSnapshotSchema = new Schema(
  {
    recipient: String, phone: String, line1: String, line2: String,
    city: String, region: String, postalCode: String, country: String,
    geo: { lat: Number, lng: Number },
  },
  { _id: false },
);

const refundSchema = new Schema(
  {
    amount: { type: Number, required: true },
    reason: { type: String, default: null },
    reference: { type: String, default: null },
    at: { type: Date, default: Date.now },
    by: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { _id: false },
);

/**
 * Nested groups are declared as explicit sub-schemas with `required: true` so
 * `InferSchemaType` types them as present rather than optional — otherwise every
 * `order.totals.x` access needs a null check despite always being written.
 */
const totalsSchema = new Schema(
  {
    subtotal: { type: Number, required: true },
    discount: { type: Number, default: 0 },
    tax: { type: Number, default: 0 },
    shipping: { type: Number, default: 0 },
    grandTotal: { type: Number, required: true },
  },
  { _id: false },
);

const paymentSchema = new Schema(
  {
    provider: { type: String, enum: ["stripe", "paymob", "cod", "wallet"], default: "cod" },
    status: { type: String, enum: PAYMENT_STATUSES, default: "pending", index: true },
    reference: { type: String, default: null }, // provider intent/txn id
    paidAt: { type: Date, default: null },
  },
  { _id: false },
);

const shippingSchema = new Schema(
  {
    address: { type: addressSnapshotSchema, default: null },
    method: { type: String, default: "standard" },
    slot: { type: String, default: null },
    trackingNumber: { type: String, default: null },
    driver: { type: Schema.Types.ObjectId, ref: "User", default: null, index: true },
    estimatedAt: { type: Date, default: null },
  },
  { _id: false },
);

const orderSchema = new Schema({
  market: { type: Schema.Types.ObjectId, ref: "Market", required: true, index: true },
  number: { type: String, required: true }, // human-friendly per-market order number
  customer: { type: Schema.Types.ObjectId, ref: "User", default: null, index: true },
  guestEmail: { type: String, default: null }, // guest checkout

  items: { type: [orderItemSchema], required: true },

  totals: { type: totalsSchema, required: true },
  currency: { type: String, default: "USD" },
  coupon: { type: String, default: null },

  status: { type: String, enum: ORDER_STATUSES, default: "pending", index: true },
  timeline: { type: [timelineEntrySchema], default: [] },

  payment: { type: paymentSchema, required: true, default: () => ({}) },
  shipping: { type: shippingSchema, required: true, default: () => ({}) },
  billingAddress: { type: addressSnapshotSchema, default: null },

  refunds: { type: [refundSchema], default: [] },
  notes: { type: [{ text: String, at: { type: Date, default: Date.now }, by: { type: Schema.Types.ObjectId, ref: "User" } }], default: [] },

  placedAt: { type: Date, default: Date.now },
});

orderSchema.plugin(basePlugin);
orderSchema.index({ market: 1, number: 1 }, { unique: true });
orderSchema.index({ market: 1, status: 1, createdAt: -1 });
orderSchema.index({ customer: 1, createdAt: -1 });

export type OrderStatus = (typeof ORDER_STATUSES)[number];
export type OrderRaw = InferSchemaType<typeof orderSchema> & BaseFields;
export type OrderDoc = HydratedDocument<OrderRaw>;

export const Order: Model<OrderRaw> =
  (models.Order as Model<OrderRaw>) ?? model<OrderRaw>("Order", orderSchema);
