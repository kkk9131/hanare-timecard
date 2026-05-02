import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { type CorrectionRow, fetchMyCorrections } from "../api/corrections";
import { fetchMyMonthSummary, type MonthSummary } from "../api/punches";
import {
  fetchMyShifts,
  fetchOpenShiftPeriods,
  type MyShift,
  type ShiftPeriod,
} from "../api/shifts";
import { StatePill } from "../components/ui/StatePill";
import { SumiButton } from "../components/ui/SumiButton";
import { WashiCard } from "../components/ui/WashiCard";
import "./MePages.css";
import { formatMinutes, jpWeekday, toYmd, weekDays } from "./me-utils";

const SUMMARY_FIELDS: ReadonlyArray<{
  key: keyof MonthSummary;
  label: string;
  glyph: string;
}> = [
  { key: "worked", label: "実 働", glyph: "実" },
  { key: "overtime", label: "残 業", glyph: "残" },
  { key: "break", label: "休 憩", glyph: "休" },
  { key: "night", label: "深 夜", glyph: "深" },
];

function correctionTone(s: CorrectionRow["status"]): "warning" | "success" | "danger" {
  if (s === "approved") return "success";
  if (s === "rejected") return "danger";
  return "warning";
}

function correctionLabel(s: CorrectionRow["status"]): string {
  if (s === "approved") return "承認";
  if (s === "rejected") return "却下";
  return "申請中";
}

export function MeDashboard() {
  const [summary, setSummary] = useState<MonthSummary | null>(null);
  const [weekShifts, setWeekShifts] = useState<MyShift[]>([]);
  const [openPeriods, setOpenPeriods] = useState<ShiftPeriod[]>([]);
  const [corrections, setCorrections] = useState<CorrectionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    setError(null);

    const today = new Date();
    const week = weekDays(today);
    const weekFrom = toYmd(week[0] ?? today);
    const weekTo = toYmd(week[6] ?? today);

    Promise.all([
      fetchMyMonthSummary(ac.signal),
      fetchMyShifts({ from: weekFrom, to: weekTo }, ac.signal),
      fetchOpenShiftPeriods(ac.signal),
      fetchMyCorrections(ac.signal),
    ])
      .then(([sum, shifts, periods, corr]) => {
        setSummary(sum);
        setWeekShifts(shifts);
        setOpenPeriods(periods);
        setCorrections(corr);
      })
      .catch((e) => {
        if ((e as { name?: string }).name === "AbortError") return;
        setError("情報の取得に失敗しました。再読込してください。");
      })
      .finally(() => setLoading(false));

    return () => ac.abort();
  }, []);

  const today = new Date();
  const days = weekDays(today);

  return (
    <div className="me-page">
      <header className="me-page__head">
        <span className="me-page__eyebrow">E01 — Dashboard</span>
        <h1 className="me-page__title">マイページ</h1>
        <p className="me-page__subtitle">
          {today.getFullYear()} 年 {today.getMonth() + 1} 月 {today.getDate()} 日 (
          {jpWeekday(today)})
        </p>
      </header>

      {loading ? (
        <div className="me-state">読み込んでおります…</div>
      ) : error ? (
        <div className="me-state me-state--error">{error}</div>
      ) : (
        <>
          <WashiCard
            highlight
            padding="lg"
            eyebrow="今月の勤務"
            title="当月集計"
            action={
              <Link to="/me/history">
                <SumiButton variant="ghost" size="sm">
                  履歴を見る
                </SumiButton>
              </Link>
            }
          >
            <div className="me-summary">
              {SUMMARY_FIELDS.map((f) => {
                const min = summary?.[f.key] ?? 0;
                const fmt = formatMinutes(min);
                return (
                  <div key={f.key} className="me-summary__cell">
                    <span className="me-summary__glyph" aria-hidden="true">
                      {f.glyph}
                    </span>
                    <span className="me-summary__label">{f.label}</span>
                    <span className="me-summary__value">
                      {fmt.hours}
                      <span className="me-summary__unit">時間</span>
                      {fmt.minutes}
                      <span className="me-summary__unit">分</span>
                    </span>
                  </div>
                );
              })}
            </div>
          </WashiCard>

          <div className="me-dash__row">
            <WashiCard
              padding="lg"
              eyebrow="今週のシフト"
              title="今週の予定"
              action={
                <Link to="/me/shifts">
                  <SumiButton variant="ghost" size="sm">
                    全て見る
                  </SumiButton>
                </Link>
              }
            >
              <div className="me-week">
                {days.map((d) => {
                  const ymd = toYmd(d);
                  const shifts = weekShifts.filter((s) => s.date === ymd);
                  return (
                    <div key={ymd} className="me-week__row">
                      <span className="me-week__date">
                        {d.getMonth() + 1}/{d.getDate()}
                        <span className="me-week__weekday">{jpWeekday(d)}</span>
                      </span>
                      {shifts.length === 0 ? (
                        <span className="me-week__time me-week__time--empty">休</span>
                      ) : (
                        <span className="me-week__time">
                          {shifts
                            .map((s) => `${s.start_time.slice(0, 5)} 〜 ${s.end_time.slice(0, 5)}`)
                            .join(" / ")}
                        </span>
                      )}
                      <span className="me-week__store">
                        {shifts.length === 0 ? "" : `店舗 #${shifts[0]?.store_id ?? "-"}`}
                      </span>
                    </div>
                  );
                })}
              </div>
            </WashiCard>

            <WashiCard
              padding="lg"
              eyebrow="お知らせ"
              title={openPeriods.length > 0 ? "シフト希望の提出" : "修正申請の状況"}
              action={
                <Link to={openPeriods.length > 0 ? "/me/shift-requests" : "/me/corrections"}>
                  <SumiButton variant="ghost" size="sm">
                    {openPeriods.length > 0 ? "提出する" : "申請する"}
                  </SumiButton>
                </Link>
              }
            >
              {openPeriods.length > 0 ? (
                <ul className="me-notice__list">
                  {openPeriods.slice(0, 5).map((p) => (
                    <li key={p.id} className="me-notice__item">
                      <div className="me-notice__head">
                        <span className="me-notice__date">{p.name}</span>
                        <StatePill tone="warning" label="未提出確認" />
                      </div>
                      <p className="me-notice__reason">
                        対象 {p.target_from} 〜 {p.target_to} ／ 締切 {p.submission_to}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : corrections.length === 0 ? (
                <p className="me-state">未読のお知らせはありません</p>
              ) : (
                <ul className="me-notice__list">
                  {corrections.slice(0, 5).map((c) => (
                    <li key={c.id} className="me-notice__item">
                      <div className="me-notice__head">
                        <span className="me-notice__date">{c.target_date}</span>
                        <StatePill
                          tone={correctionTone(c.status)}
                          label={correctionLabel(c.status)}
                        />
                      </div>
                      <p className="me-notice__reason">{c.reason}</p>
                    </li>
                  ))}
                </ul>
              )}
            </WashiCard>
          </div>
        </>
      )}
    </div>
  );
}
