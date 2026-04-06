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

// ---------- /api/auth/pin-login ----------

const pinLoginOkSchema = z.object({
  employee: employeeProfileSchema,
  session_expires_at: z.number(),
});

export type PinLoginOk = z.infer<typeof pinLoginOkSchema>;

export type PinLoginError =
  | { kind: "invalid_pin"; remaining: number; message: string }
  | { kind: "locked"; lock_until: number; message: string }
  | { kind: "unknown"; message: string };

export type PinLoginResult = { kind: "ok"; data: PinLoginOk } | PinLoginError;

/**
 * Calls /api/auth/pin-login. Always resolves (never throws on 401/423)
 * so the caller can render kind-tonalty messages.
 */
export async function pinLogin(employeeId: number, pin: string): Promise<PinLoginResult> {
  const res = await fetch("/api/auth/pin-login", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ employee_id: employeeId, pin }),
  });

  const text = await res.text();
  const json: unknown = text.length > 0 ? JSON.parse(text) : undefined;

  if (res.ok) {
    const parsed = pinLoginOkSchema.safeParse(json);
    if (!parsed.success) {
      return { kind: "unknown", message: "ログイン応答が不正です" };
    }
    return { kind: "ok", data: parsed.data };
  }

  if (res.status === 401) {
    const shape = z
      .object({
        error: z.string(),
        message: z.string().optional(),
        remaining: z.number().optional(),
      })
      .safeParse(json);
    if (shape.success) {
      return {
        kind: "invalid_pin",
        remaining: shape.data.remaining ?? 0,
        message: shape.data.message ?? "申し訳ございません、もう一度 PIN をご確認ください",
      };
    }
  }

  if (res.status === 423) {
    const shape = z
      .object({
        error: z.string(),
        message: z.string().optional(),
        lock_until: z.number(),
      })
      .safeParse(json);
    if (shape.success) {
      return {
        kind: "locked",
        lock_until: shape.data.lock_until,
        message: shape.data.message ?? "5 回続けて誤入力されたため、5 分後に再度お試しください",
      };
    }
  }

  return {
    kind: "unknown",
    message: "通信に問題が起きました。もう一度お試しください",
  };
}

export async function logout(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
}
