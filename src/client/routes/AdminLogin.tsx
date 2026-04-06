import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { type AdminLoginResponse, adminLogin } from "../api/admin";
import type { ApiError } from "../api/client";
import { Heading } from "../components/ui/Heading";
import { Logo } from "../components/ui/Logo";
import { Stack } from "../components/ui/Stack";
import { SumiButton } from "../components/ui/SumiButton";
import { WashiCard } from "../components/ui/WashiCard";
import "./AdminLogin.css";

type FormState = {
  login_id: string;
  password: string;
};

const INITIAL: FormState = { login_id: "", password: "" };

function errorMessage(err: unknown): string {
  if (err && typeof err === "object" && "status" in err) {
    const apiErr = err as ApiError;
    if (apiErr.status === 401) {
      return "ログイン ID またはパスワードが違います。今一度ご確認ください。";
    }
    if (apiErr.status === 423) {
      return "5 回連続で誤入力されたため、しばらくの間ロックされています。少しお待ちください。";
    }
    if (apiErr.status === 400) {
      return "入力内容に誤りがあります。ログイン ID とパスワードをご入力ください。";
    }
  }
  return "申し訳ございません、通信に失敗しました。少し時間をおいてお試しください。";
}

export function AdminLoginPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(INITIAL);
  const [submitted, setSubmitted] = useState(false);

  const mutation = useMutation<AdminLoginResponse, ApiError, FormState>({
    mutationFn: (body) => adminLogin(body),
    onSuccess: async () => {
      // 認証情報をリフレッシュしてから遷移
      await queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
      navigate("/admin", { replace: true });
    },
  });

  // 既にログイン済みなら /admin へ自動遷移したいが、ここでは Login 専用ページなので
  // 失敗時は err 表示。成功は AuthGuard が次画面を守る。
  if (mutation.isSuccess) {
    return <Navigate to="/admin" replace />;
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitted(true);
    if (!form.login_id.trim() || !form.password) return;
    mutation.mutate(form);
  }

  const idEmpty = submitted && !form.login_id.trim();
  const pwEmpty = submitted && !form.password;

  return (
    <div className="wa-admin-login">
      <div className="wa-admin-login__bg" aria-hidden="true" />
      <main className="wa-admin-login__main">
        <header className="wa-admin-login__brand">
          <Logo size="md" subtitle="管理画面" />
        </header>

        <WashiCard
          padding="lg"
          highlight
          className="wa-admin-login__card"
          eyebrow="ADMIN LOGIN"
          title="雀庵 管理画面"
        >
          <p className="wa-admin-login__lede">
            ご担当者さま、本日もお疲れさまでございます。
            <br />
            ログイン ID とパスワードをご入力ください。
          </p>

          <form
            className="wa-admin-login__form"
            onSubmit={handleSubmit}
            noValidate
            aria-describedby={mutation.isError ? "admin-login-error" : undefined}
          >
            <Stack gap={4}>
              <label className="wa-field">
                <span className="wa-field__label">ログイン ID</span>
                <input
                  className={`wa-field__input ${idEmpty ? "is-invalid" : ""}`}
                  type="text"
                  name="login_id"
                  autoComplete="username"
                  inputMode="text"
                  value={form.login_id}
                  onChange={(e) => setForm({ ...form, login_id: e.target.value })}
                  aria-invalid={idEmpty}
                  required
                  disabled={mutation.isPending}
                />
                {idEmpty ? (
                  <span className="wa-field__error">ログイン ID をご入力ください。</span>
                ) : null}
              </label>

              <label className="wa-field">
                <span className="wa-field__label">パスワード</span>
                <input
                  className={`wa-field__input ${pwEmpty ? "is-invalid" : ""}`}
                  type="password"
                  name="password"
                  autoComplete="current-password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  aria-invalid={pwEmpty}
                  required
                  disabled={mutation.isPending}
                />
                {pwEmpty ? (
                  <span className="wa-field__error">パスワードをご入力ください。</span>
                ) : null}
              </label>

              {mutation.isError ? (
                <div id="admin-login-error" className="wa-admin-login__error" role="alert">
                  {errorMessage(mutation.error)}
                </div>
              ) : null}

              <SumiButton
                type="submit"
                variant="primary"
                size="lg"
                block
                disabled={mutation.isPending}
              >
                {mutation.isPending ? "確認しています…" : "管理者ログイン"}
              </SumiButton>
            </Stack>
          </form>
        </WashiCard>

        <footer className="wa-admin-login__footer">
          <Heading level={3} eyebrow="NOTE">
            <span className="wa-admin-login__note">
              共用端末をご利用の場合は、終了時に必ずログアウトしてください。
            </span>
          </Heading>
        </footer>
      </main>
    </div>
  );
}
