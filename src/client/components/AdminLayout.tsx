import { NavLink, Outlet } from "react-router-dom";
import { AppShell } from "./ui/AppShell";
import "./AdminLayout.css";

type NavItem = {
  to: string;
  label: string;
  /** "admin" 限定 (manager には非表示) */
  adminOnly?: boolean;
  /** end matching for index route */
  end?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { to: "/admin", label: "ダッシュボード", end: true },
  { to: "/admin/shifts", label: "シフト" },
  { to: "/admin/corrections", label: "修正申請" },
  { to: "/admin/employees", label: "従業員", adminOnly: true },
  { to: "/admin/stores", label: "店舗", adminOnly: true },
  { to: "/admin/exports", label: "エクスポート", adminOnly: true },
  { to: "/admin/audit", label: "監査ログ", adminOnly: true },
];

/**
 * 管理画面共通レイアウト。
 * 左サイドバーに「雀庵」縦組ロゴ + 7 項目ナビ。
 * 右側 main に各ページの content を Outlet で出す。
 */
export function AdminLayout() {
  return (
    <AppShell
      storeName="管理"
      sidebar={
        <nav className="wa-admin-nav" aria-label="管理メニュー">
          <ul className="wa-admin-nav__list">
            {NAV_ITEMS.map((item) => (
              <li key={item.to} className="wa-admin-nav__item">
                <NavLink
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) => `wa-admin-nav__link ${isActive ? "is-active" : ""}`}
                >
                  <span className="wa-admin-nav__rule" aria-hidden="true" />
                  <span className="wa-admin-nav__label">{item.label}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      }
      constrained
    >
      <Outlet />
    </AppShell>
  );
}
