import { useQuery } from "@tanstack/react-query";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { fetchMe, type Me } from "../api/auth";
import type { ApiError } from "../api/client";
import { type AdminOnboardingRole, AdminOnboardingWizard } from "./AdminOnboardingWizard";
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
  { to: "/admin/help", label: "ヘルプ" },
  { to: "/admin/employees", label: "従業員", adminOnly: true },
  { to: "/admin/stores", label: "店舗", adminOnly: true },
  { to: "/admin/exports", label: "エクスポート", adminOnly: true },
  { to: "/admin/audit", label: "監査ログ", adminOnly: true },
];

const HELP_TOPIC_BY_PATH: Array<{
  path: string;
  topic: string;
  label: string;
  adminOnly?: boolean;
}> = [
  { path: "/admin/shifts", topic: "shifts", label: "シフト" },
  { path: "/admin/corrections", topic: "corrections", label: "修正申請" },
  { path: "/admin/employees", topic: "employees", label: "従業員", adminOnly: true },
  { path: "/admin/stores", topic: "stores", label: "店舗", adminOnly: true },
  { path: "/admin/exports", topic: "exports", label: "エクスポート", adminOnly: true },
  { path: "/admin/audit", topic: "audit", label: "監査ログ", adminOnly: true },
  { path: "/admin", topic: "dashboard", label: "ダッシュボード" },
];

function currentHelpTopic(pathname: string, isAdmin: boolean) {
  if (pathname.startsWith("/admin/help")) return null;
  const found = HELP_TOPIC_BY_PATH.find((item) => pathname === item.path);
  if (!found || (found.adminOnly && !isAdmin)) return null;
  return found;
}

/**
 * 管理画面共通レイアウト。
 * 左サイドバーに「雀庵」縦組ロゴ + 7 項目ナビ。
 * 右側 main に各ページの content を Outlet で出す。
 */
export function AdminLayout() {
  const location = useLocation();
  const meQuery = useQuery<Me, ApiError>({
    queryKey: ["auth", "me"],
    queryFn: ({ signal }) => fetchMe(signal),
    retry: false,
    staleTime: 30_000,
  });
  const visibleItems = NAV_ITEMS.filter(
    (item) => meQuery.data?.role === "admin" || !item.adminOnly,
  );
  const onboardingRole: AdminOnboardingRole | undefined =
    meQuery.data?.role === "admin" || meQuery.data?.role === "manager"
      ? meQuery.data.role
      : undefined;
  const isAdmin = meQuery.data?.role === "admin";
  const helpTopic = currentHelpTopic(location.pathname, isAdmin);

  return (
    <AppShell
      storeName="管理"
      sidebar={
        <nav className="wa-admin-nav" aria-label="管理メニュー">
          <ul className="wa-admin-nav__list">
            {visibleItems.map((item) => (
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
          <div className="wa-admin-nav__guide">
            <a className="wa-admin-nav__kioskLink" href="/">
              打刻画面へ
            </a>
            {helpTopic ? (
              <Link className="wa-admin-nav__helpLink" to={`/admin/help/${helpTopic.topic}`}>
                <span className="wa-admin-nav__helpEyebrow">このページ</span>
                <span className="wa-admin-nav__helpLabel">{helpTopic.label}のヘルプ</span>
              </Link>
            ) : (
              <Link className="wa-admin-nav__helpLink" to="/admin/help">
                <span className="wa-admin-nav__helpEyebrow">困ったとき</span>
                <span className="wa-admin-nav__helpLabel">ヘルプ一覧</span>
              </Link>
            )}
            <AdminOnboardingWizard role={onboardingRole} />
          </div>
        </nav>
      }
      constrained
    >
      <Outlet />
    </AppShell>
  );
}
