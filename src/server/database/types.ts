import type { Types } from "mongoose";

/**
 * Fields injected at runtime by `basePlugin` (and timestamps). `InferSchemaType`
 * can't see plugin-added paths, so we intersect this into every model's raw type.
 */
export type BaseFields = {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  createdBy: Types.ObjectId | null;
  updatedBy: Types.ObjectId | null;
};
