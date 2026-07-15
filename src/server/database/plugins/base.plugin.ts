import type { Schema } from "mongoose";

/**
 * Cross-cutting schema behavior applied to every model:
 *  - timestamps (createdAt / updatedAt)
 *  - soft delete via `deletedAt` + automatic exclusion from find queries
 *  - audit fields (`createdBy` / `updatedBy`)
 *  - clean JSON output (id instead of _id, no __v)
 *
 * Usage: `schema.plugin(basePlugin)` (before compiling the model).
 */
export function basePlugin(schema: Schema): void {
  schema.add({
    deletedAt: { type: Date, default: null, index: true },
    createdBy: { type: "ObjectId", ref: "User", default: null },
    updatedBy: { type: "ObjectId", ref: "User", default: null },
  });

  schema.set("timestamps", true);

  schema.virtual("isDeleted").get(function (this: { deletedAt: Date | null }) {
    return this.deletedAt != null;
  });

  // Soft delete instance helper.
  schema.method("softDelete", function (this: { deletedAt: Date | null; save: () => Promise<unknown> }, actor?: string) {
    this.deletedAt = new Date();
    if (actor) (this as Record<string, unknown>).updatedBy = actor;
    return this.save();
  });

  // Exclude soft-deleted docs by default. Pass `{ withDeleted: true }` in
  // query options to bypass (used by admin/audit views).
  const excludeDeleted = function (this: {
    getOptions: () => Record<string, unknown>;
    getQuery: () => Record<string, unknown>;
    where: (c: Record<string, unknown>) => unknown;
  }) {
    if (this.getOptions().withDeleted) return;
    const q = this.getQuery();
    if (q.deletedAt === undefined) this.where({ deletedAt: null });
  };

  for (const hook of ["find", "findOne", "findOneAndUpdate", "countDocuments", "count"] as const) {
    schema.pre(hook, excludeDeleted);
  }

  schema.set("toJSON", {
    virtuals: true,
    versionKey: false,
    transform(_doc, ret: Record<string, unknown>) {
      ret.id = ret._id;
      delete ret._id;
      return ret;
    },
  });
  schema.set("toObject", { virtuals: true, versionKey: false });
}
