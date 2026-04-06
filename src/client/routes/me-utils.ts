/**
 * 共通フォーマッタ (E01-E05)。
 */

const WEEKDAYS_JP = ["日", "月", "火", "水", "木", "金", "土"];

export function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function toYmd(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function fromYmd(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map((s) => Number.parseInt(s, 10));
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

/**
 * unix ms → "HH:MM"
 */
export function formatHm(ms: number): string {
  const d = new Date(ms);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/**
 * unix ms → "YYYY-MM-DD"
 */
export function formatYmdMs(ms: number): string {
  return toYmd(new Date(ms));
}

/**
 * 分 → "H時間M分"
 */
export function formatMinutes(min: number): { hours: string; minutes: string } {
  const sign = min < 0 ? -1 : 1;
  const abs = Math.abs(Math.round(min));
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return {
    hours: `${sign < 0 ? "-" : ""}${h}`,
    minutes: pad2(m),
  };
}

export function jpWeekday(date: Date): string {
  return WEEKDAYS_JP[date.getDay()] ?? "";
}

/**
 * 当該日 (date) を含む週 (日曜始まり) の Date[7]。
 */
export function weekDays(anchor: Date): Date[] {
  const start = new Date(anchor);
  start.setDate(start.getDate() - start.getDay());
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d;
  });
}

/**
 * 当該月の月曆 6 行 × 7 列 (前後月のはみ出しを含む)。
 */
export function monthCalendarDays(anchor: Date): Date[] {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const startWeekday = first.getDay();
  const start = new Date(first);
  start.setDate(start.getDate() - startWeekday);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d;
  });
}

/**
 * date 文字列 (YYYY-MM-DD) を "M/D (曜)" にする
 */
export function shortDate(ymd: string): { md: string; weekday: string } {
  const d = fromYmd(ymd);
  return { md: `${d.getMonth() + 1}/${d.getDate()}`, weekday: jpWeekday(d) };
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

export function addMonths(date: Date, n: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + n);
  return d;
}

export function isSameYmd(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
