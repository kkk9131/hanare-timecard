import { and, asc, desc, eq, gte, lte } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { aggregatePunches, type PunchType } from "../lib/time.js";

export type WorkState = "off" | "working" | "on_break";

export interface PunchRow {
  id: number;
  employee_id: number;
  store_id: number;
  punch_type: PunchType;
  punched_at: number;
  source: "kiosk" | "admin" | "correction";
  note: string | null;
  created_at: number;
}

function toPunchRow(r: typeof schema.timePunches.$inferSelect): PunchRow {
  return {
    id: r.id,
    employee_id: r.employeeId,
    store_id: r.storeId,
    punch_type: r.punchType as PunchType,
    punched_at: r.punchedAt,
    source: r.source as PunchRow["source"],
    note: r.note,
    created_at: r.createdAt,
  };
}

/**
 * 直近の打刻から現在状態を導出する。
 *
 * - 最後が clock_in   → working
 * - 最後が break_start → on_break
 * - 最後が break_end  → working
 * - 最後が clock_out  → off
 * - 打刻なし          → off
 */
export function getCurrentState(employeeId: number): {
  state: WorkState;
  last_punch: PunchRow | null;
} {
  const last = db
    .select()
    .from(schema.timePunches)
    .where(eq(schema.timePunches.employeeId, employeeId))
    .orderBy(desc(schema.timePunches.punchedAt))
    .limit(1)
    .get();

  if (!last) return { state: "off", last_punch: null };

  const lp = toPunchRow(last);
  switch (lp.punch_type) {
    case "clock_in":
    case "break_end":
      return { state: "working", last_punch: lp };
    case "break_start":
      return { state: "on_break", last_punch: lp };
    case "clock_out":
      return { state: "off", last_punch: lp };
  }
}

const ALLOWED_TRANSITIONS: Record<WorkState, PunchType[]> = {
  off: ["clock_in"],
  working: ["clock_out", "break_start"],
  on_break: ["break_end"],
};

export interface CreatePunchInput {
  employee_id: number;
  store_id: number;
  punch_type: PunchType;
  note?: string;
  source?: PunchRow["source"];
  /** Override server time for tests. Defaults to Date.now(). */
  now?: number;
}

export type CreatePunchResult =
  | { kind: "ok"; punch: PunchRow; next_state: WorkState; message: string }
  | { kind: "invalid_transition"; current_state: WorkState };

/**
 * 状態遷移を検証して打刻を 1 件挿入する。
 * 連続同種打刻 / 不正な遷移は invalid_transition を返す（HTTP では 409）。
 */
export function createPunch(input: CreatePunchInput): CreatePunchResult {
  const now = input.now ?? Date.now();
  const { state } = getCurrentState(input.employee_id);

  const allowed = ALLOWED_TRANSITIONS[state];
  if (!allowed.includes(input.punch_type)) {
    return { kind: "invalid_transition", current_state: state };
  }

  const inserted = db
    .insert(schema.timePunches)
    .values({
      employeeId: input.employee_id,
      storeId: input.store_id,
      punchType: input.punch_type,
      punchedAt: now,
      source: input.source ?? "kiosk",
      note: input.note ?? null,
      createdAt: now,
    })
    .returning()
    .get();

  const punch = toPunchRow(inserted);
  const nextState = nextStateAfter(input.punch_type);
  const message = buildMessage(input.employee_id, input.punch_type, now);
  return { kind: "ok", punch, next_state: nextState, message };
}

function nextStateAfter(t: PunchType): WorkState {
  switch (t) {
    case "clock_in":
      return "working";
    case "break_start":
      return "on_break";
    case "break_end":
      return "working";
    case "clock_out":
      return "off";
  }
}

function formatHHMM(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function buildMessage(employeeId: number, t: PunchType, ts: number): string {
  const emp = db
    .select({ name: schema.employees.name })
    .from(schema.employees)
    .where(eq(schema.employees.id, employeeId))
    .get();
  const name = emp?.name ?? "";
  const hhmm = formatHHMM(ts);
  switch (t) {
    case "clock_in":
      return `${name}さん、お疲れさまです。出勤を記録しました（${hhmm}）`;
    case "clock_out":
      return `${name}さん、本日もありがとうございました。退勤を記録しました（${hhmm}）`;
    case "break_start":
      return `${name}さん、休憩に入ります（${hhmm}）`;
    case "break_end":
      return `${name}さん、休憩終了を記録しました（${hhmm}）`;
  }
}

/**
 * 期間 [fromMs, toMs) の打刻を取得する。
 * from / to が undefined の場合は無制限。
 */
export interface ListPunchesQuery {
  employee_id?: number;
  store_id?: number;
  /** unix ms inclusive */
  from?: number;
  /** unix ms exclusive */
  to?: number;
}

export function listPunches(q: ListPunchesQuery): PunchRow[] {
  const conds = [] as Array<ReturnType<typeof eq>>;
  if (q.employee_id != null) conds.push(eq(schema.timePunches.employeeId, q.employee_id));
  if (q.store_id != null) conds.push(eq(schema.timePunches.storeId, q.store_id));
  if (q.from != null) conds.push(gte(schema.timePunches.punchedAt, q.from));
  if (q.to != null) conds.push(lte(schema.timePunches.punchedAt, q.to));

  const where = conds.length === 0 ? undefined : conds.length === 1 ? conds[0] : and(...conds);

  const rows = db
    .select()
    .from(schema.timePunches)
    .where(where)
    .orderBy(asc(schema.timePunches.punchedAt))
    .all();

  return rows.map(toPunchRow);
}

/**
 * 自分の打刻履歴。日付文字列 'YYYY-MM-DD' を受ける UI 互換ヘルパ。
 */
export function listMyPunches(employeeId: number, fromDate?: string, toDate?: string): PunchRow[] {
  const from = fromDate ? localDayStartMs(fromDate) : undefined;
  const to = toDate ? localDayStartMs(toDate) + 24 * 60 * 60 * 1000 : undefined;
  return listPunches({ employee_id: employeeId, from, to });
}

/**
 * 期間集計。fromDate/toDate は 'YYYY-MM-DD'（ローカル）。
 */
export function summarizeWorkPeriod(
  employeeId: number,
  fromDate: string,
  toDate: string,
): { worked: number; break: number; overtime: number; night: number } {
  const from = localDayStartMs(fromDate);
  const to = localDayStartMs(toDate) + 24 * 60 * 60 * 1000;
  // 1 つ前の打刻が clock_in などで日跨ぎしている可能性があるため、
  // 前後 1 日分のマージンを取って取得する。
  const margin = 24 * 60 * 60 * 1000;
  const punches = listPunches({
    employee_id: employeeId,
    from: from - margin,
    to: to + margin,
  });

  const result = aggregatePunches(
    punches.map((p) => ({
      punch_type: p.punch_type,
      punched_at: p.punched_at,
    })),
  );

  // セッションの終了時刻が集計範囲内のもののみカウント
  const inRange = result.sessions.filter((s) => s.end >= from && s.end < to);
  return inRange.reduce(
    (acc, s) => ({
      worked: acc.worked + s.worked_minutes,
      break: acc.break + s.break_minutes,
      overtime: acc.overtime + s.overtime_minutes,
      night: acc.night + s.night_minutes,
    }),
    { worked: 0, break: 0, overtime: 0, night: 0 },
  );
}

/** 当月集計 (1 日 〜 末日)。 */
export function summarizeCurrentMonth(
  employeeId: number,
  now: number = Date.now(),
): { worked: number; break: number; overtime: number; night: number } {
  const d = new Date(now);
  const y = d.getFullYear();
  const m = d.getMonth();
  const first = new Date(y, m, 1);
  const last = new Date(y, m + 1, 0);
  const fmt = (dt: Date) =>
    `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
  return summarizeWorkPeriod(employeeId, fmt(first), fmt(last));
}

/** 'YYYY-MM-DD' (ローカル) → その日の 00:00 (ローカル) の unix ms */
function localDayStartMs(date: string): number {
  const [y, m, d] = date.split("-").map((x) => Number.parseInt(x, 10));
  return new Date(y, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0).getTime();
}
