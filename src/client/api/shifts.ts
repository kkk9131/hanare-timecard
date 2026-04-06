import { z } from "zod";
import { apiClient } from "./client";

export const shiftStatusSchema = z.enum(["draft", "published"]);
export type ShiftStatus = z.infer<typeof shiftStatusSchema>;

export const shiftPreferenceSchema = z.enum(["available", "preferred", "unavailable"]);
export type ShiftPreference = z.infer<typeof shiftPreferenceSchema>;

export const myShiftSchema = z.object({
  id: z.number(),
  employee_id: z.number(),
  store_id: z.number(),
  date: z.string(),
  start_time: z.string(),
  end_time: z.string(),
  status: shiftStatusSchema,
  created_by: z.number(),
  created_at: z.number(),
  updated_at: z.number(),
});

export type MyShift = z.infer<typeof myShiftSchema>;

const listShiftsResponseSchema = z.object({
  shifts: z.array(myShiftSchema),
});

/**
 * 自分の公開シフト一覧 (server 側で staff は published かつ自分のみに絞られる)
 */
export function fetchMyShifts(
  args: { from?: string; to?: string; store_id?: number } = {},
  signal?: AbortSignal,
): Promise<MyShift[]> {
  const params = new URLSearchParams();
  if (args.from) params.set("from", args.from);
  if (args.to) params.set("to", args.to);
  if (args.store_id != null) params.set("store_id", String(args.store_id));
  const qs = params.toString();
  return apiClient
    .get(`/api/shifts${qs ? `?${qs}` : ""}`, listShiftsResponseSchema, signal)
    .then((r) => r.shifts);
}

// ---------- shift requests ----------

export const shiftRequestRowSchema = z.object({
  id: z.number(),
  employee_id: z.number(),
  date: z.string(),
  start_time: z.string().nullable(),
  end_time: z.string().nullable(),
  preference: shiftPreferenceSchema,
  note: z.string().nullable(),
  submitted_at: z.number(),
});

export type ShiftRequestRow = z.infer<typeof shiftRequestRowSchema>;

const myShiftRequestsResponseSchema = z.object({
  requests: z.array(shiftRequestRowSchema),
});

export function fetchMyShiftRequests(
  args: { from?: string; to?: string } = {},
  signal?: AbortSignal,
): Promise<ShiftRequestRow[]> {
  const params = new URLSearchParams();
  if (args.from) params.set("from", args.from);
  if (args.to) params.set("to", args.to);
  const qs = params.toString();
  return apiClient
    .get(`/api/shift-requests/me${qs ? `?${qs}` : ""}`, myShiftRequestsResponseSchema, signal)
    .then((r) => r.requests);
}

export type CreateShiftRequestInput = {
  date: string;
  start_time?: string | null;
  end_time?: string | null;
  preference: ShiftPreference;
  note?: string;
};

const createShiftRequestResponseSchema = z.object({
  request: shiftRequestRowSchema,
});

export function createShiftRequest(
  input: CreateShiftRequestInput,
  signal?: AbortSignal,
): Promise<ShiftRequestRow> {
  return apiClient
    .post("/api/shift-requests", createShiftRequestResponseSchema, input, signal)
    .then((r) => r.request);
}

export function deleteShiftRequest(id: number, signal?: AbortSignal): Promise<void> {
  return apiClient
    .delete(`/api/shift-requests/${id}`, z.object({ ok: z.boolean() }), signal)
    .then(() => undefined);
}
