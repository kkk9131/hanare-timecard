import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  fetchPublicEmployees,
  kioskLogin,
  type PublicEmployee,
  unlockAdminGate,
} from "../api/auth";
import type { ApiError } from "../api/client";
import { StoreSwitcher, type StoreFilter as StoreSwitcherValue } from "../components/StoreSwitcher";
import { BigClock } from "../components/ui/BigClock";
import { EmployeeTile } from "../components/ui/EmployeeTile";
import { Heading } from "../components/ui/Heading";
import { Modal } from "../components/ui/Modal";
import { ShojiTransition } from "../components/ui/ShojiTransition";
import { Inline, Stack } from "../components/ui/Stack";
import { SumiButton } from "../components/ui/SumiButton";
import { WashiCard } from "../components/ui/WashiCard";
import { KNOWN_STORE_IDS, storeShortLabel } from "../lib/storeLabels";
import { useKioskStore } from "../state/kioskStore";
import "./PunchTop.css";

/**
 * K01 打刻トップ。店舗フィルタタブ + 大時計 + 従業員タイル一覧。
 *
 * 受け入れ条件:
 * - 従業員一覧を kana 順に表示
 * - 名前タップでそのまま打刻ボードへ進む
 * - 店舗フィルタで「本店」「離れ」を切替可能
 */
export function PunchTop() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const storeFilter = useKioskStore((s) => s.storeFilter);
  const setStoreFilter = useKioskStore((s) => s.setStoreFilter);
  const selectEmployee = useKioskStore((s) => s.selectEmployee);
  const setSession = useKioskStore((s) => s.setSession);
  const [submittingEmployeeId, setSubmittingEmployeeId] = useState<number | null>(null);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [adminGateOpen, setAdminGateOpen] = useState(false);
  const [adminPin, setAdminPin] = useState("");
  const [adminPinSubmitted, setAdminPinSubmitted] = useState(false);

  const employeesQuery = useQuery<PublicEmployee[], ApiError>({
    queryKey: ["public-employees"],
    queryFn: ({ signal }) => fetchPublicEmployees(undefined, signal),
    staleTime: 30_000,
  });

  const storeIds = KNOWN_STORE_IDS;

  // 表示対象 (store filter 適用)
  const visible = useMemo(() => {
    const all = employeesQuery.data ?? [];
    if (storeFilter === "all") {
      const firstStoreId = storeIds[0];
      return firstStoreId != null ? all.filter((e) => e.store_ids.includes(firstStoreId)) : all;
    }
    return all.filter((e) => e.store_ids.includes(storeFilter));
  }, [employeesQuery.data, storeFilter]);

  useEffect(() => {
    if (storeFilter !== "all") return;
    const firstStoreId = storeIds[0];
    if (firstStoreId != null) {
      setStoreFilter(firstStoreId);
    }
  }, [setStoreFilter, storeFilter]);

  const storeOptions = useMemo(
    () =>
      storeIds.map((id) => ({
        id,
        code: String(id),
        name: storeShortLabel(id),
        display_name: storeShortLabel(id),
      })),
    [],
  );

  const adminGateMutation = useMutation({
    mutationFn: (pin: string) => unlockAdminGate({ pin }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["auth", "admin-gate-status"] });
      setAdminGateOpen(false);
      setAdminPin("");
      setAdminPinSubmitted(false);
      navigate("/admin/login");
    },
  });

  const onSelect = async (emp: PublicEmployee) => {
    selectEmployee(emp);
    setLoginError(null);
    setSubmittingEmployeeId(emp.id);

    try {
      const result = await kioskLogin(emp.id);
      setSession(result.employee, result.employee.store_ids[0] ?? null);
      queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
      navigate("/punch/board");
    } catch {
      setLoginError(
        "申し訳ございません、打刻の準備ができませんでした。しばらくしてからもう一度お試しください。",
      );
    } finally {
      setSubmittingEmployeeId(null);
    }
  };

  const closeAdminGate = () => {
    setAdminGateOpen(false);
    setAdminPin("");
    setAdminPinSubmitted(false);
    adminGateMutation.reset();
  };

  const submitAdminGate = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAdminPinSubmitted(true);
    if (!/^\d{4,6}$/.test(adminPin)) return;
    adminGateMutation.mutate(adminPin);
  };

  const adminPinEmpty = adminPinSubmitted && adminPin.length === 0;
  const adminPinInvalid = adminPinSubmitted && adminPin.length > 0 && !/^\d{4,6}$/.test(adminPin);

  return (
    <ShojiTransition transitionKey="K01">
      <Stack gap={7} style={{ paddingTop: "var(--space-3)" }}>
        <div className="wa-kiosk-top__controls">
          <div className="wa-kiosk-top__store-switch">
            <span className="wa-kiosk-top__control-label">店舗切り替え</span>
            <StoreSwitcher
              stores={storeOptions}
              value={storeFilter as StoreSwitcherValue}
              onChange={(next) => setStoreFilter(next)}
              includeAll={false}
            />
          </div>
          <SumiButton variant="secondary" size="md" onClick={() => setAdminGateOpen(true)}>
            管理者画面へ
          </SumiButton>
        </div>

        {/* 上段: 見出し + 大時計 */}
        <Inline justify="space-between" align="flex-start">
          <Stack gap={3}>
            <Heading level={1} eyebrow="SUZUMEAN ／ TIMECARD">
              ようこそ、雀庵へ
            </Heading>
            <p
              style={{
                fontFamily: "var(--font-gothic)",
                fontSize: "var(--fs-body-lg)",
                color: "var(--washi-300)",
                maxWidth: "44ch",
                lineHeight: 1.8,
                margin: 0,
              }}
            >
              はじめに、お名前をお選びください。
            </p>
            <p className="wa-kiosk-top__current-store">
              現在の表示: {storeFilter === "all" ? "本店" : storeShortLabel(storeFilter)}
            </p>
          </Stack>
          <BigClock size="lg" seconds showDate />
        </Inline>

        {/* 従業員タイル */}
        <WashiCard eyebrow="STEP 01" title="お名前を選んでください" padding="lg">
          {loginError ? (
            <p
              role="alert"
              style={{
                color: "var(--danger-ink)",
                fontFamily: "var(--font-gothic)",
                lineHeight: 1.7,
                margin: "0 0 var(--space-4)",
              }}
            >
              {loginError}
            </p>
          ) : null}
          {employeesQuery.isLoading ? (
            <p
              style={{
                color: "var(--washi-300)",
                fontFamily: "var(--font-gothic)",
              }}
            >
              読み込み中…
            </p>
          ) : employeesQuery.isError ? (
            <p
              style={{
                color: "var(--danger-ink)",
                fontFamily: "var(--font-gothic)",
              }}
            >
              申し訳ございません、従業員情報を取得できませんでした。
              しばらくしてからもう一度お試しください。
            </p>
          ) : visible.length === 0 ? (
            <p
              style={{
                color: "var(--washi-300)",
                fontFamily: "var(--font-gothic)",
              }}
            >
              該当する方がいません。店舗フィルタを切り替えてください。
            </p>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
                gap: "var(--space-4)",
              }}
            >
              {visible.map((e) => (
                <EmployeeTile
                  key={e.id}
                  name={e.name}
                  kana={e.kana}
                  state="idle"
                  disabled={submittingEmployeeId != null}
                  onClick={() => onSelect(e)}
                />
              ))}
            </div>
          )}
        </WashiCard>

        {submittingEmployeeId != null ? (
          <p
            style={{
              color: "var(--washi-300)",
              fontFamily: "var(--font-gothic)",
              margin: 0,
            }}
          >
            打刻画面へ進んでいます…
          </p>
        ) : null}

        <Modal
          open={adminGateOpen}
          onClose={closeAdminGate}
          eyebrow="PIN"
          title="管理者画面へ進む"
          maxWidth="520px"
          footer={
            <>
              <SumiButton
                variant="ghost"
                onClick={closeAdminGate}
                disabled={adminGateMutation.isPending}
              >
                戻る
              </SumiButton>
              <SumiButton
                variant="primary"
                form="admin-gate-form"
                type="submit"
                disabled={adminGateMutation.isPending}
              >
                {adminGateMutation.isPending ? "確認しています…" : "管理者ログインへ"}
              </SumiButton>
            </>
          }
        >
          <form
            id="admin-gate-form"
            className="wa-kiosk-top__admin-form"
            onSubmit={submitAdminGate}
          >
            <Stack gap={4}>
              <p className="wa-kiosk-top__admin-copy">
                共用端末から管理者画面へ進む前に、管理者用 PIN をご入力ください。
              </p>

              <label className="wa-kiosk-top__field">
                <span className="wa-kiosk-top__field-label">管理者 PIN</span>
                <input
                  className={`wa-kiosk-top__pin-input ${
                    adminPinEmpty || adminPinInvalid ? "is-invalid" : ""
                  }`}
                  type="tel"
                  inputMode="numeric"
                  autoComplete="off"
                  enterKeyHint="done"
                  maxLength={6}
                  data-autofocus="true"
                  placeholder="4〜6桁の数字"
                  value={adminPin}
                  onChange={(event) =>
                    setAdminPin(event.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                  aria-invalid={adminPinEmpty || adminPinInvalid}
                  disabled={adminGateMutation.isPending}
                />
                {adminPinEmpty ? (
                  <span className="wa-kiosk-top__field-error">PIN をご入力ください。</span>
                ) : null}
                {adminPinInvalid ? (
                  <span className="wa-kiosk-top__field-error">
                    PIN は 4〜6 桁の数字でご入力ください。
                  </span>
                ) : null}
              </label>

              {adminGateMutation.isError ? (
                <div className="wa-kiosk-top__admin-error" role="alert">
                  PIN が違います。もう一度ご確認ください。
                </div>
              ) : null}
            </Stack>
          </form>
        </Modal>
      </Stack>
    </ShojiTransition>
  );
}
