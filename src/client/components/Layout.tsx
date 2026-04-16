import type { ReactNode } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { logout } from "../api/auth";
import { storeShortLabel } from "../lib/storeLabels";
import { useKioskStore } from "../state/kioskStore";
import { AppShell } from "./ui/AppShell";
import { StatePill } from "./ui/StatePill";
import { SumiButton } from "./ui/SumiButton";
import "./EmployeeLayout.css";

type LayoutProps = {
  children?: ReactNode;
};

/**
 * 打刻系レイアウト (K01-K04)。
 * 縦組ロゴ風ヘッダー + 墨黒背景。
 */
export function PunchLayout({ children }: LayoutProps) {
  const storeFilter = useKioskStore((s) => s.storeFilter);
  const activeStoreId = useKioskStore((s) => s.activeStoreId);
  const storeName =
    activeStoreId != null
      ? storeShortLabel(activeStoreId)
      : storeFilter === "all"
        ? "本店"
        : storeShortLabel(storeFilter);

  return (
    <AppShell storeName={storeName} headerRight={<StatePill tone="info" label="打刻端末" />}>
      {children ?? <Outlet />}
    </AppShell>
  );
}

const ME_NAV = [
  { to: "/me", label: "ダッシュボード", end: true, kana: "今" },
  { to: "/me/history", label: "打刻履歴", end: false, kana: "履" },
  { to: "/me/corrections", label: "修正申請", end: false, kana: "正" },
  { to: "/me/shifts", label: "公開シフト", end: false, kana: "表" },
  { to: "/me/shift-requests", label: "シフト希望", end: false, kana: "願" },
];

/**
 * 従業員マイページ (E01-E05)。
 * 左サイドバー (ロゴ + 5 項目ナビ + ログアウト) + 右側 main。
 */
export function EmployeeLayout({ children }: LayoutProps) {
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate("/", { replace: true });
  };

  return (
    <AppShell
      storeName="従業員"
      sidebar={
        <div className="wa-me-nav-wrap">
          <nav className="wa-me-nav" aria-label="従業員メニュー">
            <ul className="wa-me-nav__list">
              {ME_NAV.map((item) => (
                <li key={item.to} className="wa-me-nav__item">
                  <NavLink
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) => `wa-me-nav__link ${isActive ? "is-active" : ""}`}
                  >
                    <span className="wa-me-nav__glyph" aria-hidden="true">
                      {item.kana}
                    </span>
                    <span className="wa-me-nav__label">{item.label}</span>
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
          <div className="wa-me-nav__footer">
            <SumiButton variant="ghost" size="sm" block onClick={handleLogout}>
              ログアウト
            </SumiButton>
          </div>
        </div>
      }
      constrained
    >
      {children ?? <Outlet />}
    </AppShell>
  );
}

// AdminLayout は src/client/components/AdminLayout.tsx に移動 (task-5005)。
