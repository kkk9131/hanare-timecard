import { useEffect, useState } from "react";
import "./BigClock.css";

type BigClockProps = {
  /** 秒まで表示するか */
  seconds?: boolean;
  /** 日付と曜日を副表示するか */
  showDate?: boolean;
  /** サイズ */
  size?: "md" | "lg";
};

const WEEKDAY_JA = ["日", "月", "火", "水", "木", "金", "土"];

/**
 * 大きな時計。1 秒ごとに更新する。明朝体 + tabular-nums。
 * コロンは呼吸のようにゆっくり明滅する。
 */
export function BigClock({ seconds = true, showDate = true, size = "lg" }: BigClockProps) {
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  const y = now.getFullYear();
  const mo = now.getMonth() + 1;
  const d = now.getDate();
  const w = WEEKDAY_JA[now.getDay()];

  const label = `現在時刻 ${hh}時${mm}分${seconds ? `${ss}秒` : ""}`;

  return (
    <div className={`wa-clock wa-clock--${size}`} role="timer" aria-live="off" aria-label={label}>
      {showDate ? (
        <div className="wa-clock__date">
          <span className="wa-clock__ymd tnum">
            {y}年 {mo}月 {d}日
          </span>
          <span className="wa-clock__weekday">（{w}）</span>
        </div>
      ) : null}
      <div className="wa-clock__time tnum" aria-hidden="true">
        <span className="wa-clock__digits">{hh}</span>
        <span className="wa-clock__sep">:</span>
        <span className="wa-clock__digits">{mm}</span>
        {seconds ? (
          <>
            <span className="wa-clock__sep wa-clock__sep--sm">:</span>
            <span className="wa-clock__digits wa-clock__digits--sm">{ss}</span>
          </>
        ) : null}
      </div>
    </div>
  );
}
