import { Schema, model, models, type Model, type InferSchemaType, type HydratedDocument } from "mongoose";
import { basePlugin } from "../plugins/base.plugin";
import type { BaseFields } from "../types";

/** Market-scoped discount code. Constraints validated by the checkout service. */
const couponSchema = new Schema({
  market: { type: Schema.Types.ObjectId, ref: "Market", required: true, index: true },
  code: { type: String, required: true, uppercase: true, trim: true },
  description: { type: String, default: null },
  type: { type: String, enum: ["percentage", "fixed", "free_shipping"], required: true },
  value: { type: Number, default: 0, min: 0 },

  minSpend: { type: Number, default: 0 },
  maxDiscount: { type: Number, default: null }, // cap for percentage coupons
  usageLimit: { type: Number, default: null }, // total redemptions allowed
  perUserLimit: { type: Number, default: null },
  usedCount: { type: Number, default: 0 },

  appliesToProducts: { type: [Schema.Types.ObjectId], ref: "Product", default: [] },
  appliesToCategories: { type: [Schema.Types.ObjectId], ref: "Category", default: [] },

  startsAt: { type: Date, default: null },
  expiresAt: { type: Date, default: null },
  isActive: { type: Boolean, default: true, index: true },
});

couponSchema.plugin(basePlugin);
couponSchema.index({ market: 1, code: 1 }, { unique: true });

export type CouponRaw = InferSchemaType<typeof couponSchema> & BaseFields;
export type CouponDoc = HydratedDocument<CouponRaw>;

export const Coupon: Model<CouponRaw> =
  (models.Coupon as Model<CouponRaw>) ?? model<CouponRaw>("Coupon", couponSchema);
