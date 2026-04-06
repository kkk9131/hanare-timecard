import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { type AuditLog, type Employee, listAudit, listEmployees } from "../api/admin";
import { Heading } from "../components/ui/Heading";
import { Inline, Stack } from "../components/ui/Stack";
import { SumiButton } from "../components/ui/SumiButton";
import { WashiCard } from "../components/ui/WashiCard";
import "./AdminAudit.css";

const PAGE_SIZE = 50;

// よく使われるアクション種別 (api-spec / docs から抜粋)
const ACTION_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "すべて" },
  { value: "punch.create", label: "打刻 作成" },
  { value: "punch.update", label: "打刻 修正" },
  { value: "correction.approve", label: "修正申請 承認" },
  { value: "correction.reject", label: "修正申請 却下" },
  { value: "shift.create", label: "シフト 作成" },
  { value: "shift.update", label: "シフト 更新" },
  { value: "shift.publish", label: "シフト 公開" },
  { value: "employee.create", label: "従業員 追加" },
  { value: "employee.update", label: "従業員 更新" },
  { value: "employee.retire", label: "従業員 退職処理" },
  { value: "store.create", label: "店舗 追加" },
  { value: "store.update", label: "店舗 更新" },
];

function formatDateTime(ms: number): { date: string; time: string } {
  const d = new Date(ms);
  const date = `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  return { date, time };
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function tryParseJson(s: string | null): unknown {
  if (s == null || s === "") return null;
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

/**
 * before / after を比べて変化したフィールドのみ簡易表示。
 * オブジェクトでない場合は文字列化のみ。
 */
function diffFields(
  before: unknown,
  after: unknown,
): Array<{ key: string; from: string; to: string }> {
  if (before == null || after == null || typeof before !== "object" || typeof after !== "object") {
    return [];
  }
  const b = before as Record<string, unknown>;
  const a = after as Record<string, unknown>;
  const keys = new Set([...Object.keys(b), ...Object.keys(a)]);
  const out: Array<{ key: string; from: string; to: string }> = [];
  for (const k of keys) {
    const bv = b[k];
    const av = a[k];
    if (JSON.stringify(bv) !== JSON.stringify(av)) {
      out.push({
        key: k,
        from: bv == null ? "—" : typeof bv === "object" ? JSON.stringify(bv) : String(bv),
        to: av == null ? "—" : typeof av === "object" ? JSON.stringify(av) : String(av),
      });
    }
  }
  return out;
}

function actionLabel(action: string): string {
  const found = ACTION_OPTIONS.find((o) => o.value === action);
  return found ? found.label : action;
}

function actionTone(action: string): "neutral" | "warn" | "create" | "delete" {
  if (action.endsWith(".create") || action.endsWith(".publish")) return "create";
  if (action.endsWith(".retire") || action.endsWith(".reject") || action.endsWith(".delete"))
    return "delete";
  if (action.endsWith(".update") || action.endsWith(".approve")) return "warn";
  return "neutral";
}

// ---------- page ----------

export function AdminAuditPage() {
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [actorId, setActorId] = useState<number | "">("");
  const [action, setAction] = useState<string>("");
  const [offset, setOffset] = useState<number>(0);

  const employeesQuery = useQuery({
    queryKey: ["employees-all"],
    queryFn: ({ signal }) => listEmployees({ include_retired: true }, signal),
  });
  const employees = employeesQuery.data ?? [];
  const employeeById = useMemo(() => {
    const m = new Map<number, Employee>();
    for (const e of employees) m.set(e.id, e);
    return m;
  }, [employees]);

  const queryKey = ["audit", { from, to, actorId, action, offset }] as const;
  const auditQuery = useQuery({
    queryKey,
    queryFn: ({ signal }) =>
      listAudit(
        {
          from: from || undefined,
          to: to || undefined,
          actor_id: actorId === "" ? undefined : actorId,
          action: action || undefined,
          limit: PAGE_SIZE,
          offset,
        },
        signal,
      ),
  });

  const logs: AuditLog[] = auditQuery.data?.logs ?? [];
  const hasNext = logs.length === PAGE_SIZE;
  const hasPrev = offset > 0;

  function resetOffset<T>(setter: (v: T) => void, v: T) {
    setter(v);
    setOffset(0);
  }

  return (
    <Stack gap={6} className="wa-audit">
      <header className="wa-audit__header">
        <div>
          <Heading level={1} eyebrow="A07 ／ Audit">
            年表に記す
          </Heading>
          <p className="wa-audit__lede">
            打刻・修正・公開・マスタ変更の足跡。記録は読み取り専用で、削除はできません。
          </p>
        </div>
      </header>

      <WashiCard title="絞り込み" eyebrow="Filter">
        <Stack gap={4}>
          <Inline gap={4} align="flex-end">
            <label className="wa-audit__field">
              <span className="wa-audit__fieldLabel">期間 開始</span>
              <input
                type="date"
                className="wa-audit__date"
                value={from}
                max={to || undefined}
                onChange={(e) => resetOffset(setFrom, e.target.value)}
              />
            </label>
            <span className="wa-audit__bridge" aria-hidden="true">
              ─
            </span>
            <label className="wa-audit__field">
              <span className="wa-audit__fieldLabel">期間 終了</span>
              <input
                type="date"
                className="wa-audit__date"
                value={to}
                min={from || undefined}
                onChange={(e) => resetOffset(setTo, e.target.value)}
              />
            </label>
          </Inline>
          <Inline gap={4} align="flex-end">
            <label className="wa-audit__field">
              <span className="wa-audit__fieldLabel">行為者</span>
              <select
                className="wa-audit__select"
                value={actorId === "" ? "" : String(actorId)}
                onChange={(e) =>
                  resetOffset(setActorId, e.target.value === "" ? "" : Number(e.target.value))
                }
              >
                <option value="">すべて</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="wa-audit__field">
              <span className="wa-audit__fieldLabel">アクション</span>
              <select
                className="wa-audit__select"
                value={action}
                onChange={(e) => resetOffset(setAction, e.target.value)}
              >
                {ACTION_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <SumiButton
              variant="ghost"
              size="sm"
              onClick={() => {
                setFrom("");
                setTo("");
                setActorId("");
                setAction("");
                setOffset(0);
              }}
            >
              リセット
            </SumiButton>
          </Inline>
        </Stack>
      </WashiCard>

      <WashiCard
        title={`記録 ${offset + 1}–${offset + logs.length}`}
        eyebrow="Log"
        action={
          <span className="wa-audit__page" aria-live="polite">
            巻 {Math.floor(offset / PAGE_SIZE) + 1}
          </span>
        }
      >
        {auditQuery.isLoading ? (
          <p className="wa-audit__loading">読み込み中…</p>
        ) : auditQuery.isError ? (
          <p className="wa-audit__error">監査ログの取得に失敗しました</p>
        ) : logs.length === 0 ? (
          <p className="wa-audit__empty">該当する記録はありません。</p>
        ) : (
          <ol className="wa-audit__timeline">
            {logs.map((log) => {
              const dt = formatDateTime(log.occurred_at);
              const actor =
                log.actor_id != null
                  ? (employeeById.get(log.actor_id)?.name ?? `#${log.actor_id}`)
                  : "system";
              const before = tryParseJson(log.before_json);
              const after = tryParseJson(log.after_json);
              const diff = diffFields(before, after);
              const tone = actionTone(log.action);
              return (
                <li key={log.id} className={`wa-audit__row wa-audit__row--${tone}`}>
                  <div className="wa-audit__time">
                    <span className="wa-audit__timeDate">{dt.date}</span>
                    <span className="wa-audit__timeTime">{dt.time}</span>
                  </div>
                  <div className="wa-audit__dot" aria-hidden="true" />
                  <div className="wa-audit__body">
                    <div className="wa-audit__head">
                      <span className={`wa-audit__action wa-audit__action--${tone}`}>
                        {actionLabel(log.action)}
                      </span>
                      <span className="wa-audit__entity">
                        {log.entity_type ?? ""}
                        {log.entity_id != null ? ` #${log.entity_id}` : ""}
                      </span>
                      <span className="wa-audit__actor">{actor}</span>
                    </div>
                    {diff.length > 0 ? (
                      <ul className="wa-audit__diff">
                        {diff.slice(0, 6).map((d) => (
                          <li key={d.key} className="wa-audit__diffItem">
                            <span className="wa-audit__diffKey">{d.key}</span>
                            <span className="wa-audit__diffFrom">{d.from}</span>
                            <span className="wa-audit__diffArrow" aria-hidden="true">
                              →
                            </span>
                            <span className="wa-audit__diffTo">{d.to}</span>
                          </li>
                        ))}
                        {diff.length > 6 ? (
                          <li className="wa-audit__diffMore">他 {diff.length - 6} 件</li>
                        ) : null}
                      </ul>
                    ) : before == null && after != null ? (
                      <div className="wa-audit__plain">
                        <span className="wa-audit__plainLabel">作成</span>
                        <code className="wa-audit__plainBody">
                          {typeof after === "object" ? JSON.stringify(after) : String(after)}
                        </code>
                      </div>
                    ) : after == null && before != null ? (
                      <div className="wa-audit__plain">
                        <span className="wa-audit__plainLabel">削除</span>
                        <code className="wa-audit__plainBody">
                          {typeof before === "object" ? JSON.stringify(before) : String(before)}
                        </code>
                      </div>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
        )}

        <div className="wa-audit__pager">
          <SumiButton
            variant="ghost"
            size="sm"
            disabled={!hasPrev}
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
          >
            ← 前の巻
          </SumiButton>
          <span className="wa-audit__pagerMeta">
            {offset + 1} – {offset + logs.length}
          </span>
          <SumiButton
            variant="ghost"
            size="sm"
            disabled={!hasNext}
            onClick={() => setOffset(offset + PAGE_SIZE)}
          >
            次の巻 →
          </SumiButton>
        </div>
      </WashiCard>
    </Stack>
  );
}
