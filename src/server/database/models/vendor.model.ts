import { Schema, model, models, type Model, type InferSchemaType, type HydratedDocument } from "mongoose";
import { basePlugin } from "../plugins/base.plugin";
import type { BaseFields } from "../types";

/**
 * A Vendor is one independent store. Exactly ONE Vendor Admin (`owner`).
 * Every vendor-owned document references its vendor for tenant isolation.
 */
const vendorSettingsSchema = new Schema(
  {
    currency: { type: String, default: "USD", uppercase: true },
    locales: { type: [String], default: ["en"] },
    defaultLocale: { type: String, default: "en" },
    timezone: { type: String, default: "UTC" },
    taxInclusive: { type: Boolean, default: false },
    supportEmail: { type: String, default: null },
    codEnabled: { type: Boolean, default: true },
    // Card payments are on by default; whether "Card" actually appears at
    // checkout still depends on the deployment having Stripe credentials
    // (see `enabledProviders()`), so a vendor with no keys configured simply
    // shows no card option rather than a broken one.
    stripeEnabled: { type: Boolean, default: true },
    paymobEnabled: { type: Boolean, default: false },
  },
  { _id: false },
);

/** Declared as a required sub-schema so `vendor.stats.x` types as present. */
const vendorStatsSchema = new Schema(
  {
    products: { type: Number, default: 0 },
    orders: { type: Number, default: 0 },
    revenue: { type: Number, default: 0 },
  },
  { _id: false },
);

const vendorSchema = new Schema({
  name: { type: String, required: true, trim: true },
  slug: { type: String, required: true, lowercase: true, trim: true, unique: true, index: true },
  description: { type: String, default: null },
  logo: { type: String, default: null },
  banner: { type: String, default: null },

  // The single Vendor Admin who owns this store.
  owner: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },

  status: {
    type: String,
    enum: ["active", "suspended", "pending"],
    default: "pending",
    index: true,
  },

  settings: { type: vendorSettingsSchema, default: () => ({}) },
  theme: {
    primaryColor: { type: String, default: "#4f46e5" },
    mode: { type: String, enum: ["light", "dark", "system"], default: "system" },
  },
  domains: { type: [String], default: [] },

  // Denormalized counters kept fresh by services for cheap dashboard reads.
  stats: { type: vendorStatsSchema, required: true, default: () => ({}) },
});

vendorSchema.plugin(basePlugin);

export type VendorRaw = InferSchemaType<typeof vendorSchema> & BaseFields;
export type VendorDoc = HydratedDocument<VendorRaw>;

export const Vendor: Model<VendorRaw> =
  (models.Vendor as Model<VendorRaw>) ?? model<VendorRaw>("Vendor", vendorSchema);
