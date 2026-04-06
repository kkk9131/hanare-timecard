import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { pinLogin } from "../api/auth";
import { Heading } from "../components/ui/Heading";
import { PinPad } from "../components/ui/PinPad";
import { ShojiTransition } from "../components/ui/ShojiTransition";
import { Inline, Stack } from "../components/ui/Stack";
import { SumiButton } from "../components/ui/SumiButton";
import { WashiCard } from "../components/ui/WashiCard";
import { useKioskStore } from "../state/kioskStore";

type Status =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "error"; message: string }
  | { kind: "locked"; message: string; lockUntil: number };

/**
 * K02 PIN 入力画面。
 *
 * - 上に「{name} さん、こんばんは」
 * - 中央に PinPad
 * - 失敗時 朱の差し色 + 残り回数
 * - ロック時 lock_until までのカウントダウン
 */
export function PunchPin() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const employee = useKioskStore((s) => s.selectedEmployee);
  const setSession = useKioskStore((s) => s.setSession);

  const [pin, setPin] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [remaining, setRemaining] = useState<number | null>(null);

  // 選択されていない場合は K01 に戻す
  useEffect(() => {
    if (!employee) {
      navigate("/", { replace: true });
    }
  }, [employee, navigate]);

  // ロック中カウントダウン
  const [lockSecondsLeft, setLockSecondsLeft] = useState<number>(0);
  useEffect(() => {
    if (status.kind !== "locked") return;
    const tick = () => {
      const left = Math.max(0, Math.ceil((status.lockUntil - Date.now()) / 1000));
      setLockSecondsLeft(left);
      if (left <= 0) {
        setStatus({ kind: "idle" });
        setPin("");
      }
    };
    tick();
    const id = window.setInterval(tick, 500);
    return () => window.clearInterval(id);
  }, [status]);

  if (!employee) return null;

  const handleSubmit = async (value: string) => {
    if (status.kind === "submitting" || status.kind === "locked") return;
    if (value.length < 4) {
      setStatus({
        kind: "error",
        message: "PIN は 4 桁以上で入力してください",
      });
      return;
    }
    setStatus({ kind: "submitting" });
    const result = await pinLogin(employee.id, value);

    if (result.kind === "ok") {
      setSession(result.data.employee, result.data.employee.store_ids[0] ?? null);
      // AuthGuard の me キャッシュを破棄
      queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
      // 500ms 以内に画面遷移
      navigate("/punch/board");
      return;
    }

    if (result.kind === "locked") {
      setRemaining(null);
      setPin("");
      setStatus({
        kind: "locked",
        message: result.message,
        lockUntil: result.lock_until,
      });
      return;
    }

    if (result.kind === "invalid_pin") {
      setRemaining(result.remaining);
      setPin("");
      setStatus({
        kind: "error",
        message: `申し訳ございません、もう一度 PIN をご確認ください（残り ${result.remaining} 回）`,
      });
      return;
    }

    setStatus({ kind: "error", message: result.message });
  };

  const handleCancel = () => {
    setPin("");
    setStatus({ kind: "idle" });
    navigate("/");
  };

  const isLocked = status.kind === "locked";
  const isError = status.kind === "error";

  return (
    <ShojiTransition transitionKey={`K02-${employee.id}`}>
      <Stack gap={6} style={{ paddingTop: "var(--space-4)" }}>
        <Inline justify="space-between" align="flex-start">
          <Stack gap={2}>
            <Heading level={1} eyebrow="STEP 02">
              {employee.name} さん
            </Heading>
            <p
              style={{
                fontFamily: "var(--font-gothic)",
                color: "var(--washi-300)",
                fontSize: "var(--fs-body-lg)",
                margin: 0,
                lineHeight: 1.7,
              }}
            >
              暗証番号 (4〜6 桁) を入力してください。
            </p>
          </Stack>
          <SumiButton variant="ghost" size="md" onClick={handleCancel}>
            ← 名前選択に戻る
          </SumiButton>
        </Inline>

        <WashiCard padding="lg">
          <Stack gap={5} align="center">
            <PinPad
              value={pin}
              onChange={(next) => {
                setPin(next);
                if (status.kind === "error") setStatus({ kind: "idle" });
              }}
              onSubmit={handleSubmit}
              error={isError}
              disabled={status.kind === "submitting" || isLocked}
            />

            {status.kind === "submitting" ? (
              <p
                style={{
                  color: "var(--washi-300)",
                  fontFamily: "var(--font-gothic)",
                  margin: 0,
                }}
              >
                確認しています…
              </p>
            ) : null}

            {isError ? (
              <p
                role="alert"
                style={{
                  color: "var(--danger-ink)",
                  fontFamily: "var(--font-gothic)",
                  fontSize: "var(--fs-body-lg)",
                  margin: 0,
                  textAlign: "center",
                  lineHeight: 1.7,
                }}
              >
                {status.message}
              </p>
            ) : null}

            {isLocked ? (
              <Stack gap={2} align="center">
                <p
                  role="alert"
                  style={{
                    color: "var(--danger-ink)",
                    fontFamily: "var(--font-gothic)",
                    fontSize: "var(--fs-body-lg)",
                    margin: 0,
                    textAlign: "center",
                    lineHeight: 1.7,
                  }}
                >
                  申し訳ございません、誤入力が続いたため一時的に受付を停止しています。
                  <br />
                  あと {Math.floor(lockSecondsLeft / 60)} 分 {lockSecondsLeft % 60}{" "}
                  秒で再度お試しいただけます。
                </p>
              </Stack>
            ) : null}

            {remaining != null && !isLocked && !isError ? (
              <p
                style={{
                  color: "var(--washi-400)",
                  fontFamily: "var(--font-gothic)",
                  margin: 0,
                  fontSize: "var(--fs-meta)",
                }}
              >
                残り入力可能回数 {remaining} 回
              </p>
            ) : null}
          </Stack>
        </WashiCard>
      </Stack>
    </ShojiTransition>
  );
}
