import { z } from "zod";

// ---------- Primitive / shared pieces ----------

export const roleSchema = z.enum(["staff", "manager", "admin"]);

export const punchTypeSchema = z.enum(["clock_in", "clock_out", "break_start", "break_end"]);

export const punchSourceSchema = z.enum(["kiosk", "admin", "correction"]);

export const shiftStatusSchema = z.enum(["draft", "published"]);

export const correctionStatusSchema = z.enum(["pending", "approved", "rejected"]);

export const shiftPreferenceSchema = z.enum(["available", "preferred", "unavailable"]);

export const workStateSchema = z.enum(["off", "working", "on_break"]);

/** 'YYYY-MM-DD' */
export const dateStringSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, "date must be YYYY-MM-DD");

/** 'HH:MM' (24h) */
export const timeStringSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/u, "time must be HH:MM");

/** 4–6 digit PIN */
export const pinSchema = z.string().regex(/^[0-9]{4,6}$/u, "pin must be 4-6 digits");

/** unix ms */
export const unixMsSchema = z.number().int().nonnegative();

export const idSchema = z.number().int().positive();

// ---------- Auth ----------

export const pinLoginSchema = z.object({
  employee_id: idSchema,
  pin: pinSchema,
});

export const adminLoginSchema = z.object({
  login_id: z.string().min(1).max(64),
  password: z.string().min(1).max(256),
});

// ---------- Stores ----------

const weekdayIntSchema = z.number().int().min(0).max(6);

export const createStoreSchema = z.object({
  code: z.string().min(1).max(32),
  name: z.string().min(1).max(64),
  display_name: z.string().min(1).max(128),
  opening_time: timeStringSchema,
  closing_time: timeStringSchema,
  closed_days: z.array(weekdayIntSchema).optional(),
});

export const updateStoreSchema = createStoreSchema.partial();

// ---------- Employees ----------

export const createEmployeeSchema = z
  .object({
    name: z.string().min(1).max(64),
    kana: z.string().min(1).max(128),
    role: roleSchema,
    login_id: z.string().min(1).max(64).optional(),
    password: z.string().min(8).max(256).optional(),
    pin: pinSchema,
    hourly_wage: z.number().int().nonnegative().default(0),
    hire_date: dateStringSchema,
    store_ids: z.array(idSchema).min(1),
    primary_store_id: idSchema.optional(),
    note: z.string().max(1024).optional(),
  })
  .refine(
    (v) => v.role === "staff" || (typeof v.login_id === "string" && typeof v.password === "string"),
    {
      message: "manager/admin requires login_id and password",
      path: ["login_id"],
    },
  );

export const updateEmployeeSchema = z.object({
  name: z.string().min(1).max(64).optional(),
  kana: z.string().min(1).max(128).optional(),
  role: roleSchema.optional(),
  login_id: z.string().min(1).max(64).nullable().optional(),
  password: z.string().min(8).max(256).optional(),
  hourly_wage: z.number().int().nonnegative().optional(),
  hire_date: dateStringSchema.optional(),
  retire_date: dateStringSchema.nullable().optional(),
  store_ids: z.array(idSchema).min(1).optional(),
  primary_store_id: idSchema.optional(),
  note: z.string().max(1024).nullable().optional(),
});

export const resetPinSchema = z.object({
  pin: pinSchema,
});

export const retireEmployeeSchema = z.object({
  retire_date: dateStringSchema,
});

export const listEmployeesQuerySchema = z.object({
  store_id: z.coerce.number().int().positive().optional(),
  include_retired: z
    .union([z.literal("true"), z.literal("false"), z.boolean()])
    .transform((v) => v === true || v === "true")
    .optional(),
});

// ---------- Time Punches ----------

export const createPunchSchema = z.object({
  punch_type: punchTypeSchema,
  store_id: idSchema,
  note: z.string().max(256).optional(),
});

export const listPunchesQuerySchema = z.object({
  store_id: z.coerce.number().int().positive().optional(),
  employee_id: z.coerce.number().int().positive().optional(),
  from: dateStringSchema.optional(),
  to: dateStringSchema.optional(),
});

export const myPunchesQuerySchema = z.object({
  from: dateStringSchema.optional(),
  to: dateStringSchema.optional(),
});

// ---------- Shifts ----------

const shiftTimeRefinement = <T extends { start_time?: string; end_time?: string }>(v: T) => {
  if (v.start_time && v.end_time) {
    return v.start_time < v.end_time;
  }
  return true;
};

export const createShiftSchema = z
  .object({
    employee_id: idSchema,
    store_id: idSchema,
    date: dateStringSchema,
    start_time: timeStringSchema,
    end_time: timeStringSchema,
  })
  .refine(shiftTimeRefinement, {
    message: "start_time must be before end_time",
    path: ["end_time"],
  });

export const updateShiftSchema = z
  .object({
    employee_id: idSchema.optional(),
    store_id: idSchema.optional(),
    date: dateStringSchema.optional(),
    start_time: timeStringSchema.optional(),
    end_time: timeStringSchema.optional(),
    status: shiftStatusSchema.optional(),
  })
  .refine(shiftTimeRefinement, {
    message: "start_time must be before end_time",
    path: ["end_time"],
  });

export const publishShiftSchema = z
  .object({
    store_id: idSchema,
    from: dateStringSchema,
    to: dateStringSchema,
  })
  .refine((v) => v.from <= v.to, {
    message: "from must be <= to",
    path: ["to"],
  });

export const listShiftsQuerySchema = z.object({
  store_id: z.coerce.number().int().positive().optional(),
  from: dateStringSchema.optional(),
  to: dateStringSchema.optional(),
  status: shiftStatusSchema.optional(),
});

export const shiftConflictsQuerySchema = z.object({
  store_id: z.coerce.number().int().positive(),
  from: dateStringSchema,
  to: dateStringSchema,
});

// ---------- Shift Requests ----------

export const createShiftRequestSchema = z
  .object({
    date: dateStringSchema,
    start_time: timeStringSchema.nullable().optional(),
    end_time: timeStringSchema.nullable().optional(),
    preference: shiftPreferenceSchema,
    note: z.string().max(512).optional(),
  })
  .refine(
    (v) => {
      if (v.start_time && v.end_time) return v.start_time < v.end_time;
      // both null/undefined is allowed (= all day)
      return (
        (v.start_time == null && v.end_time == null) || (v.start_time != null && v.end_time != null)
      );
    },
    {
      message: "start_time and end_time must both be set or both be empty",
      path: ["end_time"],
    },
  );

export const listShiftRequestsQuerySchema = z.object({
  from: dateStringSchema.optional(),
  to: dateStringSchema.optional(),
});

// ---------- Correction Requests ----------

export const createCorrectionSchema = z.object({
  target_punch_id: idSchema.nullable().optional(),
  target_date: dateStringSchema,
  requested_value: unixMsSchema.nullable().optional(),
  requested_type: punchTypeSchema.nullable().optional(),
  reason: z.string().min(1).max(1024),
});

export const approveCorrectionSchema = z.object({
  review_comment: z.string().max(1024).optional(),
});

export const rejectCorrectionSchema = z.object({
  review_comment: z.string().min(1).max(1024),
});

/** alias to match ticket naming */
export const reviewCorrectionSchema = z.object({
  action: z.enum(["approve", "reject"]),
  review_comment: z.string().max(1024).optional(),
});

export const listCorrectionsQuerySchema = z.object({
  status: correctionStatusSchema.optional(),
  store_id: z.coerce.number().int().positive().optional(),
});

// ---------- Exports ----------

export const exportQuerySchema = z
  .object({
    from: dateStringSchema,
    to: dateStringSchema,
    store_id: z.coerce.number().int().positive().optional(),
  })
  .refine((v) => v.from <= v.to, {
    message: "from must be <= to",
    path: ["to"],
  });

// ---------- Audit ----------

export const listAuditQuerySchema = z.object({
  from: dateStringSchema.optional(),
  to: dateStringSchema.optional(),
  actor_id: z.coerce.number().int().positive().optional(),
  action: z.string().min(1).max(64).optional(),
  limit: z.coerce.number().int().positive().max(500).optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
});
