import type { ReactNode } from "react";
import "./ShojiTransition.css";

type ShojiTransitionProps = {
  /** 画面キー (これが変わると再アニメート) */
  transitionKey: string | number;
  children: ReactNode;
  /** 方向 */
  direction?: "horizontal" | "vertical";
};

/**
 * 障子が開くような横スライド切替。
 * prefers-reduced-motion ではフェードに切り替える。
 */
export function ShojiTransition({
  transitionKey,
  children,
  direction = "horizontal",
}: ShojiTransitionProps) {
  return (
    <div key={transitionKey} className={`wa-shoji wa-shoji--${direction}`} aria-live="polite">
      {children}
    </div>
  );
}
