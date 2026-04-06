/**
 * 打刻配列を日付ごとに畳み込み、日次サマリにする小ヘルパ。
 * サーバ側 services/punches.ts にも同等ロジックがあるが、
 * 履歴/週ビューを表示するためにクライアント側で整形する必要があるため最小限再実装する。
 *
 * - 1 日 1 勤務想定 (深夜またぎは出勤日に紐付ける)
 * - 同日内の break_start / break_end ペアを休憩として加算
 */

import type { PunchRow, PunchType } from "../api/punches";
import { formatHm, toYmd } from "./me-utils";

export type DailyPunchSummary = {
  date: string; // YYYY-MM-DD (出勤日)
  clock_in: number | null;
  clock_out: number | null;
  break_minutes: number;
  worked_minutes: number;
};

function dayKey(ms: number): string {
  return toYmd(new Date(ms));
}

/**
 * punches を出勤日 (clock_in がある日) ごとにまとめる。
 * clock_in が無く clock_out だけある日は無視。
 */
export function aggregateByDay(rows: PunchRow[]): DailyPunchSummary[] {
  // sort asc by punched_at
  const sorted = [...rows].sort((a, b) => a.punched_at - b.punched_at);

  type Group = {
    date: string;
    items: PunchRow[];
  };
  const groups: Group[] = [];
  let current: Group | null = null;

  for (const p of sorted) {
    if (p.punch_type === "clock_in") {
      // 新しい勤務日を開始
      const date = dayKey(p.punched_at);
      current = { date, items: [p] };
      groups.push(current);
    } else if (current != null) {
      // 連続する出勤区切りに付け足す (深夜またぎを考慮)
      current.items.push(p);
      if (p.punch_type === "clock_out") {
        current = null;
      }
    }
  }

  return groups.map(({ date, items }) => {
    let clockIn: number | null = null;
    let clockOut: number | null = null;
    let breakMin = 0;
    let lastBreakStart: number | null = null;

    for (const p of items) {
      const t = p.punch_type as PunchType;
      if (t === "clock_in") clockIn = p.punched_at;
      else if (t === "clock_out") clockOut = p.punched_at;
      else if (t === "break_start") lastBreakStart = p.punched_at;
      else if (t === "break_end" && lastBreakStart != null) {
        breakMin += Math.max(0, Math.round((p.punched_at - lastBreakStart) / 60000));
        lastBreakStart = null;
      }
    }

    const worked =
      clockIn != null && clockOut != null
        ? Math.max(0, Math.round((clockOut - clockIn) / 60000) - breakMin)
        : 0;

    return {
      date,
      clock_in: clockIn,
      clock_out: clockOut,
      break_minutes: breakMin,
      worked_minutes: worked,
    };
  });
}

export function formatRange(s: DailyPunchSummary): string {
  if (s.clock_in == null) return "";
  const start = formatHm(s.clock_in);
  const end = s.clock_out != null ? formatHm(s.clock_out) : "—";
  return `${start} 〜 ${end}`;
}
