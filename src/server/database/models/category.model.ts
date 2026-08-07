import { Schema, model, models, type Model, type InferSchemaType, type HydratedDocument } from "mongoose";
import { basePlugin } from "../plugins/base.plugin";
import type { BaseFields } from "../types";

/** Vendor-scoped, self-referential category tree (materialized `path` for fast subtree queries). */
const categorySchema = new Schema({
  vendor: { type: Schema.Types.ObjectId, ref: "Vendor", required: true, index: true },
  name: { type: String, required: true, trim: true },
  /** Optional Arabic display name — falls back to `name` when empty. */
  nameAr: { type: String, default: null, trim: true },
  slug: { type: String, required: true, lowercase: true, trim: true },
  description: { type: String, default: null },
  image: { type: String, default: null },
  parent: { type: Schema.Types.ObjectId, ref: "Category", default: null, index: true },
  path: { type: [Schema.Types.ObjectId], default: [] }, // ancestors, root → parent
  order: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true, index: true },
  seo: {
    title: { type: String, default: null },
    description: { type: String, default: null },
  },
});

categorySchema.plugin(basePlugin);
categorySchema.index({ vendor: 1, slug: 1 }, { unique: true });

export type CategoryRaw = InferSchemaType<typeof categorySchema> & BaseFields;
export type CategoryDoc = HydratedDocument<CategoryRaw>;

export const Category: Model<CategoryRaw> =
  (models.Category as Model<CategoryRaw>) ?? model<CategoryRaw>("Category", categorySchema);
