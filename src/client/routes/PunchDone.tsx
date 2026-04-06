import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { logout } from "../api/auth";
import { Heading } from "../components/ui/Heading";
import { ShojiTransition } from "../components/ui/ShojiTransition";
import { Stack } from "../components/ui/Stack";
import { useKioskStore } from "../state/kioskStore";

const AUTO_BACK_MS = 5000;

/**
 * K04 打刻完了画面。
 *
 * - 大きな完了メッセージを 5 秒表示
 * - 5 秒後に logout してから K01 へ
 */
export function PunchDone() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const lastPunch = useKioskStore((s) => s.lastPunch);
  const resetAll = useKioskStore((s) => s.resetAll);

  useEffect(() => {
    if (!lastPunch) {
      // 直接 URL で来たケース
      navigate("/", { replace: true });
      return;
    }
    let cancelled = false;
    const id = window.setTimeout(async () => {
      if (cancelled) return;
      try {
        await logout();
      } catch {
        // ロガウト失敗しても画面復帰を優先
      }
      queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
      resetAll();
      navigate("/", { replace: true });
    }, AUTO_BACK_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [lastPunch, navigate, queryClient, resetAll]);

  if (!lastPunch) return null;

  return (
    <ShojiTransition transitionKey={`K04-${lastPunch.punched_at}`}>
      <Stack
        gap={5}
        align="center"
        justify="center"
        style={{ minHeight: "60vh", textAlign: "center" }}
      >
        <Heading level={1} eyebrow="ありがとうございました">
          記録しました
        </Heading>
        <p
          style={{
            fontFamily: "var(--font-mincho)",
            fontSize: "var(--fs-h2)",
            color: "var(--washi-50)",
            lineHeight: 1.7,
            letterSpacing: "var(--ls-mincho)",
            maxWidth: "32ch",
            margin: 0,
          }}
        >
          {lastPunch.message}
        </p>
        <p
          style={{
            fontFamily: "var(--font-gothic)",
            fontSize: "var(--fs-meta)",
            color: "var(--washi-400)",
            letterSpacing: "0.18em",
            margin: 0,
          }}
        >
          まもなく最初の画面に戻ります
        </p>
      </Stack>
    </ShojiTransition>
  );
}
