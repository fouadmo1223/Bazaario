import { connectToDatabase } from "@/server/database/connection";
import { AuditLog } from "@/server/database/models/audit-log.model";
import { logger } from "@/shared/lib/logger";

export type AuditEntry = {
  actor?: string | null;
  vendor?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  diff?: unknown;
  ip?: string | null;
  userAgent?: string | null;
};

/**
 * Record an audit event. Fire-and-forget friendly: failures are logged but
 * never throw into the caller's business flow.
 */
export async function writeAudit(entry: AuditEntry): Promise<void> {
  try {
    await connectToDatabase();
    await AuditLog.create({
      actor: entry.actor ?? null,
      vendor: entry.vendor ?? null,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId ?? null,
      diff: entry.diff ?? null,
      ip: entry.ip ?? null,
      userAgent: entry.userAgent ?? null,
    });
  } catch (err) {
    logger.error({ err, action: entry.action }, "Failed to write audit log");
  }
}
