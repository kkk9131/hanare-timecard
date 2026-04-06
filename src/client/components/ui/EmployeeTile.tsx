import type { ButtonHTMLAttributes } from "react";
import "./EmployeeTile.css";

type EmployeeTileProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  name: string;
  kana?: string;
  /** 状態バッジ (任意) */
  state?: "idle" | "on-shift" | "on-break";
};

const STATE_LABEL: Record<NonNullable<EmployeeTileProps["state"]>, string> = {
  idle: "未出勤",
  "on-shift": "勤務中",
  "on-break": "休憩中",
};

/**
 * K01 用の大型タイル。最小 96×96、iPad 向けに通常 140×140+。
 */
export function EmployeeTile({
  name,
  kana,
  state = "idle",
  className = "",
  type = "button",
  ...rest
}: EmployeeTileProps) {
  return (
    <button
      type={type}
      className={`wa-tile wa-tile--${state} ${className}`.trim()}
      aria-label={`${name} ${STATE_LABEL[state]}`}
      {...rest}
    >
      <span className="wa-tile__kana">{kana ?? "\u00A0"}</span>
      <span className="wa-tile__name">{name}</span>
      <span className={`wa-tile__state wa-tile__state--${state}`}>
        <span className="wa-tile__dot" aria-hidden="true" />
        {STATE_LABEL[state]}
      </span>
    </button>
  );
}
