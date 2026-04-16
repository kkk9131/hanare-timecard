import { z } from "zod";
import { apiClient } from "./client";

export const employeeProfileSchema = z.object({
  id: z.number(),
  name: z.string(),
  kana: z.string(),
  role: z.enum(["staff", "manager", "admin"]),
  store_ids: z.array(z.number()),
});

export type EmployeeProfile = z.infer<typeof employeeProfileSchema>;

export const meSchema = z.object({
  employee: employeeProfileSchema,
  session_expires_at: z.number(),
});

export type MeResponse = z.infer<typeof meSchema>;

/**
 * `fetchMe` returns the AuthGuard-shaped record.
 * AuthGuard treats it as `{ id, name, role }`, so we flatten the
 * server payload into that shape while still typing the full response.
 */
export type Me = {
  id: number;
  name: string;
  role: EmployeeProfile["role"];
};

export async function fetchMe(signal?: AbortSignal): Promise<Me> {
  const data = await apiClient.get("/api/auth/me", meSchema, signal);
  return {
    id: data.employee.id,
    name: data.employee.name,
    role: data.employee.role,
  };
}

// ---------- /api/auth/employees ----------

export const publicEmployeeSchema = z.object({
  id: z.number(),
  name: z.string(),
  kana: z.string(),
  store_ids: z.array(z.number()),
});

export type PublicEmployee = z.infer<typeof publicEmployeeSchema>;

const listEmployeesResponseSchema = z.object({
  employees: z.array(publicEmployeeSchema),
});

export function fetchPublicEmployees(
  storeId?: number,
  signal?: AbortSignal,
): Promise<PublicEmployee[]> {
  const path = storeId != null ? `/api/auth/employees?store_id=${storeId}` : "/api/auth/employees";
  return apiClient.get(path, listEmployeesResponseSchema, signal).then((r) => r.employees);
}

// ---------- /api/auth/kiosk-login ----------

const kioskLoginResponseSchema = z.object({
  employee: employeeProfileSchema,
  session_expires_at: z.number(),
});

export type KioskLoginOk = z.infer<typeof kioskLoginResponseSchema>;

export async function kioskLogin(employeeId: number, signal?: AbortSignal): Promise<KioskLoginOk> {
  return apiClient.post(
    "/api/auth/kiosk-login",
    kioskLoginResponseSchema,
    { employee_id: employeeId },
    signal,
  );
}

const adminGateStatusSchema = z.object({
  allowed: z.boolean(),
  expires_at: z.number().nullable().optional(),
});

export type AdminGateStatus = z.infer<typeof adminGateStatusSchema>;

const adminGateRequestSchema = z.object({
  pin: z.string().regex(/^\d{4,6}$/u, "PIN は 4〜6 桁の数字で入力してください"),
});

const adminGateResponseSchema = z.object({
  ok: z.literal(true),
  expires_at: z.number(),
});

export type AdminGateResponse = z.infer<typeof adminGateResponseSchema>;

export async function fetchAdminGateStatus(signal?: AbortSignal): Promise<AdminGateStatus> {
  return apiClient.get("/api/auth/admin-gate-status", adminGateStatusSchema, signal);
}

export async function unlockAdminGate(
  body: z.infer<typeof adminGateRequestSchema>,
  signal?: AbortSignal,
): Promise<AdminGateResponse> {
  const parsed = adminGateRequestSchema.parse(body);
  return apiClient.post("/api/auth/admin-gate", adminGateResponseSchema, parsed, signal);
}

export async function logout(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
}
