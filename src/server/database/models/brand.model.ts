import { Schema, model, models, type Model, type InferSchemaType, type HydratedDocument } from "mongoose";
import { basePlugin } from "../plugins/base.plugin";
import type { BaseFields } from "../types";

const brandSchema = new Schema({
  market: { type: Schema.Types.ObjectId, ref: "Market", required: true, index: true },
  name: { type: String, required: true, trim: true },
  slug: { type: String, required: true, lowercase: true, trim: true },
  logo: { type: String, default: null },
  description: { type: String, default: null },
  isActive: { type: Boolean, default: true },
});

brandSchema.plugin(basePlugin);
brandSchema.index({ market: 1, slug: 1 }, { unique: true });

export type BrandRaw = InferSchemaType<typeof brandSchema> & BaseFields;
export type BrandDoc = HydratedDocument<BrandRaw>;

export const Brand: Model<BrandRaw> =
  (models.Brand as Model<BrandRaw>) ?? model<BrandRaw>("Brand", brandSchema);
