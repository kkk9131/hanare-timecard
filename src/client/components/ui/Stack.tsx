import type { CSSProperties, ElementType, HTMLAttributes, ReactNode } from "react";

type Gap = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

type StackProps = HTMLAttributes<HTMLElement> & {
  as?: ElementType;
  gap?: Gap;
  align?: CSSProperties["alignItems"];
  justify?: CSSProperties["justifyContent"];
  children: ReactNode;
};

/** 縦方向スタック */
export function Stack({
  as: As = "div",
  gap = 4,
  align,
  justify,
  style,
  children,
  ...rest
}: StackProps) {
  return (
    <As
      style={{
        display: "flex",
        flexDirection: "column",
        gap: `var(--space-${gap})`,
        alignItems: align,
        justifyContent: justify,
        ...style,
      }}
      {...rest}
    >
      {children}
    </As>
  );
}

/** 横方向並び (折返し対応) */
export function Inline({
  as: As = "div",
  gap = 3,
  align = "center",
  justify,
  style,
  children,
  ...rest
}: StackProps) {
  return (
    <As
      style={{
        display: "flex",
        flexDirection: "row",
        flexWrap: "wrap",
        gap: `var(--space-${gap})`,
        alignItems: align,
        justifyContent: justify,
        ...style,
      }}
      {...rest}
    >
      {children}
    </As>
  );
}
