import type { ReactNode } from "react";
import "./Heading.css";

type Level = 1 | 2 | 3;

type HeadingProps = {
  level?: Level;
  /** 上に小さく載る英字/カナの補足 */
  eyebrow?: ReactNode;
  /** 縦組表示 */
  vertical?: boolean;
  children: ReactNode;
};

/**
 * 明朝見出し。eyebrow 付きでセクションに品を添える。
 */
export function Heading({ level = 2, eyebrow, vertical = false, children }: HeadingProps) {
  const cls = `wa-heading wa-heading--h${level} ${vertical ? "wa-heading--vertical" : ""}`.trim();
  const content = (
    <>
      {eyebrow ? <span className="wa-heading__eyebrow">{eyebrow}</span> : null}
      <span className="wa-heading__text">{children}</span>
    </>
  );
  if (level === 1) return <h1 className={cls}>{content}</h1>;
  if (level === 2) return <h2 className={cls}>{content}</h2>;
  return <h3 className={cls}>{content}</h3>;
}
