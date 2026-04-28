import { and, desc, eq, gte, inArray, isNull, lte, or, type SQL } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import type { PunchType } from "../lib/time.js";
import { writeAuditLog } from "./audit.js";

export type CorrectionStatus = "pending" | "approved" | "rejected";

export interface CorrectionRow {
  id: number;
  employee_id: number;
  target_punch_id: number | null;
  target_date: string;
  requested_value: number | null;
  requested_type: PunchType | null;
  reason: string;
  status: CorrectionStatus;
  reviewer_id: number | null;
  reviewed_at: number | null;
  review_comment: string | null;
  created_at: number;
}

function toRow(r: typeof schema.correctionRequests.$inferSelect): CorrectionRow {
  return {
    id: r.id,
    employee_id: r.employeeId,
    target_punch_id: r.targetPunchId,
    target_date: r.targetDate,
    requested_value: r.requestedValue,
    requested_type: (r.requestedType as PunchType | null) ?? null,
    reason: r.reason,
    status: r.status as CorrectionStatus,
    reviewer_id: r.reviewerId,
    reviewed_at: r.reviewedAt,
    review_comment: r.reviewComment,
    created_at: r.createdAt,
  };
}

export interface CreateCorrectionInput {
  employee_id: number;
  target_punch_id?: number | null;
  target_date: string;
  requested_value?: number | null;
  requested_type?: PunchType | null;
  reason: string;
  now?: number;
}

export type CreateCorrectionResult =
  | { kind: "ok"; correction: CorrectionRow }
  | { kind: "forbidden"; reason: "not_owner" }
  | { kind: "not_found"; entity: "punch" };

/**
 * Create a pending correction request.
 * If target_punch_id is provided, the punch must belong to the requester (otherwise 403).
 */
export function createCorrection(input: CreateCorrectionInput): CreateCorrectionResult {
  if (input.target_punch_id != null) {
    const punch = db
      .select()
      .from(schema.timePunches)
      .where(eq(schema.timePunches.id, input.target_punch_id))
      .get();
    if (!punch) return { kind: "not_found", entity: "punch" };
    if (punch.employeeId !== input.employee_id) {
      return { kind: "forbidden", reason: "not_owner" };
    }
  }

  const now = input.now ?? Date.now();
  const inserted = db
    .insert(schema.correctionRequests)
    .values({
      employeeId: input.employee_id,
      targetPunchId: input.target_punch_id ?? null,
      targetDate: input.target_date,
      requestedValue: input.requested_value ?? null,
      requestedType: input.requested_type ?? null,
      reason: input.reason,
      status: "pending",
      reviewerId: null,
      reviewedAt: null,
      reviewComment: null,
      createdAt: now,
    })
    .returning()
    .get();

  return { kind: "ok", correction: toRow(inserted) };
}

export interface ListCorrectionsQuery {
  status?: CorrectionStatus;
  store_id?: number;
  store_ids?: number[];
  employee_id?: number;
  /** unix ms inclusive */
  from?: number;
  /** unix ms inclusive */
  to?: number;
}

/**
 * List correction requests with optional filters.
 * When a request targets an existing punch, store scope follows the punch's store.
 * New-punch requests do not have an explicit store, so they keep the legacy
 * employee assignment scope.
 */
export function listCorrections(q: ListCorrectionsQuery): CorrectionRow[] {
  const conds: SQL[] = [];
  if (q.status != null) conds.push(eq(schema.correctionRequests.status, q.status));
  if (q.employee_id != null) conds.push(eq(schema.correctionRequests.employeeId, q.employee_id));
  if (q.from != null) conds.push(gte(schema.correctionRequests.createdAt, q.from));
  if (q.to != null) conds.push(lte(schema.correctionRequests.createdAt, q.to));

  const scopedStoreIds =
    q.store_ids != null ? q.store_ids : q.store_id != null ? [q.store_id] : undefined;
  if (scopedStoreIds != null) {
    if (scopedStoreIds.length === 0) return [];
    const empIds = db
      .select({ id: schema.employeeStores.employeeId })
      .from(schema.employeeStores)
      .where(inArray(schema.employeeStores.storeId, scopedStoreIds))
      .all()
      .map((r) => r.id);
    const punchIds = db
      .select({ id: schema.timePunches.id })
      .from(schema.timePunches)
      .where(inArray(schema.timePunches.storeId, scopedStoreIds))
      .all()
      .map((r) => r.id);

    const storeConds: SQL[] = [];
    if (punchIds.length > 0) {
      storeConds.push(inArray(schema.correctionRequests.targetPunchId, punchIds));
    }
    if (empIds.length > 0) {
      const newPunchRequestCond = and(
        isNull(schema.correctionRequests.targetPunchId),
        inArray(schema.correctionRequests.employeeId, empIds),
      );
      if (newPunchRequestCond != null) storeConds.push(newPunchRequestCond);
    }
    if (storeConds.length === 0) return [];
    const storeCond = storeConds.length === 1 ? storeConds[0] : or(...storeConds);
    if (storeCond == null) return [];
    conds.push(storeCond);
  }

  const where = conds.length === 0 ? undefined : conds.length === 1 ? conds[0] : and(...conds);

  const rows = db
    .select()
    .from(schema.correctionRequests)
    .where(where)
    .orderBy(desc(schema.correctionRequests.createdAt))
    .all();

  return rows.map(toRow);
}

export function getCorrection(id: number): CorrectionRow | null {
  const r = db
    .select()
    .from(schema.correctionRequests)
    .where(eq(schema.correctionRequests.id, id))
    .get();
  return r ? toRow(r) : null;
}

export interface ApproveCorrectionInput {
  correction_id: number;
  reviewer_id: number;
  comment?: string;
  now?: number;
}

export type ApproveCorrectionResult =
  | { kind: "ok"; correction: CorrectionRow }
  | { kind: "not_found" }
  | { kind: "invalid_state"; current: CorrectionStatus }
  | { kind: "missing_value" };

/**
 * Approve a pending correction:
 * - If target_punch_id is set, update the punch (punched_at / punch_type) and record before/after.
 * - If not, insert a new punch using target_date + requested_value (+ requested_type).
 * - Mark correction approved with reviewer / reviewed_at / comment.
 * - Always write an audit_logs row.
 */
export function approveCorrection(input: ApproveCorrectionInput): ApproveCorrectionResult {
  const now = input.now ?? Date.now();

  const existing = db
    .select()
    .from(schema.correctionRequests)
    .where(eq(schema.correctionRequests.id, input.correction_id))
    .get();
  if (!existing) return { kind: "not_found" };
  if (existing.status !== "pending") {
    return {
      kind: "invalid_state",
      current: existing.status as CorrectionStatus,
    };
  }
  if (existing.requestedValue == null) {
    return { kind: "missing_value" };
  }

  let beforePunch: typeof schema.timePunches.$inferSelect | null = null;
  let afterPunch: typeof schema.timePunches.$inferSelect | null = null;

  if (existing.targetPunchId != null) {
    beforePunch =
      db
        .select()
        .from(schema.timePunches)
        .where(eq(schema.timePunches.id, existing.targetPunchId))
        .get() ?? null;

    if (!beforePunch) {
      // Original punch was deleted; treat as missing.
      return { kind: "not_found" };
    }

    const newType =
      (existing.requestedType as PunchType | null) ?? (beforePunch.punchType as PunchType);
    const noteParts = [beforePunch.note, `correction#${existing.id}`].filter(
      (s): s is string => typeof s === "string" && s.length > 0,
    );

    afterPunch = db
      .update(schema.timePunches)
      .set({
        punchedAt: existing.requestedValue,
        punchType: newType,
        source: "correction",
        note: noteParts.join(" / "),
      })
      .where(eq(schema.timePunches.id, existing.targetPunchId))
      .returning()
      .get();
  } else {
    if (existing.requestedType == null) {
      return { kind: "missing_value" };
    }
    // Need a store to attach. Use the requester's primary store, fall back to any assigned store.
    const empStores = db
      .select()
      .from(schema.employeeStores)
      .where(eq(schema.employeeStores.employeeId, existing.employeeId))
      .all();
    if (empStores.length === 0) {
      return { kind: "missing_value" };
    }
    const storeRow = empStores.find((s) => s.isPrimary === 1) ?? empStores[0];

    afterPunch = db
      .insert(schema.timePunches)
      .values({
        employeeId: existing.employeeId,
        storeId: storeRow.storeId,
        punchType: existing.requestedType,
        punchedAt: existing.requestedValue,
        source: "correction",
        note: `correction#${existing.id}`,
        createdAt: now,
      })
      .returning()
      .get();
  }

  const updated = db
    .update(schema.correctionRequests)
    .set({
      status: "approved",
      reviewerId: input.reviewer_id,
      reviewedAt: now,
      reviewComment: input.comment ?? null,
    })
    .where(eq(schema.correctionRequests.id, input.correction_id))
    .returning()
    .get();

  writeAuditLog({
    actorId: input.reviewer_id,
    action: "correction.approve",
    entityType: "time_punch",
    entityId: afterPunch?.id ?? null,
    before: beforePunch
      ? {
          id: beforePunch.id,
          punch_type: beforePunch.punchType,
          punched_at: beforePunch.punchedAt,
          source: beforePunch.source,
          note: beforePunch.note,
        }
      : null,
    after: afterPunch
      ? {
          id: afterPunch.id,
          punch_type: afterPunch.punchType,
          punched_at: afterPunch.punchedAt,
          source: afterPunch.source,
          note: afterPunch.note,
        }
      : null,
    occurredAt: now,
  });

  return { kind: "ok", correction: toRow(updated) };
}

export interface RejectCorrectionInput {
  correction_id: number;
  reviewer_id: number;
  comment: string;
  now?: number;
}

export type RejectCorrectionResult =
  | { kind: "ok"; correction: CorrectionRow }
  | { kind: "not_found" }
  | { kind: "invalid_state"; current: CorrectionStatus };

/**
 * Reject a pending correction. review_comment is required.
 */
export function rejectCorrection(input: RejectCorrectionInput): RejectCorrectionResult {
  const now = input.now ?? Date.now();

  const existing = db
    .select()
    .from(schema.correctionRequests)
    .where(eq(schema.correctionRequests.id, input.correction_id))
    .get();
  if (!existing) return { kind: "not_found" };
  if (existing.status !== "pending") {
    return {
      kind: "invalid_state",
      current: existing.status as CorrectionStatus,
    };
  }

  const updated = db
    .update(schema.correctionRequests)
    .set({
      status: "rejected",
      reviewerId: input.reviewer_id,
      reviewedAt: now,
      reviewComment: input.comment,
    })
    .where(eq(schema.correctionRequests.id, input.correction_id))
    .returning()
    .get();

  writeAuditLog({
    actorId: input.reviewer_id,
    action: "correction.reject",
    entityType: "correction_request",
    entityId: existing.id,
    before: { status: existing.status },
    after: { status: "rejected", review_comment: input.comment },
    occurredAt: now,
  });

  return { kind: "ok", correction: toRow(updated) };
}
