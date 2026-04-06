import type { HTMLAttributes, ReactNode } from "react";
import "./AndonHover.css";

type AndonHoverProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  /** 色合い */
  tone?: "kincha" | "shu";
};

/**
 * ホバーで行灯のように暖色の光が灯るラッパー。
 */
export function AndonHover({
  children,
  tone = "kincha",
  className = "",
  ...rest
}: AndonHoverProps) {
  return (
    <div className={`wa-andon wa-andon--${tone} ${className}`.trim()} {...rest}>
      {children}
    </div>
  );
}
