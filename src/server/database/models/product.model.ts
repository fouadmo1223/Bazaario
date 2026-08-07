import { Schema, model, models, type Model, type InferSchemaType, type HydratedDocument } from "mongoose";
import { basePlugin } from "../plugins/base.plugin";
import type { BaseFields } from "../types";

const mediaSchema = new Schema(
  {
    url: { type: String, required: true },
    publicId: { type: String, default: null }, // Cloudinary id for deletion
    type: { type: String, enum: ["image", "video", "image360"], default: "image" },
    alt: { type: String, default: null },
    width: { type: Number, default: null },
    height: { type: Number, default: null },
    blurDataUrl: { type: String, default: null }, // for blur placeholder
  },
  { _id: false },
);

/** An attribute definition on a variable product, e.g. { name: "Size", values: ["S","M","L"] }. */
const attributeSchema = new Schema(
  {
    name: { type: String, required: true },
    values: { type: [String], default: [] },
    variantDefining: { type: Boolean, default: true }, // drives variant generation
  },
  { _id: false },
);

const faqSchema = new Schema(
  { question: { type: String, required: true }, answer: { type: String, required: true } },
  { _id: false },
);

const productSchema = new Schema({
  vendor: { type: Schema.Types.ObjectId, ref: "Vendor", required: true, index: true },
  type: { type: String, enum: ["simple", "variable"], default: "simple", index: true },

  title: { type: String, required: true, trim: true },
  /** Optional Arabic display title — falls back to `title` when empty. */
  titleAr: { type: String, default: null, trim: true },
  slug: { type: String, required: true, lowercase: true, trim: true },
  description: { type: String, default: "" },
  descriptionAr: { type: String, default: null },
  shortDescription: { type: String, default: null },

  brand: { type: Schema.Types.ObjectId, ref: "Brand", default: null, index: true },
  categories: { type: [Schema.Types.ObjectId], ref: "Category", default: [], index: true },
  tags: { type: [String], default: [], index: true },
  collections: { type: [String], default: [] },

  attributes: { type: [attributeSchema], default: [] },
  media: { type: [mediaSchema], default: [] },
  faqs: { type: [faqSchema], default: [] },

  // Simple-product pricing (variable products price via their Variants).
  price: { type: Number, default: 0, min: 0 },
  compareAtPrice: { type: Number, default: null, min: 0 },
  cost: { type: Number, default: null },
  sku: { type: String, default: null },
  barcode: { type: String, default: null },
  stock: { type: Number, default: 0 }, // simple product on-hand
  trackInventory: { type: Boolean, default: true },
  allowBackorder: { type: Boolean, default: false },
  weight: { type: Number, default: null },
  dimensions: {
    length: { type: Number, default: null },
    width: { type: Number, default: null },
    height: { type: Number, default: null },
  },
  shippingClass: { type: String, default: null },

  // Denormalized price range for variable products (kept fresh by the service).
  priceRange: {
    min: { type: Number, default: null },
    max: { type: Number, default: null },
  },

  status: { type: String, enum: ["draft", "active", "archived"], default: "draft", index: true },
  featured: { type: Boolean, default: false, index: true },

  ratingAvg: { type: Number, default: 0 },
  ratingCount: { type: Number, default: 0 },
  soldCount: { type: Number, default: 0 },
  viewCount: { type: Number, default: 0 },

  relatedProducts: { type: [Schema.Types.ObjectId], ref: "Product", default: [] },
  crossSell: { type: [Schema.Types.ObjectId], ref: "Product", default: [] },
  upsell: { type: [Schema.Types.ObjectId], ref: "Product", default: [] },
  frequentlyBoughtTogether: { type: [Schema.Types.ObjectId], ref: "Product", default: [] },

  seo: {
    title: { type: String, default: null },
    description: { type: String, default: null },
    keywords: { type: [String], default: [] },
    ogImage: { type: String, default: null },
  },

  publishedAt: { type: Date, default: null },
});

productSchema.plugin(basePlugin);
productSchema.index({ vendor: 1, slug: 1 }, { unique: true });
productSchema.index({ vendor: 1, status: 1, createdAt: -1 });
productSchema.index({ vendor: 1, featured: 1 });
// Full-text search across the storefront-relevant fields.
productSchema.index({ title: "text", description: "text", tags: "text" });

productSchema.virtual("onSale").get(function (this: { price: number; compareAtPrice: number | null }) {
  return this.compareAtPrice != null && this.compareAtPrice > this.price;
});

export type ProductRaw = InferSchemaType<typeof productSchema> & BaseFields;
export type ProductDoc = HydratedDocument<ProductRaw>;

export const Product: Model<ProductRaw> =
  (models.Product as Model<ProductRaw>) ?? model<ProductRaw>("Product", productSchema);
