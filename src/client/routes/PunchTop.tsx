import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { fetchPublicEmployees, type PublicEmployee } from "../api/auth";
import type { ApiError } from "../api/client";
import { BigClock } from "../components/ui/BigClock";
import { EmployeeTile } from "../components/ui/EmployeeTile";
import { Heading } from "../components/ui/Heading";
import { ShojiTransition } from "../components/ui/ShojiTransition";
import { Inline, Stack } from "../components/ui/Stack";
import { SumiButton } from "../components/ui/SumiButton";
import { WashiCard } from "../components/ui/WashiCard";
import { storeShortLabel } from "../lib/storeLabels";
import { useKioskStore } from "../state/kioskStore";

/**
 * K01 打刻トップ。店舗フィルタタブ + 大時計 + 従業員タイル一覧。
 *
 * 受け入れ条件:
 * - 従業員一覧を kana 順に表示
 * - 名前タップで K02 へ進む
 * - 店舗フィルタで「全店」「雀庵 本店」「雀庵はなれ」を切替可能
 */
export function PunchTop() {
  const navigate = useNavigate();
  const storeFilter = useKioskStore((s) => s.storeFilter);
  const setStoreFilter = useKioskStore((s) => s.setStoreFilter);
  const selectEmployee = useKioskStore((s) => s.selectEmployee);

  const employeesQuery = useQuery<PublicEmployee[], ApiError>({
    queryKey: ["public-employees"],
    queryFn: ({ signal }) => fetchPublicEmployees(undefined, signal),
    staleTime: 30_000,
  });

  // 店舗 ID 一覧 (フィルタタブ用)
  const storeIds = useMemo(() => {
    const set = new Set<number>();
    for (const e of employeesQuery.data ?? []) {
      for (const id of e.store_ids) set.add(id);
    }
    return Array.from(set).sort((a, b) => a - b);
  }, [employeesQuery.data]);

  // 表示対象 (store filter 適用)
  const visible = useMemo(() => {
    const all = employeesQuery.data ?? [];
    if (storeFilter === "all") return all;
    return all.filter((e) => e.store_ids.includes(storeFilter));
  }, [employeesQuery.data, storeFilter]);

  const onSelect = (emp: PublicEmployee) => {
    selectEmployee(emp);
    navigate("/punch/pin");
  };

  return (
    <ShojiTransition transitionKey="K01">
      <Stack gap={7} style={{ paddingTop: "var(--space-3)" }}>
        {/* 上段: 見出し + 大時計 */}
        <Inline justify="space-between" align="flex-start">
          <Stack gap={3}>
            <Heading level={1} eyebrow="JAKUAN ／ TIMECARD">
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
          </Stack>
          <BigClock size="lg" seconds showDate />
        </Inline>

        {/* 店舗フィルタ */}
        {storeIds.length > 1 ? (
          <Inline gap={2} aria-label="店舗フィルタ" role="tablist">
            <SumiButton
              variant={storeFilter === "all" ? "primary" : "ghost"}
              size="sm"
              onClick={() => setStoreFilter("all")}
              aria-pressed={storeFilter === "all"}
              role="tab"
            >
              全て
            </SumiButton>
            {storeIds.map((id) => (
              <SumiButton
                key={id}
                variant={storeFilter === id ? "primary" : "ghost"}
                size="sm"
                onClick={() => setStoreFilter(id)}
                aria-pressed={storeFilter === id}
                role="tab"
              >
                {storeShortLabel(id)}
              </SumiButton>
            ))}
          </Inline>
        ) : null}

        {/* 従業員タイル */}
        <WashiCard eyebrow="STEP 01" title="お名前を選んでください" padding="lg">
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
                  onClick={() => onSelect(e)}
                />
              ))}
            </div>
          )}
        </WashiCard>
      </Stack>
    </ShojiTransition>
  );
}
