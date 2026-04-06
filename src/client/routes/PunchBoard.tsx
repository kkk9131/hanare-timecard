import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { ApiError } from "../api/client";
import { createPunch, fetchMyState, type MeState, type PunchType } from "../api/punches";
import { BigClock } from "../components/ui/BigClock";
import { Heading } from "../components/ui/Heading";
import { ShojiTransition } from "../components/ui/ShojiTransition";
import { Inline, Stack } from "../components/ui/Stack";
import { StatePill } from "../components/ui/StatePill";
import { SumiButton } from "../components/ui/SumiButton";
import { Toast } from "../components/ui/Toast";
import { WashiCard } from "../components/ui/WashiCard";
import { storeShortLabel } from "../lib/storeLabels";
import { useKioskStore } from "../state/kioskStore";

const PUNCH_LABEL: Record<PunchType, string> = {
  clock_in: "出勤する",
  clock_out: "退勤する",
  break_start: "休憩に入る",
  break_end: "休憩から戻る",
};

const PUNCH_PAST_LABEL: Record<PunchType, string> = {
  clock_in: "出勤",
  clock_out: "退勤",
  break_start: "休憩入り",
  break_end: "休憩戻り",
};

function formatHHMM(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * K03 打刻ボード。現在状態に応じてボタンを enable/disable し、
 * 確認ダイアログを挟んで打刻を実行する。
 */
export function PunchBoard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const session = useKioskStore((s) => s.session);
  const activeStoreId = useKioskStore((s) => s.activeStoreId);
  const setLastPunch = useKioskStore((s) => s.setLastPunch);

  const stateQuery = useQuery<MeState, ApiError>({
    queryKey: ["punches", "me", "state"],
    queryFn: ({ signal }) => fetchMyState(signal),
    staleTime: 0,
  });

  const [confirm, setConfirm] = useState<{
    type: PunchType;
    nowHHMM: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [errorToast, setErrorToast] = useState<string | null>(null);

  // session/activeStoreId が無ければ K01 へ
  useEffect(() => {
    if (!session || activeStoreId == null) {
      navigate("/", { replace: true });
    }
  }, [session, activeStoreId, navigate]);

  if (!session || activeStoreId == null) return null;

  const state = stateQuery.data?.state ?? "off";

  const buttons: Array<{
    type: PunchType;
    enabled: boolean;
    variant: "primary" | "secondary" | "danger" | "ghost";
  }> = (() => {
    switch (state) {
      case "off":
        return [
          { type: "clock_in", enabled: true, variant: "primary" },
          { type: "clock_out", enabled: false, variant: "ghost" },
          { type: "break_start", enabled: false, variant: "ghost" },
          { type: "break_end", enabled: false, variant: "ghost" },
        ];
      case "working":
        return [
          { type: "clock_in", enabled: false, variant: "ghost" },
          { type: "clock_out", enabled: true, variant: "danger" },
          { type: "break_start", enabled: true, variant: "secondary" },
          { type: "break_end", enabled: false, variant: "ghost" },
        ];
      case "on_break":
        return [
          { type: "clock_in", enabled: false, variant: "ghost" },
          { type: "clock_out", enabled: false, variant: "ghost" },
          { type: "break_start", enabled: false, variant: "ghost" },
          { type: "break_end", enabled: true, variant: "primary" },
        ];
    }
  })();

  const askConfirm = (type: PunchType) => {
    if (busy) return;
    setConfirm({ type, nowHHMM: formatHHMM(Date.now()) });
  };

  const doPunch = async (type: PunchType) => {
    setBusy(true);
    setConfirm(null);
    const result = await createPunch({
      punch_type: type,
      store_id: activeStoreId,
    });
    setBusy(false);

    if (result.kind === "ok") {
      setLastPunch({
        employee_name: session.name,
        punch_type: type,
        punched_at: result.data.punch.punched_at,
        message: result.data.message,
      });
      queryClient.invalidateQueries({ queryKey: ["punches", "me", "state"] });
      navigate("/punch/done");
      return;
    }

    if (result.kind === "invalid_transition") {
      setErrorToast(`${PUNCH_LABEL[type]}は今の状態では押せません。最新の状態を読み直します。`);
      stateQuery.refetch();
      return;
    }

    setErrorToast(result.message);
  };

  const stateLabel = state === "working" ? "勤務中" : state === "on_break" ? "休憩中" : "未出勤";
  const stateTone: "success" | "warning" | "neutral" =
    state === "working" ? "success" : state === "on_break" ? "warning" : "neutral";

  const lastPunch = stateQuery.data?.last_punch ?? null;

  return (
    <ShojiTransition transitionKey={`K03-${state}`}>
      <Stack gap={6} style={{ paddingTop: "var(--space-3)" }}>
        {/* 上段: 大時計 + 状態 */}
        <Inline justify="space-between" align="flex-start">
          <Stack gap={2}>
            <Heading level={1} eyebrow="STEP 03">
              {session.name} さん
            </Heading>
            <Inline gap={2}>
              <StatePill tone={stateTone} label={stateLabel} />
              <span
                style={{
                  fontFamily: "var(--font-gothic)",
                  color: "var(--washi-400)",
                  fontSize: "var(--fs-meta)",
                  letterSpacing: "0.12em",
                }}
              >
                {storeShortLabel(activeStoreId)}
              </span>
            </Inline>
            {lastPunch ? (
              <p
                style={{
                  fontFamily: "var(--font-gothic)",
                  color: "var(--washi-300)",
                  margin: 0,
                  fontSize: "var(--fs-body)",
                }}
              >
                直近の記録: {PUNCH_PAST_LABEL[lastPunch.punch_type]} （
                {formatHHMM(lastPunch.punched_at)}）
              </p>
            ) : (
              <p
                style={{
                  fontFamily: "var(--font-gothic)",
                  color: "var(--washi-400)",
                  margin: 0,
                  fontSize: "var(--fs-body)",
                }}
              >
                本日の記録はまだありません。
              </p>
            )}
          </Stack>
          <BigClock size="lg" seconds showDate />
        </Inline>

        {/* ボタン群 */}
        <WashiCard padding="lg" highlight>
          {stateQuery.isLoading ? (
            <p
              style={{
                color: "var(--washi-300)",
                fontFamily: "var(--font-gothic)",
              }}
            >
              現在の状態を確認しています…
            </p>
          ) : stateQuery.isError ? (
            <Stack gap={3}>
              <p
                role="alert"
                style={{
                  color: "var(--danger-ink)",
                  fontFamily: "var(--font-gothic)",
                  margin: 0,
                }}
              >
                申し訳ございません、状態を取得できませんでした。
              </p>
              <SumiButton variant="ghost" size="md" onClick={() => stateQuery.refetch()}>
                もう一度試す
              </SumiButton>
            </Stack>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(220px, 1fr))",
                gap: "var(--space-4)",
              }}
            >
              {buttons.map((b) => (
                <SumiButton
                  key={b.type}
                  variant={b.variant}
                  size="lg"
                  block
                  disabled={!b.enabled || busy}
                  onClick={() => askConfirm(b.type)}
                >
                  {PUNCH_LABEL[b.type]}
                </SumiButton>
              ))}
            </div>
          )}
        </WashiCard>
      </Stack>

      {/* 確認ダイアログ */}
      {confirm ? (
        <ConfirmDialog
          message={`本当に${PUNCH_LABEL[confirm.type].replace("する", "")}しますか？（${confirm.nowHHMM}）`}
          confirmLabel="はい、記録します"
          cancelLabel="いいえ、戻る"
          onConfirm={() => doPunch(confirm.type)}
          onCancel={() => setConfirm(null)}
          danger={confirm.type === "clock_out"}
        />
      ) : null}

      {errorToast ? (
        <Toast
          message={errorToast}
          tone="danger"
          duration={3500}
          onClose={() => setErrorToast(null)}
        />
      ) : null}
    </ShojiTransition>
  );
}

type ConfirmDialogProps = {
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
};

function ConfirmDialog({
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  danger = false,
}: ConfirmDialogProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="確認"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(14, 12, 10, 0.78)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "var(--space-4)",
        zIndex: 50,
      }}
    >
      <div
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border-hairline-strong)",
          borderTop: "2px solid var(--kincha-500)",
          padding: "var(--space-6)",
          maxWidth: "560px",
          width: "100%",
          boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
        }}
      >
        <p
          style={{
            fontFamily: "var(--font-mincho)",
            fontSize: "var(--fs-h2)",
            color: "var(--washi-50)",
            lineHeight: 1.6,
            margin: 0,
            marginBottom: "var(--space-5)",
            letterSpacing: "var(--ls-mincho)",
          }}
        >
          {message}
        </p>
        <Inline gap={3} justify="flex-end">
          <SumiButton variant="ghost" size="lg" onClick={onCancel}>
            {cancelLabel}
          </SumiButton>
          <SumiButton
            variant={danger ? "danger" : "primary"}
            size="lg"
            onClick={onConfirm}
            autoFocus
          >
            {confirmLabel}
          </SumiButton>
        </Inline>
      </div>
    </div>
  );
}
