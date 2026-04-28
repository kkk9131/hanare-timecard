import { z } from "zod";
import { apiClient } from "./client";

// ---------- Auth ----------

export const adminLoginRequestSchema = z.object({
  login_id: z.string().min(1, "ログイン ID を入力してください"),
  password: z.string().min(1, "パスワードを入力してください"),
});
export type AdminLoginRequest = z.infer<typeof adminLoginRequestSchema>;

const adminLoginResponseSchema = z.object({
  employee: z.object({
    id: z.number(),
    name: z.string(),
    role: z.enum(["staff", "manager", "admin"]),
  }),
  session_expires_at: z.number(),
});
export type AdminLoginResponse = z.infer<typeof adminLoginResponseSchema>;

export function adminLogin(body: AdminLoginRequest, signal?: AbortSignal) {
  return apiClient.post("/api/auth/admin-login", adminLoginResponseSchema, body, signal);
}

// ---------- Stores ----------

export const storeSchema = z.object({
  id: z.number(),
  code: z.string(),
  name: z.string(),
  display_name: z.string(),
  opening_time: z.string().optional().nullable(),
  closing_time: z.string().optional().nullable(),
  closed_days: z.array(z.number()).optional(),
  created_at: z.number().optional(),
});
export type Store = z.infer<typeof storeSchema>;

const storesResponseSchema = z.object({
  stores: z.array(storeSchema),
});

export function listStores(signal?: AbortSignal) {
  return apiClient.get("/api/stores", storesResponseSchema, signal).then((r) => r.stores);
}

// ---------- Punches (manager+) ----------

export const punchTypeSchema = z.enum(["clock_in", "clock_out", "break_start", "break_end"]);
export type PunchType = z.infer<typeof punchTypeSchema>;

export const punchSchema = z.object({
  id: z.number(),
  employee_id: z.number(),
  store_id: z.number(),
  punch_type: punchTypeSchema,
  punched_at: z.number(),
});
export type Punch = z.infer<typeof punchSchema>;

const punchesResponseSchema = z.object({
  punches: z.array(punchSchema),
});

export type ListPunchesQuery = {
  store_id?: number;
  employee_id?: number;
  /** YYYY-MM-DD */
  from?: string;
  /** YYYY-MM-DD */
  to?: string;
};

export function listPunches(q: ListPunchesQuery, signal?: AbortSignal) {
  const params = new URLSearchParams();
  if (q.store_id != null) params.set("store_id", String(q.store_id));
  if (q.employee_id != null) params.set("employee_id", String(q.employee_id));
  if (q.from) params.set("from", q.from);
  if (q.to) params.set("to", q.to);
  const qs = params.toString();
  return apiClient
    .get(`/api/punches${qs ? `?${qs}` : ""}`, punchesResponseSchema, signal)
    .then((r) => r.punches);
}

// ---------- Employees (manager+) ----------

export const employeeSchema = z.object({
  id: z.number(),
  name: z.string(),
  kana: z.string().optional().nullable(),
  role: z.enum(["staff", "manager", "admin"]),
  login_id: z.string().nullable().optional(),
  hourly_wage: z.number().optional(),
  hire_date: z.string().optional(),
  retire_date: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
  store_ids: z.array(z.number()).optional(),
  primary_store_id: z.number().optional().nullable(),
  created_at: z.number().optional(),
  updated_at: z.number().optional(),
});
export type Employee = z.infer<typeof employeeSchema>;

const employeesResponseSchema = z.object({
  employees: z.array(employeeSchema),
});

export type ListEmployeesQuery = {
  store_id?: number;
  include_retired?: boolean;
  search?: string;
};

export function listEmployees(q: ListEmployeesQuery = {}, signal?: AbortSignal) {
  const params = new URLSearchParams();
  if (q.store_id != null) params.set("store_id", String(q.store_id));
  if (q.include_retired) params.set("include_retired", "true");
  if (q.search) params.set("search", q.search);
  const qs = params.toString();
  return apiClient
    .get(`/api/employees${qs ? `?${qs}` : ""}`, employeesResponseSchema, signal)
    .then((r) => r.employees);
}

// ---------- Shifts (manager+) ----------

export const shiftSchema = z.object({
  id: z.number(),
  employee_id: z.number(),
  store_id: z.number(),
  date: z.string(),
  start_time: z.string(),
  end_time: z.string(),
  status: z.enum(["draft", "published"]),
});
export type Shift = z.infer<typeof shiftSchema>;

const shiftsResponseSchema = z.object({
  shifts: z.array(shiftSchema),
});

export type ListShiftsQuery = {
  store_id?: number;
  /** YYYY-MM-DD */
  from?: string;
  /** YYYY-MM-DD */
  to?: string;
  status?: "draft" | "published";
};

export function listShifts(q: ListShiftsQuery, signal?: AbortSignal) {
  const params = new URLSearchParams();
  if (q.store_id != null) params.set("store_id", String(q.store_id));
  if (q.from) params.set("from", q.from);
  if (q.to) params.set("to", q.to);
  if (q.status) params.set("status", q.status);
  const qs = params.toString();
  return apiClient
    .get(`/api/shifts${qs ? `?${qs}` : ""}`, shiftsResponseSchema, signal)
    .then((r) => r.shifts);
}

// ----- Shift mutations -----

export type CreateShiftBody = {
  employee_id: number;
  store_id: number;
  /** YYYY-MM-DD */
  date: string;
  /** HH:MM */
  start_time: string;
  /** HH:MM */
  end_time: string;
};

const createShiftResponseSchema = z.object({ shift: shiftSchema });

export function createShift(body: CreateShiftBody, signal?: AbortSignal) {
  return apiClient
    .post("/api/shifts", createShiftResponseSchema, body, signal)
    .then((r) => r.shift);
}

export type UpdateShiftBody = Partial<CreateShiftBody> & {
  status?: "draft" | "published";
};

const updateShiftResponseSchema = z.object({ shift: shiftSchema });

export function updateShift(id: number, body: UpdateShiftBody, signal?: AbortSignal) {
  return apiClient
    .patch(`/api/shifts/${id}`, updateShiftResponseSchema, body, signal)
    .then((r) => r.shift);
}

const okResponseSchema = z.object({ ok: z.boolean() });

export function deleteShift(id: number, signal?: AbortSignal) {
  return apiClient.delete(`/api/shifts/${id}`, okResponseSchema, signal);
}

const publishShiftResponseSchema = z.object({
  published: z.number(),
  ids: z.array(z.number()),
});
export type PublishShiftResult = z.infer<typeof publishShiftResponseSchema>;

export function publishShifts(
  body: { store_id: number; from: string; to: string },
  signal?: AbortSignal,
) {
  return apiClient.post("/api/shifts/publish", publishShiftResponseSchema, body, signal);
}

// ----- Shift conflicts -----

const conflictReportSchema = z.object({
  duplicates: z.array(
    z.object({
      employee_id: z.number(),
      date: z.string(),
      shift_ids: z.array(z.number()),
    }),
  ),
  understaffed: z.array(z.object({ date: z.string(), assigned: z.number() })),
});
export type ShiftConflictReport = z.infer<typeof conflictReportSchema>;

export function getShiftConflicts(
  q: { store_id: number; from: string; to: string },
  signal?: AbortSignal,
) {
  const params = new URLSearchParams({
    store_id: String(q.store_id),
    from: q.from,
    to: q.to,
  });
  return apiClient.get(`/api/shifts/conflicts?${params.toString()}`, conflictReportSchema, signal);
}

// ----- Shift requests -----

export const shiftRequestSchema = z.object({
  id: z.number(),
  employee_id: z.number(),
  date: z.string(),
  start_time: z.string().nullable(),
  end_time: z.string().nullable(),
  preference: z.enum(["available", "preferred", "unavailable"]),
  note: z.string().nullable().optional(),
  submitted_at: z.number().optional(),
});
export type ShiftRequest = z.infer<typeof shiftRequestSchema>;

const shiftRequestsResponseSchema = z.object({
  requests: z.array(shiftRequestSchema),
});

export function listShiftRequests(q: { from?: string; to?: string }, signal?: AbortSignal) {
  const params = new URLSearchParams();
  if (q.from) params.set("from", q.from);
  if (q.to) params.set("to", q.to);
  const qs = params.toString();
  return apiClient
    .get(`/api/shift-requests${qs ? `?${qs}` : ""}`, shiftRequestsResponseSchema, signal)
    .then((r) => r.requests);
}

// ---------- Corrections (manager+) ----------

export const correctionStatusSchema = z.enum(["pending", "approved", "rejected"]);
export type CorrectionStatus = z.infer<typeof correctionStatusSchema>;

export const correctionSchema = z.object({
  id: z.number(),
  employee_id: z.number(),
  store_id: z.number(),
  target_punch_id: z.number().nullable().optional(),
  target_date: z.string().optional(),
  requested_value: z.number().nullable().optional(),
  requested_type: punchTypeSchema.nullable().optional(),
  reason: z.string().optional(),
  status: correctionStatusSchema,
  reviewer_id: z.number().nullable().optional(),
  reviewed_at: z.number().nullable().optional(),
  review_comment: z.string().nullable().optional(),
  created_at: z.number().optional(),
});
export type Correction = z.infer<typeof correctionSchema>;

const correctionsResponseSchema = z.object({
  corrections: z.array(correctionSchema),
});

/**
 * 修正申請一覧。サーバ側エンドポイントが未実装の場合は空配列にフォールバックする。
 * (phase 6 で実装予定。ダッシュボードを壊さないための保険)
 */
export async function listCorrections(
  q: { status?: CorrectionStatus; store_id?: number },
  signal?: AbortSignal,
): Promise<Correction[]> {
  const params = new URLSearchParams();
  if (q.status) params.set("status", q.status);
  if (q.store_id != null) params.set("store_id", String(q.store_id));
  const qs = params.toString();
  try {
    const res = await apiClient.get(
      `/api/corrections${qs ? `?${qs}` : ""}`,
      correctionsResponseSchema,
      signal,
    );
    return res.corrections;
  } catch (e) {
    // 404 / 501 は未実装として 0 件扱いにする
    if (e && typeof e === "object" && "status" in e) {
      const status = (e as { status: number }).status;
      if (status === 404 || status === 501) return [];
    }
    throw e;
  }
}

// ---- Correction mutations ----

const correctionMutationResponseSchema = z.object({
  correction: correctionSchema,
});

export function approveCorrection(
  id: number,
  body: { review_comment?: string } = {},
  signal?: AbortSignal,
) {
  return apiClient
    .post(`/api/corrections/${id}/approve`, correctionMutationResponseSchema, body, signal)
    .then((r) => r.correction);
}

export function rejectCorrection(
  id: number,
  body: { review_comment: string },
  signal?: AbortSignal,
) {
  return apiClient
    .post(`/api/corrections/${id}/reject`, correctionMutationResponseSchema, body, signal)
    .then((r) => r.correction);
}

// ---- Employee mutations ----

const employeeMutationResponseSchema = z.object({ employee: employeeSchema });

export type CreateEmployeeBody = {
  name: string;
  kana: string;
  role: "staff" | "manager" | "admin";
  login_id?: string;
  password?: string;
  hourly_wage?: number;
  hire_date: string;
  store_ids: number[];
  primary_store_id?: number;
  note?: string;
};

export function createEmployee(body: CreateEmployeeBody, signal?: AbortSignal) {
  return apiClient
    .post("/api/employees", employeeMutationResponseSchema, body, signal)
    .then((r) => r.employee);
}

export type UpdateEmployeeBody = Partial<CreateEmployeeBody> & {
  retire_date?: string | null;
  login_id?: string | null;
};

export function updateEmployee(id: number, body: UpdateEmployeeBody, signal?: AbortSignal) {
  return apiClient
    .patch(`/api/employees/${id}`, employeeMutationResponseSchema, body, signal)
    .then((r) => r.employee);
}

export function retireEmployee(id: number, body: { retire_date: string }, signal?: AbortSignal) {
  return apiClient
    .post(`/api/employees/${id}/retire`, employeeMutationResponseSchema, body, signal)
    .then((r) => r.employee);
}

// ---- Store mutations ----

const storeMutationResponseSchema = z.object({ store: storeSchema });

export type CreateStoreBody = {
  code: string;
  name: string;
  display_name: string;
  opening_time: string;
  closing_time: string;
  closed_days?: number[];
};

export function createStore(body: CreateStoreBody, signal?: AbortSignal) {
  return apiClient
    .post("/api/stores", storeMutationResponseSchema, body, signal)
    .then((r) => r.store);
}

export type UpdateStoreBody = Partial<CreateStoreBody>;

export function updateStore(id: number, body: UpdateStoreBody, signal?: AbortSignal) {
  return apiClient
    .patch(`/api/stores/${id}`, storeMutationResponseSchema, body, signal)
    .then((r) => r.store);
}

// ---------- Exports (admin) ----------

export type ExportFormat = "xlsx" | "csv";

export type BuildExportUrlInput = {
  format: ExportFormat;
  /** YYYY-MM-DD */
  from: string;
  /** YYYY-MM-DD */
  to: string;
  store_id?: number;
};

/**
 * エクスポート用ダウンロード URL を組み立てる。
 * サーバ実装は /api/exports/period.{xlsx,csv} (api-spec エイリアスあり)。
 */
export function buildExportUrl(input: BuildExportUrlInput): string {
  const params = new URLSearchParams();
  params.set("from", input.from);
  params.set("to", input.to);
  if (input.store_id != null) params.set("store_id", String(input.store_id));
  return `/api/exports/period.${input.format}?${params.toString()}`;
}

// ---------- Audit (admin) ----------

export const auditLogSchema = z.object({
  id: z.number(),
  actor_id: z.number().nullable(),
  action: z.string(),
  entity_type: z.string().nullable(),
  entity_id: z.number().nullable(),
  before_json: z.string().nullable(),
  after_json: z.string().nullable(),
  occurred_at: z.number(),
});
export type AuditLog = z.infer<typeof auditLogSchema>;

const listAuditResponseSchema = z.object({
  logs: z.array(auditLogSchema),
  limit: z.number(),
  offset: z.number(),
});
export type ListAuditResponse = z.infer<typeof listAuditResponseSchema>;

export type ListAuditQuery = {
  /** YYYY-MM-DD */
  from?: string;
  /** YYYY-MM-DD */
  to?: string;
  actor_id?: number;
  action?: string;
  limit?: number;
  offset?: number;
};

export function listAudit(
  q: ListAuditQuery = {},
  signal?: AbortSignal,
): Promise<ListAuditResponse> {
  const params = new URLSearchParams();
  if (q.from) params.set("from", q.from);
  if (q.to) params.set("to", q.to);
  if (q.actor_id != null) params.set("actor_id", String(q.actor_id));
  if (q.action) params.set("action", q.action);
  if (q.limit != null) params.set("limit", String(q.limit));
  if (q.offset != null) params.set("offset", String(q.offset));
  const qs = params.toString();
  return apiClient.get(`/api/audit${qs ? `?${qs}` : ""}`, listAuditResponseSchema, signal);
}
