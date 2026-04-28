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
  store_ids: number[];
};

export async function fetchMe(signal?: AbortSignal): Promise<Me> {
  const data = await apiClient.get("/api/auth/me", meSchema, signal);
  return {
    id: data.employee.id,
    name: data.employee.name,
    role: data.employee.role,
    store_ids: data.employee.store_ids,
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

export async function logout(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
}
