import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import { db, schema } from "../db/client.js";

export type ShiftStatus = "draft" | "published";
export type ShiftPreference = "available" | "preferred" | "unavailable";

export interface ShiftRow {
  id: number;
  employee_id: number;
  store_id: number;
  date: string;
  start_time: string;
  end_time: string;
  status: ShiftStatus;
  created_by: number;
  created_at: number;
  updated_at: number;
}

export interface ShiftRequestRow {
  id: number;
  employee_id: number;
  date: string;
  start_time: string | null;
  end_time: string | null;
  preference: ShiftPreference;
  note: string | null;
  submitted_at: number;
}

export interface CreateShiftInput {
  employee_id: number;
  store_id: number;
  date: string;
  start_time: string;
  end_time: string;
  created_by: number;
}

export interface UpdateShiftInput {
  employee_id?: number;
  store_id?: number;
  date?: string;
  start_time?: string;
  end_time?: string;
  status?: ShiftStatus;
}

export interface ListShiftsQuery {
  store_id?: number;
  store_ids?: number[];
  employee_id?: number;
  from?: string;
  to?: string;
  status?: ShiftStatus;
}

export type ShiftServiceError =
  | { kind: "not_found" }
  | { kind: "conflict"; conflicting: ShiftRow[] }
  | { kind: "invalid"; message: string };

function rowToShift(r: typeof schema.shifts.$inferSelect): ShiftRow {
  return {
    id: r.id,
    employee_id: r.employeeId,
    store_id: r.storeId,
    date: r.date,
    start_time: r.startTime,
    end_time: r.endTime,
    status: r.status as ShiftStatus,
    created_by: r.createdBy,
    created_at: r.createdAt,
    updated_at: r.updatedAt,
  };
}

function rowToShiftRequest(r: typeof schema.shiftRequests.$inferSelect): ShiftRequestRow {
  return {
    id: r.id,
    employee_id: r.employeeId,
    date: r.date,
    start_time: r.startTime,
    end_time: r.endTime,
    preference: r.preference as ShiftPreference,
    note: r.note,
    submitted_at: r.submittedAt,
  };
}

/**
 * Find existing shifts that overlap a candidate time slot for the same
 * employee on the same date. Two intervals [a1, a2) and [b1, b2) overlap
 * iff a1 < b2 && b1 < a2.
 *
 * Pass `excludeShiftId` to ignore the row currently being edited.
 */
export function findConflicts(
  employeeId: number,
  date: string,
  startTime: string,
  endTime: string,
  excludeShiftId?: number,
): ShiftRow[] {
  const sameDay = db
    .select()
    .from(schema.shifts)
    .where(and(eq(schema.shifts.employeeId, employeeId), eq(schema.shifts.date, date)))
    .all();
  return sameDay
    .filter((r) => (excludeShiftId == null ? true : r.id !== excludeShiftId))
    .filter((r) => startTime < r.endTime && r.startTime < endTime)
    .map(rowToShift);
}

function recordAudit(
  actorId: number | null,
  action: string,
  entityId: number,
  before: unknown,
  after: unknown,
  now: number,
): void {
  db.insert(schema.auditLogs)
    .values({
      actorId,
      action,
      entityType: "shift",
      entityId,
      beforeJson: before == null ? null : JSON.stringify(before),
      afterJson: after == null ? null : JSON.stringify(after),
      occurredAt: now,
    })
    .run();
}

function employeeBelongsToStore(employeeId: number, storeId: number): boolean {
  const row = db
    .select({ employeeId: schema.employeeStores.employeeId })
    .from(schema.employeeStores)
    .where(
      and(
        eq(schema.employeeStores.employeeId, employeeId),
        eq(schema.employeeStores.storeId, storeId),
      ),
    )
    .get();
  return row != null;
}

export function createShift(
  input: CreateShiftInput,
  now: number = Date.now(),
): { kind: "ok"; shift: ShiftRow } | ShiftServiceError {
  if (input.start_time >= input.end_time) {
    return { kind: "invalid", message: "start_time must be before end_time" };
  }
  if (!employeeBelongsToStore(input.employee_id, input.store_id)) {
    return { kind: "invalid", message: "employee does not belong to store" };
  }
  const conflicts = findConflicts(input.employee_id, input.date, input.start_time, input.end_time);
  if (conflicts.length > 0) {
    return { kind: "conflict", conflicting: conflicts };
  }

  const inserted = db
    .insert(schema.shifts)
    .values({
      employeeId: input.employee_id,
      storeId: input.store_id,
      date: input.date,
      startTime: input.start_time,
      endTime: input.end_time,
      status: "draft",
      createdBy: input.created_by,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();

  const shift = rowToShift(inserted);
  recordAudit(input.created_by, "shift.create", shift.id, null, shift, now);
  return { kind: "ok", shift };
}

export function updateShift(
  shiftId: number,
  patch: UpdateShiftInput,
  actorId: number,
  now: number = Date.now(),
): { kind: "ok"; shift: ShiftRow } | ShiftServiceError {
  const existing = db.select().from(schema.shifts).where(eq(schema.shifts.id, shiftId)).get();
  if (!existing) return { kind: "not_found" };
  const before = rowToShift(existing);

  const next: ShiftRow = {
    ...before,
    employee_id: patch.employee_id ?? before.employee_id,
    store_id: patch.store_id ?? before.store_id,
    date: patch.date ?? before.date,
    start_time: patch.start_time ?? before.start_time,
    end_time: patch.end_time ?? before.end_time,
    status: patch.status ?? before.status,
    updated_at: now,
  };

  if (next.start_time >= next.end_time) {
    return { kind: "invalid", message: "start_time must be before end_time" };
  }
  if (!employeeBelongsToStore(next.employee_id, next.store_id)) {
    return { kind: "invalid", message: "employee does not belong to store" };
  }

  const conflicts = findConflicts(
    next.employee_id,
    next.date,
    next.start_time,
    next.end_time,
    shiftId,
  );
  if (conflicts.length > 0) {
    return { kind: "conflict", conflicting: conflicts };
  }

  db.update(schema.shifts)
    .set({
      employeeId: next.employee_id,
      storeId: next.store_id,
      date: next.date,
      startTime: next.start_time,
      endTime: next.end_time,
      status: next.status,
      updatedAt: now,
    })
    .where(eq(schema.shifts.id, shiftId))
    .run();

  recordAudit(actorId, "shift.update", shiftId, before, next, now);
  return { kind: "ok", shift: next };
}

export function deleteShift(
  shiftId: number,
  actorId: number,
  now: number = Date.now(),
): { kind: "ok" } | ShiftServiceError {
  const existing = db.select().from(schema.shifts).where(eq(schema.shifts.id, shiftId)).get();
  if (!existing) return { kind: "not_found" };
  if (existing.status !== "draft") {
    return { kind: "invalid", message: "only draft shifts can be deleted" };
  }
  const before = rowToShift(existing);
  db.delete(schema.shifts).where(eq(schema.shifts.id, shiftId)).run();
  recordAudit(actorId, "shift.delete", shiftId, before, null, now);
  return { kind: "ok" };
}

export function publishShift(
  shiftId: number,
  actorId: number,
  now: number = Date.now(),
): { kind: "ok"; shift: ShiftRow } | ShiftServiceError {
  const existing = db.select().from(schema.shifts).where(eq(schema.shifts.id, shiftId)).get();
  if (!existing) return { kind: "not_found" };
  if (existing.status === "published") {
    return { kind: "ok", shift: rowToShift(existing) };
  }
  const before = rowToShift(existing);
  db.update(schema.shifts)
    .set({ status: "published", updatedAt: now })
    .where(eq(schema.shifts.id, shiftId))
    .run();
  const after: ShiftRow = { ...before, status: "published", updated_at: now };
  recordAudit(actorId, "shift.publish", shiftId, before, after, now);
  return { kind: "ok", shift: after };
}

/**
 * Range publish: flip every draft shift in the [from, to] window for a store.
 */
export function publishShifts(
  storeId: number,
  from: string,
  to: string,
  actorId: number,
  now: number = Date.now(),
): { published: number; ids: number[] } {
  const drafts = db
    .select()
    .from(schema.shifts)
    .where(
      and(
        eq(schema.shifts.storeId, storeId),
        eq(schema.shifts.status, "draft"),
        gte(schema.shifts.date, from),
        lte(schema.shifts.date, to),
      ),
    )
    .all();

  const ids: number[] = [];
  for (const d of drafts) {
    const before = rowToShift(d);
    db.update(schema.shifts)
      .set({ status: "published", updatedAt: now })
      .where(eq(schema.shifts.id, d.id))
      .run();
    const after: ShiftRow = { ...before, status: "published", updated_at: now };
    recordAudit(actorId, "shift.publish", d.id, before, after, now);
    ids.push(d.id);
  }
  return { published: ids.length, ids };
}

export function getShift(shiftId: number): ShiftRow | null {
  const r = db.select().from(schema.shifts).where(eq(schema.shifts.id, shiftId)).get();
  return r ? rowToShift(r) : null;
}

export function listShifts(query: ListShiftsQuery): ShiftRow[] {
  const conditions = [];
  if (query.store_id != null) conditions.push(eq(schema.shifts.storeId, query.store_id));
  if (query.store_ids != null) {
    if (query.store_ids.length === 0) return [];
    conditions.push(inArray(schema.shifts.storeId, query.store_ids));
  }
  if (query.employee_id != null) conditions.push(eq(schema.shifts.employeeId, query.employee_id));
  if (query.from != null) conditions.push(gte(schema.shifts.date, query.from));
  if (query.to != null) conditions.push(lte(schema.shifts.date, query.to));
  if (query.status != null) conditions.push(eq(schema.shifts.status, query.status));

  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const rows = where
    ? db
        .select()
        .from(schema.shifts)
        .where(where)
        .orderBy(asc(schema.shifts.date), asc(schema.shifts.startTime))
        .all()
    : db
        .select()
        .from(schema.shifts)
        .orderBy(asc(schema.shifts.date), asc(schema.shifts.startTime))
        .all();

  return rows.map(rowToShift);
}

export interface ConflictReport {
  duplicates: Array<{
    employee_id: number;
    date: string;
    shift_ids: number[];
  }>;
  understaffed: Array<{ date: string; assigned: number }>;
}

/**
 * Detect intra-employee duplicate shifts and understaffed days within a range.
 * Understaffed = day with zero assigned shifts.
 */
export function detectConflicts(storeId: number, from: string, to: string): ConflictReport {
  const rows = db
    .select()
    .from(schema.shifts)
    .where(
      and(
        eq(schema.shifts.storeId, storeId),
        gte(schema.shifts.date, from),
        lte(schema.shifts.date, to),
      ),
    )
    .all();

  // Group by (employee, date) for overlap detection
  const byEmpDate = new Map<string, ShiftRow[]>();
  for (const r of rows) {
    const s = rowToShift(r);
    const key = `${s.employee_id}#${s.date}`;
    const arr = byEmpDate.get(key) ?? [];
    arr.push(s);
    byEmpDate.set(key, arr);
  }

  const duplicates: ConflictReport["duplicates"] = [];
  for (const [key, list] of byEmpDate) {
    if (list.length < 2) continue;
    // detect any pair overlap
    let overlap = false;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        if (a == null || b == null) continue;
        if (a.start_time < b.end_time && b.start_time < a.end_time) {
          overlap = true;
          break;
        }
      }
      if (overlap) break;
    }
    if (overlap) {
      const [empStr, date] = key.split("#");
      duplicates.push({
        employee_id: Number(empStr),
        date: date ?? "",
        shift_ids: list.map((s) => s.id),
      });
    }
  }

  // Understaffed: any date in [from, to] with zero shifts
  const assignedByDate = new Map<string, number>();
  for (const r of rows) {
    assignedByDate.set(r.date, (assignedByDate.get(r.date) ?? 0) + 1);
  }
  const understaffed: ConflictReport["understaffed"] = [];
  for (const date of enumerateDates(from, to)) {
    const count = assignedByDate.get(date) ?? 0;
    if (count < 1) understaffed.push({ date, assigned: count });
  }

  return { duplicates, understaffed };
}

function enumerateDates(from: string, to: string): string[] {
  const out: string[] = [];
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return out;
  const cur = new Date(start);
  while (cur.getTime() <= end.getTime()) {
    const y = cur.getUTCFullYear();
    const m = String(cur.getUTCMonth() + 1).padStart(2, "0");
    const d = String(cur.getUTCDate()).padStart(2, "0");
    out.push(`${y}-${m}-${d}`);
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

// ----- Shift Requests -----

export interface CreateShiftRequestInput {
  employee_id: number;
  date: string;
  start_time?: string | null;
  end_time?: string | null;
  preference: ShiftPreference;
  note?: string;
}

export function createShiftRequest(
  input: CreateShiftRequestInput,
  now: number = Date.now(),
): ShiftRequestRow {
  const inserted = db
    .insert(schema.shiftRequests)
    .values({
      employeeId: input.employee_id,
      date: input.date,
      startTime: input.start_time ?? null,
      endTime: input.end_time ?? null,
      preference: input.preference,
      note: input.note ?? null,
      submittedAt: now,
    })
    .returning()
    .get();
  return rowToShiftRequest(inserted);
}

export function listShiftRequests(query: {
  from?: string;
  to?: string;
  employee_id?: number;
  employee_ids?: number[];
  store_ids?: number[];
}): ShiftRequestRow[] {
  const conds = [];
  if (query.from != null) conds.push(gte(schema.shiftRequests.date, query.from));
  if (query.to != null) conds.push(lte(schema.shiftRequests.date, query.to));
  if (query.employee_id != null) conds.push(eq(schema.shiftRequests.employeeId, query.employee_id));
  if (query.employee_ids != null) {
    if (query.employee_ids.length === 0) return [];
    conds.push(inArray(schema.shiftRequests.employeeId, query.employee_ids));
  }
  if (query.store_ids != null) {
    if (query.store_ids.length === 0) return [];
    const empIds = db
      .select({ id: schema.employeeStores.employeeId })
      .from(schema.employeeStores)
      .where(inArray(schema.employeeStores.storeId, query.store_ids))
      .all()
      .map((r) => r.id);
    if (empIds.length === 0) return [];
    conds.push(inArray(schema.shiftRequests.employeeId, empIds));
  }
  const where = conds.length > 0 ? and(...conds) : undefined;
  const rows = where
    ? db
        .select()
        .from(schema.shiftRequests)
        .where(where)
        .orderBy(asc(schema.shiftRequests.date))
        .all()
    : db.select().from(schema.shiftRequests).orderBy(asc(schema.shiftRequests.date)).all();
  return rows.map(rowToShiftRequest);
}

export function getShiftRequest(id: number): ShiftRequestRow | null {
  const r = db.select().from(schema.shiftRequests).where(eq(schema.shiftRequests.id, id)).get();
  return r ? rowToShiftRequest(r) : null;
}

export function deleteShiftRequest(id: number): boolean {
  const existing = db
    .select()
    .from(schema.shiftRequests)
    .where(eq(schema.shiftRequests.id, id))
    .get();
  if (!existing) return false;
  db.delete(schema.shiftRequests).where(eq(schema.shiftRequests.id, id)).run();
  return true;
}
