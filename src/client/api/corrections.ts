import { z } from "zod";
import { apiClient } from "./client";
import { punchTypeSchema } from "./punches";

export const correctionStatusSchema = z.enum(["pending", "approved", "rejected"]);
export type CorrectionStatus = z.infer<typeof correctionStatusSchema>;

export const correctionRowSchema = z.object({
  id: z.number(),
  employee_id: z.number(),
  store_id: z.number(),
  target_punch_id: z.number().nullable(),
  target_date: z.string(),
  requested_value: z.number().nullable(),
  requested_type: punchTypeSchema.nullable(),
  reason: z.string(),
  status: correctionStatusSchema,
  reviewer_id: z.number().nullable(),
  reviewed_at: z.number().nullable(),
  review_comment: z.string().nullable(),
  created_at: z.number(),
});

export type CorrectionRow = z.infer<typeof correctionRowSchema>;

const myCorrectionsResponseSchema = z.object({
  corrections: z.array(correctionRowSchema),
});

export function fetchMyCorrections(signal?: AbortSignal): Promise<CorrectionRow[]> {
  return apiClient
    .get("/api/corrections/me", myCorrectionsResponseSchema, signal)
    .then((r) => r.corrections);
}

export const createCorrectionInputSchema = z.object({
  store_id: z.number().nullable().optional(),
  target_punch_id: z.number().nullable().optional(),
  target_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  requested_value: z.number().nullable().optional(),
  requested_type: punchTypeSchema.nullable().optional(),
  reason: z.string().min(1).max(1024),
});

export type CreateCorrectionInput = z.infer<typeof createCorrectionInputSchema>;

const createCorrectionResponseSchema = z.object({
  correction: correctionRowSchema,
});

export function createCorrection(
  input: CreateCorrectionInput,
  signal?: AbortSignal,
): Promise<CorrectionRow> {
  return apiClient
    .post("/api/corrections", createCorrectionResponseSchema, input, signal)
    .then((r) => r.correction);
}
