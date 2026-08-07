import { Schema, model, models, type Model, type InferSchemaType, type HydratedDocument } from "mongoose";
import { basePlugin } from "../plugins/base.plugin";
import type { BaseFields } from "../types";
import { ROLES } from "@/shared/constants/rbac";

const oauthProviderSchema = new Schema(
  {
    provider: { type: String, enum: ["google"], required: true },
    sub: { type: String, required: true },
  },
  { _id: false },
);

const userSchema = new Schema({
  email: { type: String, required: true, lowercase: true, trim: true, unique: true, index: true },
  passwordHash: { type: String, default: null, select: false },
  name: { type: String, required: true, trim: true },
  avatar: { type: String, default: null },
  phone: { type: String, default: null, trim: true },
  /** Last locale this account was seen using — lets server-generated content
   *  (e.g. a chat notification's title) go out in the right language even
   *  though it's created without a request/cookie to read from. */
  locale: { type: String, default: null },

  // Global roles (platform-level, e.g. super_admin/customer). Vendor-scoped
  // roles live in the Membership collection.
  roles: {
    type: [String],
    enum: Object.values(ROLES),
    default: [ROLES.CUSTOMER],
    index: true,
  },

  status: {
    type: String,
    enum: ["active", "suspended", "pending"],
    default: "pending",
    index: true,
  },

  emailVerifiedAt: { type: Date, default: null },
  lastLoginAt: { type: Date, default: null },

  providers: { type: [oauthProviderSchema], default: [] },

  // Convenience pointer to the vendor a staff user is currently operating in.
  defaultVendor: { type: Schema.Types.ObjectId, ref: "Vendor", default: null },
});

userSchema.plugin(basePlugin);

userSchema.index({ "providers.provider": 1, "providers.sub": 1 });

export type UserRaw = InferSchemaType<typeof userSchema> & BaseFields;
export type UserDoc = HydratedDocument<UserRaw>;

export const User: Model<UserRaw> =
  (models.User as Model<UserRaw>) ?? model<UserRaw>("User", userSchema);
