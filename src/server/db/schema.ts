import { sql } from "drizzle-orm";
import { check, index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const stores = sqliteTable("stores", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  displayName: text("display_name").notNull(),
  openingTime: text("opening_time").notNull(),
  closingTime: text("closing_time").notNull(),
  closedDays: text("closed_days"),
  createdAt: integer("created_at").notNull(),
});

export const employees = sqliteTable(
  "employees",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    kana: text("kana").notNull(),
    role: text("role").notNull(),
    loginId: text("login_id").unique(),
    passwordHash: text("password_hash"),
    pinHash: text("pin_hash").notNull(),
    hourlyWage: integer("hourly_wage").notNull().default(0),
    hireDate: text("hire_date").notNull(),
    retireDate: text("retire_date"),
    pinFailCount: integer("pin_fail_count").notNull().default(0),
    lockUntil: integer("lock_until"),
    note: text("note"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    check("employees_role_check", sql`${table.role} IN ('staff','manager','admin')`),
    index("idx_employees_kana").on(table.kana),
    index("idx_employees_retire").on(table.retireDate),
  ],
);

export const employeeStores = sqliteTable(
  "employee_stores",
  {
    employeeId: integer("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    storeId: integer("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    isPrimary: integer("is_primary").notNull().default(0),
  },
  (table) => [
    primaryKey({ columns: [table.employeeId, table.storeId] }),
    index("idx_emp_stores_store").on(table.storeId),
  ],
);

export const timePunches = sqliteTable(
  "time_punches",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    employeeId: integer("employee_id")
      .notNull()
      .references(() => employees.id),
    storeId: integer("store_id")
      .notNull()
      .references(() => stores.id),
    punchType: text("punch_type").notNull(),
    punchedAt: integer("punched_at").notNull(),
    source: text("source").notNull(),
    note: text("note"),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    check(
      "time_punches_type_check",
      sql`${table.punchType} IN ('clock_in','clock_out','break_start','break_end')`,
    ),
    check("time_punches_source_check", sql`${table.source} IN ('kiosk','admin','correction')`),
    index("idx_punches_emp_time").on(table.employeeId, table.punchedAt),
    index("idx_punches_store_time").on(table.storeId, table.punchedAt),
  ],
);

export const shifts = sqliteTable(
  "shifts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    employeeId: integer("employee_id")
      .notNull()
      .references(() => employees.id),
    storeId: integer("store_id")
      .notNull()
      .references(() => stores.id),
    date: text("date").notNull(),
    startTime: text("start_time").notNull(),
    endTime: text("end_time").notNull(),
    status: text("status").notNull(),
    createdBy: integer("created_by")
      .notNull()
      .references(() => employees.id),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    check("shifts_status_check", sql`${table.status} IN ('draft','published')`),
    index("idx_shifts_store_date").on(table.storeId, table.date),
    index("idx_shifts_emp_date").on(table.employeeId, table.date),
  ],
);

export const shiftRequests = sqliteTable(
  "shift_requests",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    employeeId: integer("employee_id")
      .notNull()
      .references(() => employees.id),
    date: text("date").notNull(),
    startTime: text("start_time"),
    endTime: text("end_time"),
    preference: text("preference").notNull(),
    note: text("note"),
    submittedAt: integer("submitted_at").notNull(),
  },
  (table) => [
    check(
      "shift_requests_pref_check",
      sql`${table.preference} IN ('available','preferred','unavailable')`,
    ),
    index("idx_shift_req_date").on(table.date),
  ],
);

export const correctionRequests = sqliteTable(
  "correction_requests",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    employeeId: integer("employee_id")
      .notNull()
      .references(() => employees.id),
    storeId: integer("store_id")
      .notNull()
      .references(() => stores.id),
    targetPunchId: integer("target_punch_id").references(() => timePunches.id),
    targetDate: text("target_date").notNull(),
    requestedValue: integer("requested_value"),
    requestedType: text("requested_type"),
    reason: text("reason").notNull(),
    status: text("status").notNull(),
    reviewerId: integer("reviewer_id").references(() => employees.id),
    reviewedAt: integer("reviewed_at"),
    reviewComment: text("review_comment"),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    check(
      "correction_requests_status_check",
      sql`${table.status} IN ('pending','approved','rejected')`,
    ),
    index("idx_corrections_status").on(table.status),
    index("idx_corrections_emp").on(table.employeeId),
    index("idx_corrections_store").on(table.storeId),
  ],
);

export const auditLogs = sqliteTable(
  "audit_logs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    actorId: integer("actor_id").references(() => employees.id),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: integer("entity_id"),
    beforeJson: text("before_json"),
    afterJson: text("after_json"),
    occurredAt: integer("occurred_at").notNull(),
  },
  (table) => [
    index("idx_audit_time").on(table.occurredAt),
    index("idx_audit_actor").on(table.actorId),
  ],
);

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    employeeId: integer("employee_id")
      .notNull()
      .references(() => employees.id),
    role: text("role").notNull(),
    expiresAt: integer("expires_at").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [index("idx_sessions_expires").on(table.expiresAt)],
);

export const workDays = sqliteTable(
  "work_days",
  {
    employeeId: integer("employee_id")
      .notNull()
      .references(() => employees.id),
    storeId: integer("store_id")
      .notNull()
      .references(() => stores.id),
    date: text("date").notNull(),
    workedMinutes: integer("worked_minutes").notNull(),
    breakMinutes: integer("break_minutes").notNull(),
    overtimeMinutes: integer("overtime_minutes").notNull(),
    nightMinutes: integer("night_minutes").notNull(),
    computedAt: integer("computed_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.employeeId, table.storeId, table.date] })],
);
