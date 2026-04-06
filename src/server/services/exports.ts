/**
 * Export service: build period work summary rows and serialize to CSV / xlsx.
 *
 * 集計ロジックは services/punches.ts (summarizeWorkPeriod) と lib/time.ts
 * (aggregatePunches) を再利用し、ここでは行構築とフォーマット変換のみを行う。
 */

import { and, asc, eq, gte, lte } from "drizzle-orm";
import ExcelJS from "exceljs";
import { db, schema } from "../db/client.js";
import { aggregatePunches, type PunchLike } from "../lib/time.js";

export interface BuildPeriodSummaryInput {
  /** 'YYYY-MM-DD' inclusive */
  from: string;
  /** 'YYYY-MM-DD' inclusive */
  to: string;
  /** 指定なしは全店舗 */
  store_id?: number;
}

export interface WorkDayRow {
  store_id: number;
  store_name: string;
  employee_id: number;
  employee_name: string;
  /** 'YYYY-MM-DD' */
  date: string;
  /** 'HH:MM' or '' */
  clock_in: string;
  /** 'HH:MM' or '' */
  clock_out: string;
  break_minutes: number;
  worked_minutes: number;
  /** '0:00' style */
  worked_hhmm: string;
  overtime_minutes: number;
  night_minutes: number;
  modified: boolean;
  note: string;
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function localDayStartMs(date: string): number {
  const [y, m, d] = date.split("-").map((x) => Number.parseInt(x, 10));
  return new Date(y, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0).getTime();
}

function fmtDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtHHMM(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function minutesToHHMM(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

const WEEKDAY_JA = ["日", "月", "火", "水", "木", "金", "土"];
function weekdayJa(date: string): string {
  const [y, m, d] = date.split("-").map((x) => Number.parseInt(x, 10));
  return WEEKDAY_JA[new Date(y, (m ?? 1) - 1, d ?? 1).getDay()] ?? "";
}

/**
 * 期間 [from, to] の従業員別日次サマリ行を構築する。
 *
 * - 集計は aggregatePunches を再利用 (lib/time.ts)
 * - セッションの「終了時刻 (clock_out)」が属する日に行を割り当てる
 *   (日跨ぎ勤務は退勤日に集計、summarizeWorkPeriod と同じ規則)
 * - 並び順: 店舗ID → 従業員ID → 日付昇順
 */
export function buildPeriodSummary(input: BuildPeriodSummaryInput): WorkDayRow[] {
  const fromMs = localDayStartMs(input.from);
  const toMsExclusive = localDayStartMs(input.to) + ONE_DAY_MS;
  const margin = ONE_DAY_MS;

  // 1. 対象店舗
  const storeRows = input.store_id
    ? db.select().from(schema.stores).where(eq(schema.stores.id, input.store_id)).all()
    : db.select().from(schema.stores).orderBy(asc(schema.stores.id)).all();
  const storeMap = new Map<number, string>(storeRows.map((s) => [s.id, s.name]));

  // 2. 対象従業員 (employee_stores 経由)
  type EmpStore = { employee_id: number; store_id: number; name: string };
  const empStores: EmpStore[] = [];
  for (const store of storeRows) {
    const rows = db
      .select({
        employee_id: schema.employees.id,
        name: schema.employees.name,
        store_id: schema.employeeStores.storeId,
      })
      .from(schema.employees)
      .innerJoin(schema.employeeStores, eq(schema.employeeStores.employeeId, schema.employees.id))
      .where(eq(schema.employeeStores.storeId, store.id))
      .orderBy(asc(schema.employees.id))
      .all();
    for (const r of rows) {
      empStores.push({
        employee_id: r.employee_id,
        store_id: r.store_id,
        name: r.name,
      });
    }
  }

  const out: WorkDayRow[] = [];

  for (const es of empStores) {
    // この従業員 × この店舗 の punches を期間+マージンで取得
    const conds = [
      eq(schema.timePunches.employeeId, es.employee_id),
      eq(schema.timePunches.storeId, es.store_id),
      gte(schema.timePunches.punchedAt, fromMs - margin),
      lte(schema.timePunches.punchedAt, toMsExclusive + margin),
    ];
    const punchRows = db
      .select()
      .from(schema.timePunches)
      .where(and(...conds))
      .orderBy(asc(schema.timePunches.punchedAt))
      .all();

    if (punchRows.length === 0) continue;

    const punches: PunchLike[] = punchRows.map((p) => ({
      punch_type: p.punchType as PunchLike["punch_type"],
      punched_at: p.punchedAt,
    }));
    const agg = aggregatePunches(punches);

    // セッションは end が [fromMs, toMsExclusive) にあるものだけ
    const inRange = agg.sessions.filter((s) => s.end >= fromMs && s.end < toMsExclusive);
    if (inRange.length === 0) continue;

    const hasCorrection = punchRows.some((p) => p.source === "correction");

    for (const s of inRange) {
      out.push({
        store_id: es.store_id,
        store_name: storeMap.get(es.store_id) ?? "",
        employee_id: es.employee_id,
        employee_name: es.name,
        date: fmtDate(s.end),
        clock_in: fmtHHMM(s.start),
        clock_out: fmtHHMM(s.end),
        break_minutes: s.break_minutes,
        worked_minutes: s.worked_minutes,
        worked_hhmm: minutesToHHMM(s.worked_minutes),
        overtime_minutes: s.overtime_minutes,
        night_minutes: s.night_minutes,
        modified: hasCorrection,
        note: "",
      });
    }
  }

  // 並び順: 店舗ID → 従業員ID → 日付
  out.sort((a, b) => {
    if (a.store_id !== b.store_id) return a.store_id - b.store_id;
    if (a.employee_id !== b.employee_id) return a.employee_id - b.employee_id;
    return a.date.localeCompare(b.date);
  });

  return out;
}

// ---------- CSV ----------

const HEADERS = [
  "店舗",
  "従業員ID",
  "氏名",
  "日付",
  "曜日",
  "出勤",
  "退勤",
  "休憩(分)",
  "実働(分)",
  "実働(時分)",
  "残業(分)",
  "深夜(分)",
  "修正フラグ",
  "備考",
] as const;

function csvEscape(v: string | number): string {
  const s = String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replaceAll('"', '""')}"`;
  }
  return s;
}

/** UTF-8 BOM + CRLF CSV を文字列で返す。 */
export function toCsv(rows: WorkDayRow[]): string {
  const lines: string[] = [];
  lines.push(HEADERS.map(csvEscape).join(","));
  for (const r of rows) {
    lines.push(
      [
        r.store_name,
        r.employee_id,
        r.employee_name,
        r.date,
        weekdayJa(r.date),
        r.clock_in,
        r.clock_out,
        r.break_minutes,
        r.worked_minutes,
        r.worked_hhmm,
        r.overtime_minutes,
        r.night_minutes,
        r.modified ? "修正" : "",
        r.note,
      ]
        .map(csvEscape)
        .join(","),
    );
  }
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

// ---------- xlsx ----------

const COLUMN_DEFS: Array<{ header: string; key: string; width: number }> = [
  { header: "店舗", key: "store", width: 12 },
  { header: "従業員ID", key: "employee_id", width: 8 },
  { header: "氏名", key: "name", width: 16 },
  { header: "日付", key: "date", width: 12 },
  { header: "曜日", key: "weekday", width: 5 },
  { header: "出勤", key: "clock_in", width: 8 },
  { header: "退勤", key: "clock_out", width: 8 },
  { header: "休憩(分)", key: "break", width: 8 },
  { header: "実働(分)", key: "worked", width: 8 },
  { header: "実働(時:分)", key: "worked_hhmm", width: 9 },
  { header: "残業(分)", key: "overtime", width: 8 },
  { header: "深夜(分)", key: "night", width: 8 },
  { header: "修正フラグ", key: "modified", width: 8 },
  { header: "備考", key: "note", width: 24 },
];

/** xlsx Buffer を返す。 */
export async function toXlsx(rows: WorkDayRow[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "hanare-timecard";
  wb.created = new Date();
  const ws = wb.addWorksheet("勤怠サマリ");

  ws.columns = COLUMN_DEFS.map((c) => ({
    header: c.header,
    key: c.key,
    width: c.width,
  }));

  // ヘッダー行スタイル
  const headerRow = ws.getRow(1);
  headerRow.font = { name: "游ゴシック", size: 11, bold: true };
  headerRow.alignment = { vertical: "middle", horizontal: "center" };
  headerRow.eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFEFE4D8" },
    };
    cell.border = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    };
  });

  // 1 行目固定
  ws.views = [{ state: "frozen", ySplit: 1 }];

  for (const r of rows) {
    const row = ws.addRow({
      store: r.store_name,
      employee_id: r.employee_id,
      name: r.employee_name,
      date: r.date,
      weekday: weekdayJa(r.date),
      clock_in: r.clock_in,
      clock_out: r.clock_out,
      break: r.break_minutes,
      worked: r.worked_minutes,
      worked_hhmm: r.worked_hhmm,
      overtime: r.overtime_minutes,
      night: r.night_minutes,
      modified: r.modified ? "修正" : "",
      note: r.note,
    });
    row.font = { name: "游ゴシック", size: 11 };
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

// ---------- ファイル名 ----------

/**
 * ファイル名 (拡張子なし) を生成する。
 *  例: hanare-雀庵-2026-04 / hanare-all-2026-04
 *  期間が同月でない場合は from..to 範囲で表現する。
 */
export function buildExportBasename(input: {
  from: string;
  to: string;
  store_id?: number;
}): string {
  let storePart = "all";
  if (input.store_id) {
    const s = db
      .select({ code: schema.stores.code, name: schema.stores.name })
      .from(schema.stores)
      .where(eq(schema.stores.id, input.store_id))
      .get();
    storePart = s?.code ?? `store${input.store_id}`;
  }
  const fromYM = input.from.slice(0, 7);
  const toYM = input.to.slice(0, 7);
  const range = fromYM === toYM ? fromYM : `${input.from}_${input.to}`;
  return `hanare-${storePart}-${range}`;
}
