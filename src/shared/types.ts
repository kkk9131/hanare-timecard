import type { z } from "zod";
import type {
  adminGateSchema,
  adminLoginSchema,
  approveCorrectionSchema,
  correctionStatusSchema,
  createCorrectionSchema,
  createEmployeeSchema,
  createPunchSchema,
  createShiftRequestSchema,
  createShiftSchema,
  createStoreSchema,
  exportQuerySchema,
  kioskLoginSchema,
  listAuditQuerySchema,
  listCorrectionsQuerySchema,
  listEmployeesQuerySchema,
  listPunchesQuerySchema,
  listShiftRequestsQuerySchema,
  listShiftsQuerySchema,
  myPunchesQuerySchema,
  publishShiftSchema,
  punchSourceSchema,
  punchTypeSchema,
  rejectCorrectionSchema,
  retireEmployeeSchema,
  reviewCorrectionSchema,
  roleSchema,
  shiftConflictsQuerySchema,
  shiftPreferenceSchema,
  shiftStatusSchema,
  updateEmployeeSchema,
  updateShiftSchema,
  updateStoreSchema,
  workStateSchema,
} from "./schemas.ts";

// ---------- Enum-ish types (derived from zod) ----------

export type Role = z.infer<typeof roleSchema>;
export type PunchType = z.infer<typeof punchTypeSchema>;
export type PunchSource = z.infer<typeof punchSourceSchema>;
export type ShiftStatus = z.infer<typeof shiftStatusSchema>;
export type CorrectionStatus = z.infer<typeof correctionStatusSchema>;
export type ShiftPreference = z.infer<typeof shiftPreferenceSchema>;
export type WorkState = z.infer<typeof workStateSchema>;

// ---------- Entity types (mirror data-model.md DDL) ----------

export interface Store {
  id: number;
  code: string;
  name: string;
  display_name: string;
  opening_time: string; // HH:MM
  closing_time: string; // HH:MM
  closed_days: number[] | null;
  created_at: number; // unix ms
}

export interface Employee {
  id: number;
  name: string;
  kana: string;
  role: Role;
  login_id: string | null;
  hourly_wage: number;
  hire_date: string; // YYYY-MM-DD
  retire_date: string | null;
  note: string | null;
  created_at: number;
  updated_at: number;
  store_ids?: number[];
  primary_store_id?: number | null;
}

export interface EmployeeStoreLink {
  employee_id: number;
  store_id: number;
  is_primary: boolean;
}

export interface TimePunch {
  id: number;
  employee_id: number;
  store_id: number;
  punch_type: PunchType;
  punched_at: number; // unix ms
  source: PunchSource;
  note: string | null;
  created_at: number;
}

export interface Shift {
  id: number;
  employee_id: number;
  store_id: number;
  date: string; // YYYY-MM-DD
  start_time: string; // HH:MM
  end_time: string; // HH:MM
  status: ShiftStatus;
  created_by: number;
  created_at: number;
  updated_at: number;
}

export interface ShiftRequest {
  id: number;
  employee_id: number;
  date: string;
  start_time: string | null;
  end_time: string | null;
  preference: ShiftPreference;
  note: string | null;
  submitted_at: number;
}

export interface CorrectionRequest {
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

export interface AuditLog {
  id: number;
  actor_id: number | null;
  action: string;
  entity_type: string;
  entity_id: number | null;
  before_json: string | null;
  after_json: string | null;
  occurred_at: number;
}

export interface Session {
  id: string;
  employee_id: number;
  role: Role;
  expires_at: number;
  created_at: number;
}

/** Aggregated row used for monthly summary / exports */
export interface WorkDayRow {
  employee_id: number;
  employee_name: string;
  store_id: number;
  store_name: string;
  date: string; // YYYY-MM-DD
  clock_in_at: number | null;
  clock_out_at: number | null;
  worked_minutes: number;
  break_minutes: number;
  overtime_minutes: number;
  night_minutes: number;
}

export interface MonthlySummary {
  worked: number; // minutes
  overtime: number;
  break: number;
  night: number;
}

// ---------- API request types (derived from zod) ----------

export type KioskLoginInput = z.infer<typeof kioskLoginSchema>;
export type AdminLoginInput = z.infer<typeof adminLoginSchema>;
export type AdminGateInput = z.infer<typeof adminGateSchema>;

export type CreateStoreInput = z.infer<typeof createStoreSchema>;
export type UpdateStoreInput = z.infer<typeof updateStoreSchema>;

export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;
export type RetireEmployeeInput = z.infer<typeof retireEmployeeSchema>;
export type ListEmployeesQuery = z.infer<typeof listEmployeesQuerySchema>;

export type CreatePunchInput = z.infer<typeof createPunchSchema>;
export type ListPunchesQuery = z.infer<typeof listPunchesQuerySchema>;
export type MyPunchesQuery = z.infer<typeof myPunchesQuerySchema>;

export type CreateShiftInput = z.infer<typeof createShiftSchema>;
export type UpdateShiftInput = z.infer<typeof updateShiftSchema>;
export type PublishShiftInput = z.infer<typeof publishShiftSchema>;
export type ListShiftsQuery = z.infer<typeof listShiftsQuerySchema>;
export type ShiftConflictsQuery = z.infer<typeof shiftConflictsQuerySchema>;

export type CreateShiftRequestInput = z.infer<typeof createShiftRequestSchema>;
export type ListShiftRequestsQuery = z.infer<typeof listShiftRequestsQuerySchema>;

export type CreateCorrectionInput = z.infer<typeof createCorrectionSchema>;
export type ApproveCorrectionInput = z.infer<typeof approveCorrectionSchema>;
export type RejectCorrectionInput = z.infer<typeof rejectCorrectionSchema>;
export type ReviewCorrectionInput = z.infer<typeof reviewCorrectionSchema>;
export type ListCorrectionsQuery = z.infer<typeof listCorrectionsQuerySchema>;

export type ExportQuery = z.infer<typeof exportQuerySchema>;

export type ListAuditQuery = z.infer<typeof listAuditQuerySchema>;

// ---------- API response shapes ----------

export interface KioskLoginResponse {
  employee: Employee;
  session_expires_at: number;
}

export interface AdminLoginResponse {
  employee: Employee;
  session_expires_at: number;
}

export interface MeResponse {
  employee: Employee;
  session_expires_at: number;
}

export interface PunchResponse {
  punch: TimePunch;
  message: string;
  next_state: WorkState;
}

export interface PunchStateResponse {
  state: WorkState;
  last_punch: TimePunch | null;
}

export interface ApiError {
  error: string;
  message?: string;
  details?: Record<string, unknown>;
}
