import type { HTMLAttributes, ReactNode } from "react";
import "./WashiCard.css";

type WashiCardProps = HTMLAttributes<HTMLDivElement> & {
  /** section title (明朝) */
  title?: ReactNode;
  /** sub title / meta */
  eyebrow?: ReactNode;
  /** right-aligned header slot */
  action?: ReactNode;
  /** padding size */
  padding?: "sm" | "md" | "lg";
  /** 金茶の上辺ラインを強調 */
  highlight?: boolean;
};

/**
 * 和紙風カード。微細ノイズ + 焦茶ヘアライン + 金茶の上辺装飾。
 */
export function WashiCard({
  title,
  eyebrow,
  action,
  padding = "md",
  highlight = false,
  className = "",
  children,
  ...rest
}: WashiCardProps) {
  const cls = [
    "wa-card",
    `wa-card--pad-${padding}`,
    highlight ? "wa-card--highlight" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <section className={cls} {...rest}>
      {(title || eyebrow || action) && (
        <header className="wa-card__header">
          <div className="wa-card__titles">
            {eyebrow ? <span className="wa-card__eyebrow">{eyebrow}</span> : null}
            {title ? <h2 className="wa-card__title">{title}</h2> : null}
          </div>
          {action ? <div className="wa-card__action">{action}</div> : null}
        </header>
      )}
      <div className="wa-card__body">{children}</div>
    </section>
  );
}
