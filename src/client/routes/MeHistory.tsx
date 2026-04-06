import { useEffect, useMemo, useState } from "react";
import { fetchMyPunches, type PunchRow } from "../api/punches";
import { WashiCard } from "../components/ui/WashiCard";
import { aggregateByDay, formatRange } from "./me-aggregate";
import "./MePages.css";
import {
  addMonths,
  endOfMonth,
  formatMinutes,
  fromYmd,
  jpWeekday,
  startOfMonth,
  toYmd,
  weekDays,
} from "./me-utils";

type View = "day" | "week" | "month";

export function MeHistory() {
  const [view, setView] = useState<View>("month");
  const [anchor, setAnchor] = useState<Date>(() => new Date());
  const [punches, setPunches] = useState<PunchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 過去 3 ヶ月までしか戻れない
  const oldestAllowed = useMemo(() => addMonths(new Date(), -3), []);

  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    setError(null);

    let from: Date;
    let to: Date;
    if (view === "day") {
      from = anchor;
      to = anchor;
    } else if (view === "week") {
      const week = weekDays(anchor);
      from = week[0] ?? anchor;
      to = week[6] ?? anchor;
    } else {
      from = startOfMonth(anchor);
      to = endOfMonth(anchor);
    }

    fetchMyPunches({ from: toYmd(from), to: toYmd(to) }, ac.signal)
      .then(setPunches)
      .catch((e) => {
        if ((e as { name?: string }).name === "AbortError") return;
        setError("打刻履歴の取得に失敗しました");
      })
      .finally(() => setLoading(false));

    return () => ac.abort();
  }, [view, anchor]);

  const summaries = useMemo(() => aggregateByDay(punches), [punches]);

  const totalWorked = summaries.reduce((acc, s) => acc + s.worked_minutes, 0);
  const totalBreak = summaries.reduce((acc, s) => acc + s.break_minutes, 0);

  // 表示用の日付ラベル
  const periodLabel = useMemo(() => {
    if (view === "day") {
      return `${anchor.getFullYear()}年 ${anchor.getMonth() + 1}月 ${anchor.getDate()}日 (${jpWeekday(anchor)})`;
    }
    if (view === "week") {
      const w = weekDays(anchor);
      const a = w[0];
      const b = w[6];
      if (!a || !b) return "";
      return `${a.getFullYear()}年 ${a.getMonth() + 1}月${a.getDate()}日 〜 ${b.getMonth() + 1}月${b.getDate()}日`;
    }
    return `${anchor.getFullYear()}年 ${anchor.getMonth() + 1}月`;
  }, [view, anchor]);

  const canGoOlder = (() => {
    const next = view === "month" ? addMonths(anchor, -1) : addAnchor(anchor, view, -1);
    return next >= startOfMonth(oldestAllowed);
  })();
  const canGoNewer = anchor < new Date();

  return (
    <div className="me-page">
      <header className="me-page__head">
        <span className="me-page__eyebrow">E02 — History</span>
        <h1 className="me-page__title">打刻履歴</h1>
        <p className="me-page__subtitle">過去 3 ヶ月分の打刻記録を閲覧できます</p>
      </header>

      <WashiCard
        padding="lg"
        eyebrow={periodLabel}
        title="勤務記録"
        action={
          <div className="me-tabs" role="tablist" aria-label="表示単位">
            {(["day", "week", "month"] as const).map((v) => (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={view === v}
                className={`me-tabs__btn ${view === v ? "is-active" : ""}`}
                onClick={() => setView(v)}
              >
                {v === "day" ? "日" : v === "week" ? "週" : "月"}
              </button>
            ))}
          </div>
        }
      >
        <div
          style={{
            display: "flex",
            gap: "var(--space-3)",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "var(--space-4)",
          }}
        >
          <button
            type="button"
            className="me-tabs__btn"
            onClick={() => setAnchor((d) => addAnchor(d, view, -1))}
            disabled={!canGoOlder}
            style={{
              border: "1px solid var(--border-hairline)",
              borderRadius: 4,
            }}
          >
            ← 前へ
          </button>
          <button
            type="button"
            className="me-tabs__btn"
            onClick={() => setAnchor((d) => addAnchor(d, view, 1))}
            disabled={!canGoNewer}
            style={{
              border: "1px solid var(--border-hairline)",
              borderRadius: 4,
            }}
          >
            次へ →
          </button>
        </div>

        {loading ? (
          <div className="me-state">読み込んでおります…</div>
        ) : error ? (
          <div className="me-state me-state--error">{error}</div>
        ) : summaries.length === 0 ? (
          <div className="me-state">この期間に打刻はありません</div>
        ) : (
          <table className="me-table">
            <thead>
              <tr>
                <th>日付</th>
                <th>時間帯</th>
                <th className="is-numeric">休憩</th>
                <th className="is-numeric">実働</th>
              </tr>
            </thead>
            <tbody>
              {summaries.map((s) => {
                const d = fromYmd(s.date);
                const fmt = formatMinutes(s.worked_minutes);
                const brk = formatMinutes(s.break_minutes);
                return (
                  <tr key={s.date}>
                    <td className="is-date">
                      {d.getMonth() + 1}/{d.getDate()} ({jpWeekday(d)})
                    </td>
                    <td>{formatRange(s) || "—"}</td>
                    <td className="is-numeric">
                      {brk.hours}:{brk.minutes}
                    </td>
                    <td className="is-numeric">
                      {fmt.hours}:{fmt.minutes}
                    </td>
                  </tr>
                );
              })}
              <tr className="me-table__footer-row">
                <td>合計</td>
                <td />
                <td className="is-numeric">
                  {formatMinutes(totalBreak).hours}:{formatMinutes(totalBreak).minutes}
                </td>
                <td className="is-numeric">
                  {formatMinutes(totalWorked).hours}:{formatMinutes(totalWorked).minutes}
                </td>
              </tr>
            </tbody>
          </table>
        )}
      </WashiCard>
    </div>
  );
}

function addAnchor(d: Date, view: View, delta: number): Date {
  const next = new Date(d);
  if (view === "day") next.setDate(next.getDate() + delta);
  else if (view === "week") next.setDate(next.getDate() + delta * 7);
  else next.setMonth(next.getMonth() + delta);
  return next;
}
