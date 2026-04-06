import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { fetchMe, type Me } from "../api/auth";
import type { ApiError } from "../api/client";

type Role = Me["role"];

type AuthGuardProps = {
  allow: Role[];
  /** Unauthenticated users are redirected here. */
  fallback: string;
  children?: ReactNode;
};

export function AuthGuard({ allow, fallback, children }: AuthGuardProps) {
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
    return <Navigate to={fallback} replace state={{ from: location.pathname }} />;
  }

  return <>{children ?? <Outlet />}</>;
}
