import { Schema, model, models, type Model, type InferSchemaType, type HydratedDocument } from "mongoose";
import { basePlugin } from "../plugins/base.plugin";
import type { BaseFields } from "../types";

/**
 * A vendor's storefront announcement bar. Deliberately just one field of
 * actual content — a message — plus an optional link and an active window.
 * The full `CmsPage/Blog/Menu` sketch in ARCHITECTURE.md is aspirational; this
 * is the one piece of it a marketplace storefront actually needs on day one.
 */
const bannerSchema = new Schema({
  vendor: { type: Schema.Types.ObjectId, ref: "Vendor", required: true, index: true },
  message: { type: String, required: true, trim: true },
  linkUrl: { type: String, default: null },
  linkLabel: { type: String, default: null },
  startsAt: { type: Date, default: null },
  endsAt: { type: Date, default: null },
  isActive: { type: Boolean, default: true, index: true },
});

bannerSchema.plugin(basePlugin);
bannerSchema.index({ vendor: 1, isActive: 1, createdAt: -1 });

export type BannerRaw = InferSchemaType<typeof bannerSchema> & BaseFields;
export type BannerDoc = HydratedDocument<BannerRaw>;

export const Banner: Model<BannerRaw> =
  (models.Banner as Model<BannerRaw>) ?? model<BannerRaw>("Banner", bannerSchema);
