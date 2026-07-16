import { Schema, model, models, type Model, type InferSchemaType, type HydratedDocument } from "mongoose";
import { basePlugin } from "../plugins/base.plugin";
import type { BaseFields } from "../types";

/** A concrete purchasable variation of a variable product (e.g. Red / Large). */
const variantSchema = new Schema({
  vendor: { type: Schema.Types.ObjectId, ref: "Vendor", required: true, index: true },
  product: { type: Schema.Types.ObjectId, ref: "Product", required: true, index: true },

  // Selected attribute values, e.g. { Color: "Red", Size: "L" }.
  options: { type: Map, of: String, default: {} },

  sku: { type: String, required: true, trim: true },
  barcode: { type: String, default: null },

  price: { type: Number, required: true, min: 0 },
  compareAtPrice: { type: Number, default: null, min: 0 },
  cost: { type: Number, default: null },

  stock: { type: Number, default: 0 },
  weight: { type: Number, default: null },
  image: { type: String, default: null },

  isActive: { type: Boolean, default: true },
});

variantSchema.plugin(basePlugin);
variantSchema.index({ vendor: 1, sku: 1 }, { unique: true });
// `product` field already declares `index: true`; no separate index needed.

export type VariantRaw = InferSchemaType<typeof variantSchema> & BaseFields;
export type VariantDoc = HydratedDocument<VariantRaw>;

export const Variant: Model<VariantRaw> =
  (models.Variant as Model<VariantRaw>) ?? model<VariantRaw>("Variant", variantSchema);
