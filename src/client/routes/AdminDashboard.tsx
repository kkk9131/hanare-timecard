import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  type Correction,
  type Employee,
  listCorrections,
  listEmployees,
  listPunches,
  listShifts,
  listStores,
  type Punch,
  type Shift,
  type Store,
} from "../api/admin";
import { type StoreFilter, StoreSwitcher } from "../components/StoreSwitcher";
import { Heading } from "../components/ui/Heading";
import { Stack } from "../components/ui/Stack";
import { StatePill } from "../components/ui/StatePill";
import { WashiCard } from "../components/ui/WashiCard";
import "./AdminDashboard.css";

// ---------- date helpers ----------

function todayISO(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfWeekISO(d = new Date()): string {
  const dt = new Date(d);
  // 月曜起算: getDay() 0=Sun..6=Sat
  const dow = (dt.getDay() + 6) % 7; // 月曜=0
  dt.setDate(dt.getDate() - dow);
  return todayISO(dt);
}

function endOfWeekISO(d = new Date()): string {
  const dt = new Date(d);
  const dow = (dt.getDay() + 6) % 7;
  dt.setDate(dt.getDate() - dow + 6);
  return todayISO(dt);
}

// ---------- punches → working / on_break counts (per employee) ----------

type WorkState = "off" | "working" | "on_break";

function computeStateByEmployee(punches: Punch[]): Map<number, WorkState> {
  // 当日打刻のうち、employee ごとに最終打刻を取得して状態を決める
  const sorted = [...punches].sort((a, b) => a.punched_at - b.punched_at);
  const lastByEmp = new Map<number, Punch>();
  for (const p of sorted) {
    lastByEmp.set(p.employee_id, p);
  }
  const stateByEmp = new Map<number, WorkState>();
  for (const [emp, p] of lastByEmp) {
    let s: WorkState = "off";
    switch (p.punch_type) {
      case "clock_in":
      case "break_end":
        s = "working";
        break;
      case "break_start":
        s = "on_break";
        break;
      case "clock_out":
        s = "off";
        break;
    }
    stateByEmp.set(emp, s);
  }
  return stateByEmp;
}

// ---------- shift coverage ----------

function shiftCoverage(
  shifts: Shift[],
  from: string,
  to: string,
): {
  publishedCount: number;
  totalSlots: number;
  coverageRate: number;
} {
  const published = shifts.filter((s) => s.status === "published");
  // 当週の日数 (from..to inclusive)
  const days = Math.round((Date.parse(to) - Date.parse(from)) / (1000 * 60 * 60 * 24)) + 1;
  // 概算: 各日 1 枠以上あれば充足とみなす
  const datesCovered = new Set(published.map((s) => s.date));
  const coverageRate = days > 0 ? datesCovered.size / days : 0;
  return {
    publishedCount: published.length,
    totalSlots: days,
    coverageRate,
  };
}

// ---------- main ----------

export function AdminDashboardPage() {
  const [storeFilter, setStoreFilter] = useState<StoreFilter>("all");

  const storesQuery = useQuery<Store[]>({
    queryKey: ["stores"],
    queryFn: ({ signal }) => listStores(signal),
    staleTime: 60_000,
  });

  const today = todayISO();
  const weekFrom = startOfWeekISO();
  const weekTo = endOfWeekISO();

  const storeIdQuery = storeFilter === "all" ? undefined : storeFilter;

  const punchesQuery = useQuery<Punch[]>({
    queryKey: ["punches", "today", storeIdQuery],
    queryFn: ({ signal }) =>
      listPunches({ from: today, to: today, store_id: storeIdQuery }, signal),
    refetchInterval: 30_000,
  });

  const employeesQuery = useQuery<Employee[]>({
    queryKey: ["employees", storeIdQuery],
    queryFn: ({ signal }) => listEmployees({ store_id: storeIdQuery }, signal),
    staleTime: 60_000,
  });

  const correctionsQuery = useQuery<Correction[]>({
    queryKey: ["corrections", "pending", storeIdQuery],
    queryFn: ({ signal }) => listCorrections({ status: "pending", store_id: storeIdQuery }, signal),
  });

  const shiftsQuery = useQuery<Shift[]>({
    queryKey: ["shifts", "thisweek", storeIdQuery],
    queryFn: ({ signal }) =>
      listShifts({ from: weekFrom, to: weekTo, store_id: storeIdQuery }, signal),
  });

  const stateByEmp = useMemo(
    () => (punchesQuery.data ? computeStateByEmployee(punchesQuery.data) : new Map()),
    [punchesQuery.data],
  );

  const workingCount = useMemo(() => {
    let n = 0;
    for (const s of stateByEmp.values()) if (s === "working") n++;
    return n;
  }, [stateByEmp]);

  const workingEmployees = useMemo(() => {
    if (!punchesQuery.data || !employeesQuery.data) return [];
    const empById = new Map(employeesQuery.data.map((e) => [e.id, e]));
    // 各従業員の当日最初の clock_in 時刻
    const firstClockInByEmp = new Map<number, number>();
    for (const p of [...punchesQuery.data].sort((a, b) => a.punched_at - b.punched_at)) {
      if (p.punch_type === "clock_in" && !firstClockInByEmp.has(p.employee_id)) {
        firstClockInByEmp.set(p.employee_id, p.punched_at);
      }
    }
    const rows: { id: number; name: string; startedAt: number }[] = [];
    for (const [empId, state] of stateByEmp) {
      if (state !== "working" && state !== "on_break") continue;
      const emp = empById.get(empId);
      const startedAt = firstClockInByEmp.get(empId);
      if (!emp || startedAt == null) continue;
      rows.push({ id: empId, name: emp.name, startedAt });
    }
    rows.sort((a, b) => a.startedAt - b.startedAt);
    return rows;
  }, [punchesQuery.data, employeesQuery.data, stateByEmp]);

  const onBreakCount = useMemo(() => {
    let n = 0;
    for (const s of stateByEmp.values()) if (s === "on_break") n++;
    return n;
  }, [stateByEmp]);

  const pendingCorrectionsCount = correctionsQuery.data?.length ?? 0;

  const coverage = useMemo(
    () =>
      shiftsQuery.data
        ? shiftCoverage(shiftsQuery.data, weekFrom, weekTo)
        : { publishedCount: 0, totalSlots: 0, coverageRate: 0 },
    [shiftsQuery.data, weekFrom, weekTo],
  );

  const stores = storesQuery.data ?? [];

  return (
    <div className="wa-dash">
      <header className="wa-dash__header">
        <div>
          <Heading level={1} eyebrow="DASHBOARD">
            店舗ダッシュボード
          </Heading>
          <p className="wa-dash__date">
            {new Date().toLocaleDateString("ja-JP", {
              year: "numeric",
              month: "long",
              day: "numeric",
              weekday: "long",
            })}
          </p>
        </div>
        <div className="wa-dash__switcher">
          {storesQuery.isLoading ? (
            <span className="wa-dash__loading">店舗情報を読み込み中…</span>
          ) : storesQuery.isError ? (
            <span className="wa-dash__error">店舗情報の取得に失敗しました。</span>
          ) : (
            <StoreSwitcher stores={stores} value={storeFilter} onChange={setStoreFilter} />
          )}
        </div>
      </header>

      <section className="wa-dash__grid">
        {/* --- 出勤中 ---------------------------------------------------- */}
        <WashiCard
          highlight
          padding="lg"
          eyebrow="今この瞬間"
          title="現在勤務中"
          action={
            <StatePill
              tone={workingCount > 0 ? "success" : "neutral"}
              label={workingCount > 0 ? "営業中" : "待機"}
            />
          }
        >
          <Stack gap={3}>
            <div className="wa-dash__metric" role="img" aria-label={`出勤中 ${workingCount} 名`}>
              <span className="wa-dash__big tnum">
                {punchesQuery.isLoading ? "—" : workingCount}
              </span>
              <span className="wa-dash__unit">名</span>
            </div>
            <p className="wa-dash__meta">
              うち休憩中{" "}
              <span className="tnum wa-dash__inlineNum">
                {punchesQuery.isLoading ? "—" : onBreakCount}
              </span>{" "}
              名
            </p>
            {punchesQuery.isError ? (
              <p className="wa-dash__cardError">
                打刻の取得に失敗しました。再読み込みをお試しください。
              </p>
            ) : null}
            {workingEmployees.length > 0 ? (
              <ul className="wa-dash__workingList">
                {workingEmployees.map((w) => (
                  <li key={w.id} className="wa-dash__workingItem">
                    <span className="wa-dash__workingName">{w.name}</span>
                    <span className="tnum wa-dash__workingTime">
                      {new Date(w.startedAt).toLocaleTimeString("ja-JP", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      {" 出勤"}
                    </span>
                  </li>
                ))}
              </ul>
            ) : punchesQuery.isLoading || employeesQuery.isLoading ? null : (
              <p className="wa-dash__meta">現在勤務中の従業員はいません。</p>
            )}
          </Stack>
        </WashiCard>

        {/* --- 未処理修正申請 ------------------------------------------- */}
        <WashiCard
          padding="lg"
          eyebrow="要対応"
          title="未処理の修正申請"
          action={
            <StatePill
              tone={pendingCorrectionsCount > 0 ? "danger" : "neutral"}
              label={pendingCorrectionsCount > 0 ? "確認待ち" : "なし"}
            />
          }
        >
          <Stack gap={3}>
            <div className="wa-dash__metric">
              <span className="wa-dash__big tnum">
                {correctionsQuery.isLoading ? "—" : pendingCorrectionsCount}
              </span>
              <span className="wa-dash__unit">件</span>
            </div>
            <Link to="/admin/corrections" className="wa-dash__link">
              一覧で審査する →
            </Link>
          </Stack>
        </WashiCard>

        {/* --- 今週シフト充足 ------------------------------------------- */}
        <WashiCard
          padding="lg"
          eyebrow="今週公開分"
          title="シフト充足率"
          action={
            <StatePill
              tone={coverage.coverageRate >= 1 ? "success" : "warning"}
              label={coverage.coverageRate >= 1 ? "充足" : "要編成"}
            />
          }
        >
          <Stack gap={3}>
            <div className="wa-dash__metric">
              <span className="wa-dash__big tnum">
                {shiftsQuery.isLoading ? "—" : `${Math.round(coverage.coverageRate * 100)}`}
              </span>
              <span className="wa-dash__unit">%</span>
            </div>
            <p className="wa-dash__meta">
              公開枠 <span className="tnum wa-dash__inlineNum">{coverage.publishedCount}</span> 件
              ／ 対象 <span className="tnum wa-dash__inlineNum">{coverage.totalSlots}</span> 日 (
              {weekFrom} 〜 {weekTo})
            </p>
            <Link to="/admin/shifts" className="wa-dash__link">
              シフトを編成する →
            </Link>
          </Stack>
        </WashiCard>
      </section>

      <section className="wa-dash__shortcuts">
        <WashiCard padding="md" eyebrow="ショートカット" title="よく使う操作">
          <ul className="wa-dash__shortlist">
            <li>
              <Link to="/admin/exports" className="wa-dash__shortlink">
                <span className="wa-dash__shortlabel">今すぐエクスポート</span>
                <span className="wa-dash__shortmeta">月次勤怠を xlsx / CSV で出力</span>
              </Link>
            </li>
            <li>
              <Link to="/admin/employees" className="wa-dash__shortlink">
                <span className="wa-dash__shortlabel">従業員マスタ</span>
                <span className="wa-dash__shortmeta">入社・退社・権限設定</span>
              </Link>
            </li>
            <li>
              <Link to="/admin/audit" className="wa-dash__shortlink">
                <span className="wa-dash__shortlabel">監査ログ</span>
                <span className="wa-dash__shortmeta">変更履歴を確認</span>
              </Link>
            </li>
          </ul>
        </WashiCard>
      </section>
    </div>
  );
}
