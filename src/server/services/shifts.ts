import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import { db, schema } from "../db/client.js";

export type ShiftStatus = "draft" | "published";
export type ShiftPreference = "available" | "preferred" | "unavailable";
export type ShiftPeriodStatus = "open" | "closed";

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
  period_id: number | null;
  store_id: number | null;
  date: string;
  start_time: string | null;
  end_time: string | null;
  preference: ShiftPreference;
  note: string | null;
  submitted_at: number;
}

export interface ShiftPeriodRow {
  id: number;
  store_id: number;
  name: string;
  target_from: string;
  target_to: string;
  submission_from: string;
  submission_to: string;
  status: ShiftPeriodStatus;
  created_by: number;
  created_at: number;
  updated_at: number;
}

export interface ShiftRequirementSlotRow {
  id: number;
  period_id: number;
  store_id: number;
  date: string;
  slot_name: string;
  start_time: string;
  end_time: string;
  required_count: number;
  source: string;
  created_at: number;
}

export interface ShiftMonthlySettingRow {
  id: number;
  store_id: number;
  month: number;
  slot_name: string;
  weekday_required_count: number;
  holiday_required_count: number;
  busy_required_count: number;
  busy_from_day: number | null;
  busy_to_day: number | null;
  created_at: number;
  updated_at: number;
  updated_by: number | null;
}

export interface ShiftMonthlySettingInput {
  month: number;
  slot_name: string;
  weekday_required_count: number;
  holiday_required_count: number;
  busy_required_count: number;
  busy_from_day?: number | null;
  busy_to_day?: number | null;
}

export interface ShiftRequirementRuleInput {
  slot_name: string;
  start_time: string;
  end_time: string;
  required_count: number;
  weekdays?: number[];
  include_holidays?: boolean;
  busy_from?: string;
  busy_to?: string;
  busy_required_count?: number;
}

export interface CreateShiftPeriodInput {
  store_id: number;
  name?: string;
  target_from: string;
  target_to: string;
  submission_from: string;
  submission_to: string;
  rules?: ShiftRequirementRuleInput[];
  created_by: number;
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
  | { kind: "conflict"; conflicting?: ShiftRow[] }
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
    period_id: r.periodId,
    store_id: r.storeId,
    date: r.date,
    start_time: r.startTime,
    end_time: r.endTime,
    preference: r.preference as ShiftPreference,
    note: r.note,
    submitted_at: r.submittedAt,
  };
}

function rowToShiftPeriod(r: typeof schema.shiftRecruitmentPeriods.$inferSelect): ShiftPeriodRow {
  return {
    id: r.id,
    store_id: r.storeId,
    name: r.name,
    target_from: r.targetFrom,
    target_to: r.targetTo,
    submission_from: r.submissionFrom,
    submission_to: r.submissionTo,
    status: r.status as ShiftPeriodStatus,
    created_by: r.createdBy,
    created_at: r.createdAt,
    updated_at: r.updatedAt,
  };
}

function rowToShiftRequirementSlot(
  r: typeof schema.shiftRequirementSlots.$inferSelect,
): ShiftRequirementSlotRow {
  return {
    id: r.id,
    period_id: r.periodId,
    store_id: r.storeId,
    date: r.date,
    slot_name: r.slotName,
    start_time: r.startTime,
    end_time: r.endTime,
    required_count: r.requiredCount,
    source: r.source,
    created_at: r.createdAt,
  };
}

function rowToShiftMonthlySetting(
  r: typeof schema.shiftMonthlySettings.$inferSelect,
): ShiftMonthlySettingRow {
  return {
    id: r.id,
    store_id: r.storeId,
    month: r.month,
    slot_name: r.slotName,
    weekday_required_count: r.weekdayRequiredCount,
    holiday_required_count: r.holidayRequiredCount,
    busy_required_count: r.busyRequiredCount,
    busy_from_day: r.busyFromDay,
    busy_to_day: r.busyToDay,
    created_at: r.createdAt,
    updated_at: r.updatedAt,
    updated_by: r.updatedBy,
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
  entityType = "shift",
): void {
  db.insert(schema.auditLogs)
    .values({
      actorId,
      action,
      entityType,
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

export function todayYmd(now: number = Date.now()): string {
  return new Date(now + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function dateToUtcParts(date: string): {
  year: number;
  month: number;
  day: number;
  weekday: number;
} {
  const d = new Date(`${date}T00:00:00Z`);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    weekday: d.getUTCDay(),
  };
}

function nthWeekdayOfMonth(year: number, month: number, weekday: number, nth: number): number {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const firstWeekday = first.getUTCDay();
  return 1 + ((weekday - firstWeekday + 7) % 7) + (nth - 1) * 7;
}

function springEquinoxDay(year: number): number {
  return Math.floor(20.8431 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
}

function autumnEquinoxDay(year: number): number {
  return Math.floor(23.2488 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
}

function rawJapaneseHolidayName(date: string): string | null {
  const { year, month, day } = dateToUtcParts(date);
  if (month === 1 && day === 1) return "元日";
  if (month === 1 && day === nthWeekdayOfMonth(year, 1, 1, 2)) return "成人の日";
  if (month === 2 && day === 11) return "建国記念の日";
  if (month === 2 && day === 23) return "天皇誕生日";
  if (month === 3 && day === springEquinoxDay(year)) return "春分の日";
  if (month === 4 && day === 29) return "昭和の日";
  if (month === 5 && day === 3) return "憲法記念日";
  if (month === 5 && day === 4) return "みどりの日";
  if (month === 5 && day === 5) return "こどもの日";
  if (month === 7 && day === nthWeekdayOfMonth(year, 7, 1, 3)) return "海の日";
  if (month === 8 && day === 11) return "山の日";
  if (month === 9 && day === nthWeekdayOfMonth(year, 9, 1, 3)) return "敬老の日";
  if (month === 9 && day === autumnEquinoxDay(year)) return "秋分の日";
  if (month === 10 && day === nthWeekdayOfMonth(year, 10, 1, 2)) return "スポーツの日";
  if (month === 11 && day === 3) return "文化の日";
  if (month === 11 && day === 23) return "勤労感謝の日";
  return null;
}

export function isJapaneseHoliday(date: string): boolean {
  if (rawJapaneseHolidayName(date) != null) return true;
  const current = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(current.getTime())) return false;

  // 国民の休日: 祝日に挟まれた平日。
  const before = new Date(current);
  before.setUTCDate(before.getUTCDate() - 1);
  const after = new Date(current);
  after.setUTCDate(after.getUTCDate() + 1);
  if (
    rawJapaneseHolidayName(before.toISOString().slice(0, 10)) != null &&
    rawJapaneseHolidayName(after.toISOString().slice(0, 10)) != null
  ) {
    return true;
  }

  // 振替休日: 日曜に祝日がある場合、その後の最初の平日が休日。
  for (let i = 1; i <= 7; i++) {
    const prev = new Date(current);
    prev.setUTCDate(prev.getUTCDate() - i);
    const prevIso = prev.toISOString().slice(0, 10);
    const prevParts = dateToUtcParts(prevIso);
    if (prevParts.weekday !== 0 && rawJapaneseHolidayName(prevIso) == null) return false;
    if (prevParts.weekday === 0 && rawJapaneseHolidayName(prevIso) != null) return true;
  }
  return false;
}

function ruleAppliesToDate(rule: ShiftRequirementRuleInput, date: string): boolean {
  const { weekday } = dateToUtcParts(date);
  const holiday = isJapaneseHoliday(date);
  const matchesWeekday = rule.weekdays == null || rule.weekdays.includes(weekday);
  const matchesHoliday = rule.include_holidays === true && holiday;
  return matchesWeekday || matchesHoliday;
}

function requiredCountForDate(rule: ShiftRequirementRuleInput, date: string): number {
  if (
    rule.busy_from != null &&
    rule.busy_to != null &&
    rule.busy_required_count != null &&
    rule.busy_from <= date &&
    date <= rule.busy_to
  ) {
    return rule.busy_required_count;
  }
  return rule.required_count;
}

function dayOfMonth(date: string): number {
  return dateToUtcParts(date).day;
}

function monthlySettingToSlotValue(
  setting: ShiftMonthlySettingRow,
  store: typeof schema.stores.$inferSelect,
  period: ShiftPeriodRow,
  date: string,
  now: number,
) {
  const { weekday } = dateToUtcParts(date);
  const holiday = isJapaneseHoliday(date);
  const day = dayOfMonth(date);
  const busy =
    setting.busy_from_day != null &&
    setting.busy_to_day != null &&
    setting.busy_from_day <= day &&
    day <= setting.busy_to_day;
  const requiredCount = busy
    ? setting.busy_required_count
    : holiday || weekday === 0 || weekday === 6
      ? setting.holiday_required_count
      : setting.weekday_required_count;
  if (requiredCount <= 0) return null;
  return {
    periodId: period.id,
    storeId: period.store_id,
    date,
    slotName: `${setting.slot_name}${busy ? " 繁忙" : holiday || weekday === 0 || weekday === 6 ? " 土日祝" : " 平日"}`,
    startTime: store.openingTime,
    endTime: store.closingTime,
    requiredCount,
    source: busy ? "busy" : holiday ? "holiday" : "monthly",
    createdAt: now,
  };
}

function requestCoversSlot(request: ShiftRequestRow, slot: ShiftRequirementSlotRow): boolean {
  if (request.date !== slot.date) return false;
  if (request.preference === "unavailable") return false;
  if (request.start_time == null && request.end_time == null) return true;
  if (request.start_time == null || request.end_time == null) return false;
  return request.start_time <= slot.start_time && request.end_time >= slot.end_time;
}

function requestBlocksSlot(request: ShiftRequestRow, slot: ShiftRequirementSlotRow): boolean {
  if (request.date !== slot.date || request.preference !== "unavailable") return false;
  if (request.start_time == null && request.end_time == null) return true;
  if (request.start_time == null || request.end_time == null) return false;
  return request.start_time < slot.end_time && slot.start_time < request.end_time;
}

// ----- Shift Recruitment Periods -----

export function createShiftPeriod(
  input: CreateShiftPeriodInput,
  now: number = Date.now(),
): { kind: "ok"; period: ShiftPeriodRow; slots: ShiftRequirementSlotRow[] } | ShiftServiceError {
  const store = db.select().from(schema.stores).where(eq(schema.stores.id, input.store_id)).get();
  if (!store) return { kind: "not_found" };

  for (const rule of input.rules ?? []) {
    if (rule.start_time >= rule.end_time) {
      return { kind: "invalid", message: "start_time must be before end_time" };
    }
  }

  const overlappingOpen = db
    .select({ id: schema.shiftRecruitmentPeriods.id })
    .from(schema.shiftRecruitmentPeriods)
    .where(
      and(
        eq(schema.shiftRecruitmentPeriods.storeId, input.store_id),
        eq(schema.shiftRecruitmentPeriods.status, "open"),
        lte(schema.shiftRecruitmentPeriods.targetFrom, input.target_to),
        gte(schema.shiftRecruitmentPeriods.targetTo, input.target_from),
      ),
    )
    .get();
  if (overlappingOpen) return { kind: "conflict" };

  const periodRow = db
    .insert(schema.shiftRecruitmentPeriods)
    .values({
      storeId: input.store_id,
      name: input.name ?? `${input.target_from}〜${input.target_to} シフト募集`,
      targetFrom: input.target_from,
      targetTo: input.target_to,
      submissionFrom: input.submission_from,
      submissionTo: input.submission_to,
      status: "open",
      createdBy: input.created_by,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();

  const period = rowToShiftPeriod(periodRow);
  const values = [];
  const monthlySettings = listShiftMonthlySettings(period.store_id);
  for (const date of enumerateDates(period.target_from, period.target_to)) {
    const month = dateToUtcParts(date).month;
    const monthly = monthlySettings.find((s) => s.month === month);
    if (monthly && (input.rules == null || input.rules.length === 0)) {
      const value = monthlySettingToSlotValue(monthly, store, period, date, now);
      if (value) values.push(value);
      continue;
    }
    for (const rule of input.rules ?? []) {
      if (!ruleAppliesToDate(rule, date)) continue;
      const requiredCount = requiredCountForDate(rule, date);
      if (requiredCount <= 0) continue;
      values.push({
        periodId: period.id,
        storeId: period.store_id,
        date,
        slotName: rule.slot_name,
        startTime: rule.start_time,
        endTime: rule.end_time,
        requiredCount,
        source:
          rule.busy_from != null &&
          rule.busy_to != null &&
          rule.busy_from <= date &&
          date <= rule.busy_to
            ? "busy"
            : isJapaneseHoliday(date)
              ? "holiday"
              : "rule",
        createdAt: now,
      });
    }
  }

  const insertedSlots =
    values.length > 0
      ? db.insert(schema.shiftRequirementSlots).values(values).returning().all()
      : [];
  recordAudit(
    input.created_by,
    "shift_period.create",
    period.id,
    null,
    period,
    now,
    "shift_period",
  );
  return { kind: "ok", period, slots: insertedSlots.map(rowToShiftRequirementSlot) };
}

export function defaultShiftMonthlySettings(
  storeId: number,
  now: number = Date.now(),
): ShiftMonthlySettingRow[] {
  return Array.from({ length: 12 }, (_, i) => {
    const month = i + 1;
    return {
      id: 0,
      store_id: storeId,
      month,
      slot_name: "基本枠",
      weekday_required_count: 2,
      holiday_required_count: 3,
      busy_required_count: 4,
      busy_from_day: null,
      busy_to_day: null,
      created_at: now,
      updated_at: now,
      updated_by: null,
    };
  });
}

export function listShiftMonthlySettings(storeId: number): ShiftMonthlySettingRow[] {
  const rows = db
    .select()
    .from(schema.shiftMonthlySettings)
    .where(eq(schema.shiftMonthlySettings.storeId, storeId))
    .orderBy(asc(schema.shiftMonthlySettings.month))
    .all()
    .map(rowToShiftMonthlySetting);
  const byMonth = new Map(rows.map((r) => [r.month, r]));
  return defaultShiftMonthlySettings(storeId).map(
    (fallback) => byMonth.get(fallback.month) ?? fallback,
  );
}

export function upsertShiftMonthlySettings(
  storeId: number,
  settings: ShiftMonthlySettingInput[],
  actorId: number,
  now: number = Date.now(),
): { kind: "ok"; settings: ShiftMonthlySettingRow[] } | ShiftServiceError {
  const store = db.select().from(schema.stores).where(eq(schema.stores.id, storeId)).get();
  if (!store) return { kind: "not_found" };

  for (const s of settings) {
    if (
      (s.busy_from_day == null && s.busy_to_day != null) ||
      (s.busy_from_day != null && s.busy_to_day == null) ||
      (s.busy_from_day != null && s.busy_to_day != null && s.busy_from_day > s.busy_to_day)
    ) {
      return { kind: "invalid", message: "busy days must be empty or ordered" };
    }
  }

  db.transaction(() => {
    for (const s of settings) {
      const existing = db
        .select()
        .from(schema.shiftMonthlySettings)
        .where(
          and(
            eq(schema.shiftMonthlySettings.storeId, storeId),
            eq(schema.shiftMonthlySettings.month, s.month),
          ),
        )
        .get();
      const values = {
        storeId,
        month: s.month,
        slotName: s.slot_name,
        weekdayRequiredCount: s.weekday_required_count,
        holidayRequiredCount: s.holiday_required_count,
        busyRequiredCount: s.busy_required_count,
        busyFromDay: s.busy_from_day ?? null,
        busyToDay: s.busy_to_day ?? null,
        updatedAt: now,
        updatedBy: actorId,
      };
      if (existing) {
        db.update(schema.shiftMonthlySettings)
          .set(values)
          .where(eq(schema.shiftMonthlySettings.id, existing.id))
          .run();
      } else {
        db.insert(schema.shiftMonthlySettings)
          .values({ ...values, createdAt: now })
          .run();
      }
    }
  });
  const next = listShiftMonthlySettings(storeId);
  recordAudit(actorId, "shift_monthly_settings.upsert", storeId, null, next, now, "store");
  return { kind: "ok", settings: next };
}

export function getShiftPeriod(id: number): ShiftPeriodRow | null {
  const row = db
    .select()
    .from(schema.shiftRecruitmentPeriods)
    .where(eq(schema.shiftRecruitmentPeriods.id, id))
    .get();
  return row ? rowToShiftPeriod(row) : null;
}

export function updateShiftPeriodStatus(
  id: number,
  status: ShiftPeriodStatus,
  actorId: number,
  now: number = Date.now(),
): { kind: "ok"; period: ShiftPeriodRow } | ShiftServiceError {
  const existing = getShiftPeriod(id);
  if (!existing) return { kind: "not_found" };
  db.update(schema.shiftRecruitmentPeriods)
    .set({ status, updatedAt: now })
    .where(eq(schema.shiftRecruitmentPeriods.id, id))
    .run();
  const next = { ...existing, status, updated_at: now };
  recordAudit(actorId, "shift_period.update", id, existing, next, now, "shift_period");
  return { kind: "ok", period: next };
}

export function listShiftPeriods(query: {
  store_id?: number;
  store_ids?: number[];
  from?: string;
  to?: string;
  open_only?: boolean;
}): ShiftPeriodRow[] {
  const conds = [];
  if (query.store_id != null)
    conds.push(eq(schema.shiftRecruitmentPeriods.storeId, query.store_id));
  if (query.store_ids != null) {
    if (query.store_ids.length === 0) return [];
    conds.push(inArray(schema.shiftRecruitmentPeriods.storeId, query.store_ids));
  }
  if (query.from != null) conds.push(gte(schema.shiftRecruitmentPeriods.targetTo, query.from));
  if (query.to != null) conds.push(lte(schema.shiftRecruitmentPeriods.targetFrom, query.to));
  if (query.open_only) conds.push(eq(schema.shiftRecruitmentPeriods.status, "open"));

  const where = conds.length > 0 ? and(...conds) : undefined;
  const rows = where
    ? db
        .select()
        .from(schema.shiftRecruitmentPeriods)
        .where(where)
        .orderBy(asc(schema.shiftRecruitmentPeriods.targetFrom))
        .all()
    : db
        .select()
        .from(schema.shiftRecruitmentPeriods)
        .orderBy(asc(schema.shiftRecruitmentPeriods.targetFrom))
        .all();
  return rows.map(rowToShiftPeriod);
}

export function listOpenShiftPeriodsForEmployee(
  employeeId: number,
  today: string,
): ShiftPeriodRow[] {
  const storeRows = db
    .select({ storeId: schema.employeeStores.storeId })
    .from(schema.employeeStores)
    .where(eq(schema.employeeStores.employeeId, employeeId))
    .all();
  const storeIds = storeRows.map((r) => r.storeId);
  if (storeIds.length === 0) return [];
  return listShiftPeriods({ store_ids: storeIds, open_only: true }).filter(
    (p) => p.submission_from <= today && today <= p.submission_to,
  );
}

export function listShiftRequirementSlots(periodId: number): ShiftRequirementSlotRow[] {
  return db
    .select()
    .from(schema.shiftRequirementSlots)
    .where(eq(schema.shiftRequirementSlots.periodId, periodId))
    .orderBy(asc(schema.shiftRequirementSlots.date), asc(schema.shiftRequirementSlots.startTime))
    .all()
    .map(rowToShiftRequirementSlot);
}

export interface ShiftPeriodSummary {
  period: ShiftPeriodRow;
  slots: Array<
    ShiftRequirementSlotRow & {
      assigned_count: number;
      requested_count: number;
      shortage_count: number;
      over_requested_count: number;
    }
  >;
  requests: ShiftRequestRow[];
  missing_employee_ids: number[];
  unfit_requests: ShiftRequestRow[];
}

export function getShiftPeriodSummary(periodId: number): ShiftPeriodSummary | null {
  const period = getShiftPeriod(periodId);
  if (!period) return null;
  const slots = listShiftRequirementSlots(periodId);
  const requests = listShiftRequests({ period_id: periodId });
  const shifts = listShifts({
    store_id: period.store_id,
    from: period.target_from,
    to: period.target_to,
  });
  const employees = db
    .select({ id: schema.employeeStores.employeeId })
    .from(schema.employeeStores)
    .where(eq(schema.employeeStores.storeId, period.store_id))
    .all();
  const submitted = new Set(requests.map((r) => r.employee_id));
  const missing = employees.map((e) => e.id).filter((id) => !submitted.has(id));

  const enriched = slots.map((slot) => {
    const assigned = shifts.filter(
      (s) => s.date === slot.date && s.start_time < slot.end_time && slot.start_time < s.end_time,
    ).length;
    const requested = requests.filter((r) => requestCoversSlot(r, slot)).length;
    return {
      ...slot,
      assigned_count: assigned,
      requested_count: requested,
      shortage_count: Math.max(0, slot.required_count - assigned),
      over_requested_count: Math.max(0, requested - slot.required_count),
    };
  });

  const unfit = requests.filter(
    (r) => r.preference !== "unavailable" && !slots.some((slot) => requestCoversSlot(r, slot)),
  );
  return {
    period,
    slots: enriched,
    requests,
    missing_employee_ids: missing,
    unfit_requests: unfit,
  };
}

export function autoDraftShiftsFromPeriod(
  periodId: number,
  actorId: number,
  now: number = Date.now(),
):
  | {
      kind: "ok";
      created: ShiftRow[];
      unfilled_slots: Array<ShiftRequirementSlotRow & { remaining: number }>;
      skipped_request_ids: number[];
    }
  | ShiftServiceError {
  const period = getShiftPeriod(periodId);
  if (!period) return { kind: "not_found" };
  const slots = listShiftRequirementSlots(periodId);
  const requests = listShiftRequests({ period_id: periodId });
  const created: ShiftRow[] = [];
  const usedRequestIds = new Set<number>();
  const skippedRequestIds = new Set<number>();
  const unfilled: Array<ShiftRequirementSlotRow & { remaining: number }> = [];

  for (const slot of slots) {
    const existing = listShifts({
      store_id: slot.store_id,
      from: slot.date,
      to: slot.date,
    }).filter((s) => s.start_time < slot.end_time && slot.start_time < s.end_time);
    let remaining = Math.max(0, slot.required_count - existing.length);
    if (remaining === 0) continue;

    const blockedEmployeeIds = new Set(
      requests.filter((r) => requestBlocksSlot(r, slot)).map((r) => r.employee_id),
    );
    const candidates = requests
      .filter((r) => !usedRequestIds.has(r.id))
      .filter((r) => !blockedEmployeeIds.has(r.employee_id))
      .filter((r) => requestCoversSlot(r, slot))
      .sort((a, b) => {
        const pref = (p: ShiftPreference) => (p === "preferred" ? 0 : p === "available" ? 1 : 2);
        return pref(a.preference) - pref(b.preference) || a.submitted_at - b.submitted_at;
      });

    for (const request of candidates) {
      if (remaining <= 0) break;
      const result = createShift(
        {
          employee_id: request.employee_id,
          store_id: slot.store_id,
          date: slot.date,
          start_time: slot.start_time,
          end_time: slot.end_time,
          created_by: actorId,
        },
        now,
      );
      if (result.kind === "ok") {
        created.push(result.shift);
        usedRequestIds.add(request.id);
        remaining -= 1;
      } else {
        skippedRequestIds.add(request.id);
      }
    }
    if (remaining > 0) unfilled.push({ ...slot, remaining });
  }

  return {
    kind: "ok",
    created,
    unfilled_slots: unfilled,
    skipped_request_ids: Array.from(skippedRequestIds),
  };
}

// ----- Shift Requests -----

export interface CreateShiftRequestInput {
  employee_id: number;
  period_id?: number | null;
  store_id?: number | null;
  date: string;
  start_time?: string | null;
  end_time?: string | null;
  preference: ShiftPreference;
  note?: string;
}

export function createShiftRequest(
  input: CreateShiftRequestInput,
  now: number = Date.now(),
): ShiftRequestRow | ShiftServiceError {
  const period = input.period_id != null ? getShiftPeriod(input.period_id) : null;
  if (input.period_id != null && !period) return { kind: "not_found" };
  const storeId = period?.store_id ?? input.store_id ?? null;
  if (period) {
    const today = todayYmd(now);
    if (
      period.status !== "open" ||
      today < period.submission_from ||
      today > period.submission_to
    ) {
      return { kind: "invalid", message: "shift request period is not open" };
    }
    if (input.date < period.target_from || input.date > period.target_to) {
      return { kind: "invalid", message: "date is outside target range" };
    }
  }
  if (storeId != null && !employeeBelongsToStore(input.employee_id, storeId)) {
    return { kind: "invalid", message: "employee does not belong to store" };
  }

  const values = {
    employeeId: input.employee_id,
    periodId: input.period_id ?? null,
    storeId,
    date: input.date,
    startTime: input.start_time ?? null,
    endTime: input.end_time ?? null,
    preference: input.preference,
    note: input.note ?? null,
    submittedAt: now,
  };

  const inserted = db.transaction((tx) => {
    if (input.period_id == null) {
      return tx.insert(schema.shiftRequests).values(values).returning().get();
    }
    return tx
      .insert(schema.shiftRequests)
      .values(values)
      .onConflictDoUpdate({
        target: [
          schema.shiftRequests.periodId,
          schema.shiftRequests.employeeId,
          schema.shiftRequests.date,
        ],
        set: {
          storeId,
          startTime: input.start_time ?? null,
          endTime: input.end_time ?? null,
          preference: input.preference,
          note: input.note ?? null,
          submittedAt: now,
        },
      })
      .returning()
      .get();
  });
  return rowToShiftRequest(inserted);
}

export function listShiftRequests(query: {
  from?: string;
  to?: string;
  employee_id?: number;
  employee_ids?: number[];
  store_ids?: number[];
  period_id?: number;
}): ShiftRequestRow[] {
  const conds = [];
  if (query.from != null) conds.push(gte(schema.shiftRequests.date, query.from));
  if (query.to != null) conds.push(lte(schema.shiftRequests.date, query.to));
  if (query.employee_id != null) conds.push(eq(schema.shiftRequests.employeeId, query.employee_id));
  if (query.period_id != null) conds.push(eq(schema.shiftRequests.periodId, query.period_id));
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
