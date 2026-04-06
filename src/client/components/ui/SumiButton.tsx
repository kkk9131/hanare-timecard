import type { ButtonHTMLAttributes, ReactNode } from "react";
import "./SumiButton.css";

type Variant = "primary" | "ghost" | "danger" | "secondary";
type Size = "sm" | "md" | "lg";

type SumiButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  /** 左側の装飾 (アイコンなど) */
  leading?: ReactNode;
  /** フルワイド */
  block?: boolean;
};

/**
 * 朱の主アクション / 墨の地味 / 朱の警告 / 金茶のセカンダリ。
 * ink-on-paper 質感: 縁線 + hover で塗りつぶし。
 */
export function SumiButton({
  variant = "primary",
  size = "md",
  block = false,
  leading,
  className = "",
  children,
  type = "button",
  ...rest
}: SumiButtonProps) {
  const cls = [
    "wa-btn",
    `wa-btn--${variant}`,
    `wa-btn--${size}`,
    block ? "wa-btn--block" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button type={type} className={cls} {...rest}>
      {leading ? <span className="wa-btn__leading">{leading}</span> : null}
      <span className="wa-btn__label">{children}</span>
    </button>
  );
}
