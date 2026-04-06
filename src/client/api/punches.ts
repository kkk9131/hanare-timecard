import { z } from "zod";
import { apiClient } from "./client";

export const punchTypeSchema = z.enum(["clock_in", "clock_out", "break_start", "break_end"]);

export type PunchType = z.infer<typeof punchTypeSchema>;

export const workStateSchema = z.enum(["off", "working", "on_break"]);
export type WorkState = z.infer<typeof workStateSchema>;

export const punchRowSchema = z.object({
  id: z.number(),
  employee_id: z.number(),
  store_id: z.number(),
  punch_type: punchTypeSchema,
  punched_at: z.number(),
  source: z.enum(["kiosk", "admin", "correction"]),
  note: z.string().nullable(),
  created_at: z.number(),
});

export type PunchRow = z.infer<typeof punchRowSchema>;

export const meStateSchema = z.object({
  state: workStateSchema,
  last_punch: punchRowSchema.nullable(),
});

export type MeState = z.infer<typeof meStateSchema>;

export function fetchMyState(signal?: AbortSignal): Promise<MeState> {
  return apiClient.get("/api/punches/me/state", meStateSchema, signal);
}

const createPunchResponseSchema = z.object({
  punch: punchRowSchema,
  message: z.string(),
  next_state: workStateSchema,
});

export type CreatePunchResponse = z.infer<typeof createPunchResponseSchema>;

export type CreatePunchError =
  | {
      kind: "invalid_transition";
      current_state: WorkState;
      message: string;
    }
  | { kind: "unknown"; message: string };

export type CreatePunchResult = { kind: "ok"; data: CreatePunchResponse } | CreatePunchError;

/**
 * 打刻を実行する。サーバ時刻で記録される。
 * 401/423/409 等のエラーは throw せず result として返す。
 */
export async function createPunch(args: {
  punch_type: PunchType;
  store_id: number;
}): Promise<CreatePunchResult> {
  const res = await fetch("/api/punches", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });

  const text = await res.text();
  const json: unknown = text.length > 0 ? JSON.parse(text) : undefined;

  if (res.ok) {
    const parsed = createPunchResponseSchema.safeParse(json);
    if (!parsed.success) {
      return { kind: "unknown", message: "打刻応答が不正です" };
    }
    return { kind: "ok", data: parsed.data };
  }

  if (res.status === 409) {
    const shape = z
      .object({
        error: z.string(),
        message: z.string().optional(),
        current_state: workStateSchema.optional(),
      })
      .safeParse(json);
    if (shape.success) {
      return {
        kind: "invalid_transition",
        current_state: shape.data.current_state ?? "off",
        message: shape.data.message ?? "現在の状態ではこの操作はできません",
      };
    }
  }

  return {
    kind: "unknown",
    message: "通信に問題が起きました。もう一度お試しください",
  };
}

// ---------- /api/punches/me ----------

const myPunchesResponseSchema = z.object({
  punches: z.array(punchRowSchema),
});

export function fetchMyPunches(
  args: { from?: string; to?: string } = {},
  signal?: AbortSignal,
): Promise<PunchRow[]> {
  const params = new URLSearchParams();
  if (args.from) params.set("from", args.from);
  if (args.to) params.set("to", args.to);
  const qs = params.toString();
  return apiClient
    .get(`/api/punches/me${qs ? `?${qs}` : ""}`, myPunchesResponseSchema, signal)
    .then((r) => r.punches);
}

// ---------- /api/punches/me/summary ----------

export const monthSummarySchema = z.object({
  worked: z.number(),
  overtime: z.number(),
  break: z.number(),
  night: z.number(),
});

export type MonthSummary = z.infer<typeof monthSummarySchema>;

export function fetchMyMonthSummary(signal?: AbortSignal): Promise<MonthSummary> {
  return apiClient.get("/api/punches/me/summary", monthSummarySchema, signal);
}
