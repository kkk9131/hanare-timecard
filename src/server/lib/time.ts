/**
 * 集計用の純関数群。DB に依存しない。
 *
 * 仕様 (data-model.md / task-4003):
 * - 1 勤務 = `clock_in` から次の `clock_out` まで（日跨ぎ可）
 * - 休憩 = 同一勤務内の `break_start` ～ `break_end` の合計
 * - worked_minutes = (退勤 - 出勤) - 休憩
 * - 残業 = 8 時間 (480 分) を超えた分
 * - 深夜 = 22:00–05:00 に該当する分
 * - 異常データ (clock_in 後 24h 以上 clock_out なし) は集計から除外
 * - すべて分単位整数
 */

export type PunchType = "clock_in" | "clock_out" | "break_start" | "break_end";

export interface PunchLike {
  punch_type: PunchType;
  /** unix ms */
  punched_at: number;
}

export interface WorkSession {
  start: number;
  end: number;
  worked_minutes: number;
  break_minutes: number;
  overtime_minutes: number;
  night_minutes: number;
}

export interface AggregationResult {
  worked: number;
  break: number;
  overtime: number;
  night: number;
  sessions: WorkSession[];
  warnings: Array<{ code: string; message: string; punch_id_hint?: number }>;
}

const ONE_MINUTE_MS = 60_000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const OVERTIME_THRESHOLD_MIN = 480;

/** Floor division to whole minutes. */
export function minutesBetween(startMs: number, endMs: number): number {
  if (endMs <= startMs) return 0;
  return Math.floor((endMs - startMs) / ONE_MINUTE_MS);
}

/**
 * 区間 [startMs, endMs) のうち、22:00–翌05:00 (ローカルタイム) に該当する分数を返す。
 * 日跨ぎの場合は両日のそれぞれの「夜帯」と重なる時間を合計する。
 */
export function splitNightMinutes(startMs: number, endMs: number): number {
  if (endMs <= startMs) return 0;

  let total = 0;
  // 区間が長い場合に備え、各カレンダー日 (start のローカル日付) ごとに
  // 「その日の夜帯 22:00 — 翌 05:00」 と重なる部分を加算する。
  // 開始日の前日扱いも考慮するため、開始日 -1 から終了日 +1 まで日ベースで走査する。
  const start = new Date(startMs);
  const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime();

  // 走査範囲: 区間長 / 1day を切り上げ + 2（前後 1 日のマージン）
  const dayCount = Math.ceil((endMs - startMs) / ONE_DAY_MS) + 2;

  for (let i = -1; i < dayCount; i++) {
    const dayStart = startDay + i * ONE_DAY_MS;
    // 夜帯 1: その日 22:00 〜 翌 05:00
    const nightStart = dayStart + 22 * 60 * ONE_MINUTE_MS;
    const nightEnd = dayStart + (24 + 5) * 60 * ONE_MINUTE_MS;

    const overlapStart = Math.max(startMs, nightStart);
    const overlapEnd = Math.min(endMs, nightEnd);
    if (overlapEnd > overlapStart) {
      total += Math.floor((overlapEnd - overlapStart) / ONE_MINUTE_MS);
    }
  }
  return total;
}

/** 残業 = 480 分を超えた分。 */
export function computeOvertime(workedMinutes: number): number {
  return Math.max(0, workedMinutes - OVERTIME_THRESHOLD_MIN);
}

/**
 * 打刻列を勤務単位に分割し、集計する。
 *
 * - 打刻は punched_at 昇順で渡されることを想定（未ソートなら内部でソート）。
 * - clock_in が来たら新セッション開始。
 * - 同一セッション中の break_start / break_end 対は休憩時間として加算。
 * - clock_out が来たらセッション確定。
 * - clock_in のみで 24h 以上 clock_out が無いセッションは破棄して warning。
 * - clock_out が孤立 (前に clock_in 無し) は warning。
 * - 二重 clock_in は warning + 直前セッションを破棄。
 */
export function aggregatePunches(punches: PunchLike[]): AggregationResult {
  const sorted = [...punches].sort((a, b) => a.punched_at - b.punched_at);

  const sessions: WorkSession[] = [];
  const warnings: AggregationResult["warnings"] = [];

  let curStart: number | null = null;
  let curBreakStart: number | null = null;
  let curBreakTotalMs = 0;

  const flushIncomplete = (reason: string) => {
    if (curStart != null) {
      warnings.push({ code: "incomplete_session", message: reason });
    }
    curStart = null;
    curBreakStart = null;
    curBreakTotalMs = 0;
  };

  for (const p of sorted) {
    switch (p.punch_type) {
      case "clock_in": {
        if (curStart != null) {
          flushIncomplete("clock_in が連続しました（前のセッションを破棄）");
        }
        curStart = p.punched_at;
        curBreakStart = null;
        curBreakTotalMs = 0;
        break;
      }
      case "clock_out": {
        if (curStart == null) {
          warnings.push({
            code: "orphan_clock_out",
            message: "clock_in に対応しない clock_out があります",
          });
          break;
        }
        const start = curStart;
        const end = p.punched_at;

        // 24h 超過は異常とみなし破棄
        if (end - start >= ONE_DAY_MS) {
          warnings.push({
            code: "session_too_long",
            message: "勤務時間が 24 時間を超えたため集計から除外しました",
          });
          curStart = null;
          curBreakStart = null;
          curBreakTotalMs = 0;
          break;
        }

        // 開きっぱなしの休憩は無視
        if (curBreakStart != null) {
          warnings.push({
            code: "unfinished_break",
            message: "休憩終了が無い休憩があります（除外）",
          });
        }

        const grossMin = minutesBetween(start, end);
        const breakMin = Math.floor(curBreakTotalMs / ONE_MINUTE_MS);
        const workedMin = Math.max(0, grossMin - breakMin);
        const overtimeMin = computeOvertime(workedMin);
        const nightMin = splitNightMinutes(start, end);

        sessions.push({
          start,
          end,
          worked_minutes: workedMin,
          break_minutes: breakMin,
          overtime_minutes: overtimeMin,
          night_minutes: nightMin,
        });

        curStart = null;
        curBreakStart = null;
        curBreakTotalMs = 0;
        break;
      }
      case "break_start": {
        if (curStart == null) {
          warnings.push({
            code: "orphan_break_start",
            message: "勤務外の休憩開始があります",
          });
          break;
        }
        if (curBreakStart != null) {
          warnings.push({
            code: "double_break_start",
            message: "休憩開始が連続しました",
          });
          break;
        }
        curBreakStart = p.punched_at;
        break;
      }
      case "break_end": {
        if (curStart == null || curBreakStart == null) {
          warnings.push({
            code: "orphan_break_end",
            message: "対応する休憩開始がありません",
          });
          break;
        }
        const dur = Math.max(0, p.punched_at - curBreakStart);
        curBreakTotalMs += dur;
        curBreakStart = null;
        break;
      }
    }
  }

  // 末尾に未完了セッションが残っている場合
  if (curStart != null) {
    warnings.push({
      code: "open_session",
      message: "未退勤の勤務があります（集計外）",
    });
  }

  const totals = sessions.reduce(
    (acc, s) => ({
      worked: acc.worked + s.worked_minutes,
      break: acc.break + s.break_minutes,
      overtime: acc.overtime + s.overtime_minutes,
      night: acc.night + s.night_minutes,
    }),
    { worked: 0, break: 0, overtime: 0, night: 0 },
  );

  return { ...totals, sessions, warnings };
}
