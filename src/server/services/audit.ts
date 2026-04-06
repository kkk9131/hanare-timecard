import { db, schema } from "../db/client.js";

export interface AuditLogInput {
  actorId: number | null;
  action: string;
  entityType: string;
  entityId: number | null;
  before: unknown;
  after: unknown;
  occurredAt?: number;
}

/**
 * Insert an immutable audit_logs row. before/after are JSON-serialised
 * (null when there is no value to record).
 */
export function writeAuditLog(input: AuditLogInput): void {
  db.insert(schema.auditLogs)
    .values({
      actorId: input.actorId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      beforeJson: input.before == null ? null : JSON.stringify(input.before),
      afterJson: input.after == null ? null : JSON.stringify(input.after),
      occurredAt: input.occurredAt ?? Date.now(),
    })
    .run();
}
