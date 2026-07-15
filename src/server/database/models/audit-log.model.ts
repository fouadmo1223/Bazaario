import { Schema, model, models, type Model, type InferSchemaType, type HydratedDocument, type Types } from "mongoose";

/**
 * Append-only audit trail. Not soft-deletable (no basePlugin) — audit records
 * must be immutable. TTL is intentionally absent; retention is a platform policy.
 */
const auditLogSchema = new Schema(
  {
    actor: { type: Schema.Types.ObjectId, ref: "User", default: null, index: true },
    market: { type: Schema.Types.ObjectId, ref: "Market", default: null, index: true },
    action: { type: String, required: true, index: true }, // e.g. "market.create"
    entity: { type: String, required: true }, // e.g. "Market"
    entityId: { type: String, default: null },
    diff: { type: Schema.Types.Mixed, default: null },
    ip: { type: String, default: null },
    userAgent: { type: String, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

auditLogSchema.index({ market: 1, createdAt: -1 });
auditLogSchema.index({ entity: 1, entityId: 1 });

export type AuditLogRaw = InferSchemaType<typeof auditLogSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
};
export type AuditLogDoc = HydratedDocument<AuditLogRaw>;

export const AuditLog: Model<AuditLogRaw> =
  (models.AuditLog as Model<AuditLogRaw>) ?? model<AuditLogRaw>("AuditLog", auditLogSchema);
