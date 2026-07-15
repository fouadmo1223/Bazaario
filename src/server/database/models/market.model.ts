import { Schema, model, models, type Model, type InferSchemaType } from "mongoose";
import { basePlugin } from "../plugins/base.plugin";

/**
 * A Market is one independent store. Exactly ONE Market Admin (`owner`).
 * Every market-owned document references its market for tenant isolation.
 */
const marketSettingsSchema = new Schema(
  {
    currency: { type: String, default: "USD", uppercase: true },
    locales: { type: [String], default: ["en"] },
    defaultLocale: { type: String, default: "en" },
    timezone: { type: String, default: "UTC" },
    taxInclusive: { type: Boolean, default: false },
    supportEmail: { type: String, default: null },
    codEnabled: { type: Boolean, default: true },
    stripeEnabled: { type: Boolean, default: false },
    paymobEnabled: { type: Boolean, default: false },
  },
  { _id: false },
);

const marketSchema = new Schema({
  name: { type: String, required: true, trim: true },
  slug: { type: String, required: true, lowercase: true, trim: true, unique: true, index: true },
  description: { type: String, default: null },
  logo: { type: String, default: null },
  banner: { type: String, default: null },

  // The single Market Admin who owns this store.
  owner: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },

  status: {
    type: String,
    enum: ["active", "suspended", "pending"],
    default: "pending",
    index: true,
  },

  settings: { type: marketSettingsSchema, default: () => ({}) },
  theme: {
    primaryColor: { type: String, default: "#4f46e5" },
    mode: { type: String, enum: ["light", "dark", "system"], default: "system" },
  },
  domains: { type: [String], default: [] },

  // Denormalized counters kept fresh by services for cheap dashboard reads.
  stats: {
    products: { type: Number, default: 0 },
    orders: { type: Number, default: 0 },
    revenue: { type: Number, default: 0 },
  },
});

marketSchema.plugin(basePlugin);

export type MarketDoc = InferSchemaType<typeof marketSchema> & { _id: Schema.Types.ObjectId };

export const Market: Model<MarketDoc> =
  (models.Market as Model<MarketDoc>) ?? model<MarketDoc>("Market", marketSchema);
