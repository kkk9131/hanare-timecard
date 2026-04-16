import type { ReactNode } from "react";
import { Logo } from "./Logo";
import "./AppShell.css";

type AppShellProps = {
  /** 左サイドバー内容 (管理画面で使う) */
  sidebar?: ReactNode;
  /** ヘッダー右側スロット */
  headerRight?: ReactNode;
  /** 店舗サブタイトル: "本店" / "離れ" */
  storeName?: string;
  /** 縦組ロゴで表示するか */
  verticalLogo?: boolean;
  /** 本文幅を絞るか (管理画面向け) */
  constrained?: boolean;
  children: ReactNode;
};

/**
 * アプリ全体シェル。
 * - 打刻系: sidebar 無し、縦組ロゴを左上
 * - 管理系: sidebar あり、横組ロゴをサイドに
 */
export function AppShell({
  sidebar,
  headerRight,
  storeName,
  verticalLogo = false,
  constrained = false,
  children,
}: AppShellProps) {
  return (
    <div className={`wa-shell ${sidebar ? "wa-shell--with-sidebar" : ""}`}>
      {sidebar ? (
        <aside className="wa-shell__sidebar" aria-label="ナビゲーション">
          <div className="wa-shell__sidebar-logo">
            <Logo size="md" subtitle={storeName} />
          </div>
          <nav className="wa-shell__nav">{sidebar}</nav>
        </aside>
      ) : (
        <header className="wa-shell__header">
          <div className="wa-shell__logo">
            <Logo size={verticalLogo ? "md" : "md"} subtitle={storeName} vertical={verticalLogo} />
          </div>
          {headerRight ? <div className="wa-shell__header-right">{headerRight}</div> : null}
        </header>
      )}
      <main className={`wa-shell__main ${constrained ? "wa-shell__main--constrained" : ""}`}>
        {children}
      </main>
    </div>
  );
}
