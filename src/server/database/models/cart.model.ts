import { Schema, model, models, type Model, type InferSchemaType, type HydratedDocument } from "mongoose";
import { basePlugin } from "../plugins/base.plugin";
import type { BaseFields } from "../types";

/**
 * A cart is scoped to one market. Either `user` (logged-in) or `guestToken`
 * (anonymous) identifies the owner. Prices are snapshotted at add-time and
 * re-validated at checkout. Guest carts merge into the user cart on login.
 */
const cartItemSchema = new Schema(
  {
    product: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    variant: { type: Schema.Types.ObjectId, ref: "Variant", default: null },
    title: { type: String, required: true }, // snapshot for display stability
    image: { type: String, default: null },
    sku: { type: String, default: null },
    unitPrice: { type: Number, required: true, min: 0 }, // snapshot
    quantity: { type: Number, required: true, min: 1 },
  },
  { _id: false },
);

const cartSchema = new Schema({
  market: { type: Schema.Types.ObjectId, ref: "Market", required: true, index: true },
  user: { type: Schema.Types.ObjectId, ref: "User", default: null, index: true },
  guestToken: { type: String, default: null, index: true },
  items: { type: [cartItemSchema], default: [] },
  coupon: { type: String, default: null },
  currency: { type: String, default: "USD" },
  expiresAt: { type: Date, default: null }, // guest cart TTL
});

cartSchema.plugin(basePlugin);
cartSchema.index({ market: 1, user: 1 });
cartSchema.index({ market: 1, guestToken: 1 });

cartSchema.virtual("subtotal").get(function (this: { items: { unitPrice: number; quantity: number }[] }) {
  return this.items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
});
cartSchema.virtual("itemCount").get(function (this: { items: { quantity: number }[] }) {
  return this.items.reduce((n, i) => n + i.quantity, 0);
});

export type CartRaw = InferSchemaType<typeof cartSchema> & BaseFields;
export type CartDoc = HydratedDocument<CartRaw>;

export const Cart: Model<CartRaw> =
  (models.Cart as Model<CartRaw>) ?? model<CartRaw>("Cart", cartSchema);
