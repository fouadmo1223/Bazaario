import { Schema, model, models, type Model, type InferSchemaType, type HydratedDocument } from "mongoose";
import { basePlugin } from "../plugins/base.plugin";
import type { BaseFields } from "../types";

/**
 * Inventory ledger for reservation-aware stock. `available = onHand - reserved`.
 * Checkout reserves; fulfillment decrements onHand; cancellation releases.
 * `product` xor `variant` identifies the stock unit.
 */
const inventorySchema = new Schema({
  vendor: { type: Schema.Types.ObjectId, ref: "Vendor", required: true, index: true },
  product: { type: Schema.Types.ObjectId, ref: "Product", default: null, index: true },
  variant: { type: Schema.Types.ObjectId, ref: "Variant", default: null, index: true },

  onHand: { type: Number, default: 0, min: 0 },
  reserved: { type: Number, default: 0, min: 0 },
  lowStockThreshold: { type: Number, default: 5 },
  allowBackorder: { type: Boolean, default: false },
  location: { type: String, default: "default" },
});

inventorySchema.plugin(basePlugin);
inventorySchema.index({ vendor: 1, variant: 1 });
inventorySchema.index({ vendor: 1, product: 1 });

inventorySchema.virtual("available").get(function (this: { onHand: number; reserved: number }) {
  return Math.max(0, this.onHand - this.reserved);
});

export type InventoryRaw = InferSchemaType<typeof inventorySchema> & BaseFields;
export type InventoryDoc = HydratedDocument<InventoryRaw>;

export const Inventory: Model<InventoryRaw> =
  (models.Inventory as Model<InventoryRaw>) ?? model<InventoryRaw>("Inventory", inventorySchema);
