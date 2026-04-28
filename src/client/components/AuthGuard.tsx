import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Link, Navigate, Outlet, useLocation } from "react-router-dom";
import { fetchMe, type Me } from "../api/auth";
import type { ApiError } from "../api/client";
import { AppShell } from "./ui/AppShell";
import { Heading } from "./ui/Heading";
import { Stack } from "./ui/Stack";
import { WashiCard } from "./ui/WashiCard";
import "./AuthGuard.css";
import "./ui/SumiButton.css";

type Role = Me["role"];

type AuthGuardProps = {
  allow: Role[];
  /** Unauthenticated users are redirected here. */
  fallback: string;
  /** Authenticated users without enough permission see this instead of login. */
  forbidden?: ReactNode;
  children?: ReactNode;
};

export function ForbiddenPage() {
  return (
    <AppShell storeName="権限確認" constrained>
      <main className="wa-forbidden" aria-labelledby="forbidden-title">
        <WashiCard padding="lg" highlight eyebrow="403" title="権限がありません">
          <Stack gap={4}>
            <Heading level={1} eyebrow="FORBIDDEN">
              <span id="forbidden-title">この画面を開く権限がありません</span>
            </Heading>
            <p className="wa-forbidden__text">
              ログインはできていますが、この画面を開ける権限が現在のアカウントにありません。
              店長アカウントでは、ダッシュボード・シフト・修正申請の確認をご利用ください。
            </p>
            <div className="wa-forbidden__actions">
              <Link className="wa-btn wa-btn--primary wa-btn--md" to="/admin">
                <span className="wa-btn__label">管理ダッシュボードへ戻る</span>
              </Link>
              <Link className="wa-btn wa-btn--ghost wa-btn--md" to="/admin/login">
                <span className="wa-btn__label">別のアカウントでログイン</span>
              </Link>
            </div>
          </Stack>
        </WashiCard>
      </main>
    </AppShell>
  );
}

export function AuthGuard({ allow, fallback, forbidden, children }: AuthGuardProps) {
  const location = useLocation();
  const query = useQuery<Me, ApiError>({
    queryKey: ["auth", "me"],
    queryFn: ({ signal }) => fetchMe(signal),
    retry: false,
    staleTime: 30_000,
  });

  if (query.isLoading) {
    return <div data-state="auth-loading">読み込み中…</div>;
  }

  if (query.isError || !query.data) {
    return <Navigate to={fallback} replace state={{ from: location.pathname }} />;
  }

  if (!allow.includes(query.data.role)) {
    return <>{forbidden ?? <ForbiddenPage />}</>;
  }

  return <>{children ?? <Outlet />}</>;
}
