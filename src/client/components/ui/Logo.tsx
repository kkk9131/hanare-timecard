import "./Logo.css";

type LogoProps = {
  /** 店舗サブタイトル: 例 "本店" / "はなれ" */
  subtitle?: string;
  /** 縦組 (vertical-rl) で表示する */
  vertical?: boolean;
  /** 大きさバリアント */
  size?: "sm" | "md" | "lg";
};

/**
 * 「雀庵」ロゴ。縦組み時は writing-mode: vertical-rl を用いる。
 * subtitle は店舗サブ識別 (本店 / はなれ) を想定。
 */
export function Logo({ subtitle, vertical = false, size = "md" }: LogoProps) {
  return (
    <div
      className={`wa-logo wa-logo--${size} ${vertical ? "wa-logo--vertical" : ""}`.trim()}
      role="img"
      aria-label={subtitle ? `雀庵 ${subtitle}` : "雀庵"}
    >
      <span className="wa-logo__mark">雀庵</span>
      {subtitle ? (
        <>
          <span className="wa-logo__rule" aria-hidden="true" />
          <span className="wa-logo__sub">{subtitle}</span>
        </>
      ) : null}
    </div>
  );
}
