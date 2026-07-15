import { Schema, model, models, type Model, type InferSchemaType, type HydratedDocument } from "mongoose";
import { basePlugin } from "../plugins/base.plugin";
import type { BaseFields } from "../types";
import { ROLES, PERMISSIONS } from "@/shared/constants/rbac";

/**
 * Binds a user to a market with a market-scoped role. This is what enforces
 * tenant isolation: a staff user can only act on the market(s) they have a
 * Membership for. Extra `permissions` can grant fine-grained overrides on top
 * of the role's base set.
 */
const membershipSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  market: { type: Schema.Types.ObjectId, ref: "Market", required: true, index: true },
  role: {
    type: String,
    enum: [
      ROLES.MARKET_ADMIN,
      ROLES.MARKETING,
      ROLES.SUPPORT,
      ROLES.DELIVERY_DRIVER,
    ],
    required: true,
  },
  permissions: { type: [String], enum: Object.values(PERMISSIONS), default: [] },
  status: { type: String, enum: ["active", "invited", "suspended"], default: "active", index: true },
  invitedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
});

membershipSchema.plugin(basePlugin);

// One membership record per user per market.
membershipSchema.index({ user: 1, market: 1 }, { unique: true });

export type MembershipRaw = InferSchemaType<typeof membershipSchema> & BaseFields;
export type MembershipDoc = HydratedDocument<MembershipRaw>;

export const Membership: Model<MembershipRaw> =
  (models.Membership as Model<MembershipRaw>) ??
  model<MembershipRaw>("Membership", membershipSchema);
