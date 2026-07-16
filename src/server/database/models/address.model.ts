import { Schema, model, models, type Model, type InferSchemaType, type HydratedDocument } from "mongoose";
import { basePlugin } from "../plugins/base.plugin";
import type { BaseFields } from "../types";

const addressSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  label: { type: String, default: "Home" },
  recipient: { type: String, required: true },
  phone: { type: String, required: true },
  line1: { type: String, required: true },
  line2: { type: String, default: null },
  city: { type: String, required: true },
  region: { type: String, default: null },
  postalCode: { type: String, default: null },
  country: { type: String, required: true, default: "EG" },
  geo: {
    lat: { type: Number, default: null },
    lng: { type: Number, default: null },
  },
  isDefault: { type: Boolean, default: false },
});

addressSchema.plugin(basePlugin);
addressSchema.index({ user: 1, isDefault: -1 });

export type AddressRaw = InferSchemaType<typeof addressSchema> & BaseFields;
export type AddressDoc = HydratedDocument<AddressRaw>;

export const Address: Model<AddressRaw> =
  (models.Address as Model<AddressRaw>) ?? model<AddressRaw>("Address", addressSchema);
