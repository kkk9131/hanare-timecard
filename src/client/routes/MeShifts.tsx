import { useEffect, useMemo, useState } from "react";
import { fetchMyShifts, type MyShift } from "../api/shifts";
import { WashiCard } from "../components/ui/WashiCard";
import "./MePages.css";
import {
  addMonths,
  endOfMonth,
  isSameYmd,
  jpWeekday,
  monthCalendarDays,
  startOfMonth,
  toYmd,
  weekDays,
} from "./me-utils";

type View = "week" | "month";

export function MeShifts() {
  const [view, setView] = useState<View>("month");
  const [anchor, setAnchor] = useState<Date>(() => new Date());
  const [shifts, setShifts] = useState<MyShift[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    setError(null);

    let from: Date;
    let to: Date;
    if (view === "week") {
      const w = weekDays(anchor);
      from = w[0] ?? anchor;
      to = w[6] ?? anchor;
    } else {
      // 月ビューは前後月のはみ出し分も取る
      const days = monthCalendarDays(anchor);
      from = days[0] ?? startOfMonth(anchor);
      to = days[days.length - 1] ?? endOfMonth(anchor);
    }

    fetchMyShifts({ from: toYmd(from), to: toYmd(to) }, ac.signal)
      .then(setShifts)
      .catch((e) => {
        if ((e as { name?: string }).name === "AbortError") return;
        setError("シフト情報の取得に失敗しました");
      })
      .finally(() => setLoading(false));

    return () => ac.abort();
  }, [view, anchor]);

  const periodLabel = useMemo(() => {
    if (view === "week") {
      const w = weekDays(anchor);
      const a = w[0];
      const b = w[6];
      if (!a || !b) return "";
      return `${a.getFullYear()}年 ${a.getMonth() + 1}月${a.getDate()}日 〜 ${b.getMonth() + 1}月${b.getDate()}日`;
    }
    return `${anchor.getFullYear()}年 ${anchor.getMonth() + 1}月`;
  }, [view, anchor]);

  const shiftsByDate = useMemo(() => {
    const map = new Map<string, MyShift[]>();
    for (const s of shifts) {
      const list = map.get(s.date) ?? [];
      list.push(s);
      map.set(s.date, list);
    }
    return map;
  }, [shifts]);

  return (
    <div className="me-page">
      <header className="me-page__head">
        <span className="me-page__eyebrow">E04 — Shifts</span>
        <h1 className="me-page__title">公開シフト</h1>
        <p className="me-page__subtitle">店長が公開した自分のシフトを確認できます</p>
      </header>

      <WashiCard
        padding="lg"
        eyebrow={periodLabel}
        title="シフト表"
        action={
          <div className="me-tabs" role="tablist" aria-label="表示単位">
            <button
              type="button"
              role="tab"
              aria-selected={view === "week"}
              className={`me-tabs__btn ${view === "week" ? "is-active" : ""}`}
              onClick={() => setView("week")}
            >
              週
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === "month"}
              className={`me-tabs__btn ${view === "month" ? "is-active" : ""}`}
              onClick={() => setView("month")}
            >
              月
            </button>
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
            style={{
              border: "1px solid var(--border-hairline)",
              borderRadius: 4,
            }}
            onClick={() => setAnchor((d) => (view === "week" ? addDays(d, -7) : addMonths(d, -1)))}
          >
            ← 前へ
          </button>
          <button
            type="button"
            className="me-tabs__btn"
            style={{
              border: "1px solid var(--border-hairline)",
              borderRadius: 4,
            }}
            onClick={() => setAnchor((d) => (view === "week" ? addDays(d, 7) : addMonths(d, 1)))}
          >
            次へ →
          </button>
        </div>

        {loading ? (
          <div className="me-state">読み込んでおります…</div>
        ) : error ? (
          <div className="me-state me-state--error">{error}</div>
        ) : view === "week" ? (
          <WeekList shifts={shifts} anchor={anchor} />
        ) : (
          <MonthGrid anchor={anchor} shiftsByDate={shiftsByDate} />
        )}
      </WashiCard>
    </div>
  );
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function WeekList({ shifts, anchor }: { shifts: MyShift[]; anchor: Date }) {
  const days = weekDays(anchor);
  return (
    <div className="me-shift-list">
      {days.map((d) => {
        const ymd = toYmd(d);
        const list = shifts.filter((s) => s.date === ymd);
        return (
          <div key={ymd} className="me-shift-list__row">
            <span className="me-shift-list__date">
              {d.getMonth() + 1}/{d.getDate()} ({jpWeekday(d)})
            </span>
            {list.length === 0 ? (
              <span className="me-shift-list__time" style={{ color: "var(--text-meta)" }}>
                休
              </span>
            ) : (
              <span className="me-shift-list__time">
                {list
                  .map((s) => `${s.start_time.slice(0, 5)} 〜 ${s.end_time.slice(0, 5)}`)
                  .join(" / ")}
              </span>
            )}
            <span className="me-shift-list__store">
              {list.length > 0 ? `店舗 #${list[0]?.store_id ?? "-"}` : ""}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function MonthGrid({
  anchor,
  shiftsByDate,
}: {
  anchor: Date;
  shiftsByDate: Map<string, MyShift[]>;
}) {
  const days = monthCalendarDays(anchor);
  const today = new Date();
  const weekHeads = ["日", "月", "火", "水", "木", "金", "土"];
  return (
    <div className="me-shift-grid">
      {weekHeads.map((w) => (
        <div key={w} className="me-shift-grid__cell me-shift-grid__cell--head">
          {w}
        </div>
      ))}
      {days.map((d) => {
        const ymd = toYmd(d);
        const inMonth = d.getMonth() === anchor.getMonth();
        const isToday = isSameYmd(d, today);
        const list = shiftsByDate.get(ymd) ?? [];
        return (
          <div key={ymd} className="me-shift-grid__cell">
            <span
              className={`me-shift-grid__date ${
                !inMonth ? "me-shift-grid__date--other" : ""
              } ${isToday ? "me-shift-grid__date--today" : ""}`}
            >
              {d.getDate()}
            </span>
            {list.map((s) => (
              <span key={s.id} className="me-shift-grid__entry">
                {s.start_time.slice(0, 5)}〜{s.end_time.slice(0, 5)}
              </span>
            ))}
          </div>
        );
      })}
    </div>
  );
}
