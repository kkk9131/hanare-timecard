import type { ReactNode } from "react";
import "./StatePill.css";

type Tone = "neutral" | "success" | "warning" | "danger" | "info";

type StatePillProps = {
  label: ReactNode;
  /** 左側アイコン (絵文字や SVG) */
  icon?: ReactNode;
  tone?: Tone;
};

/**
 * 色だけに頼らない状態表示。アイコン + ラベル併記。
 */
export function StatePill({ label, icon, tone = "neutral" }: StatePillProps) {
  return (
    <span className={`wa-pill wa-pill--${tone}`} role="status">
      {icon ? (
        <span className="wa-pill__icon" aria-hidden="true">
          {icon}
        </span>
      ) : (
        <span className="wa-pill__dot" aria-hidden="true" />
      )}
      <span className="wa-pill__label">{label}</span>
    </span>
  );
}
