import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { buildExportUrl, type ExportFormat, listStores, type Store } from "../api/admin";
import { Heading } from "../components/ui/Heading";
import { Inline, Stack } from "../components/ui/Stack";
import { SumiButton } from "../components/ui/SumiButton";
import { Toast } from "../components/ui/Toast";
import { WashiCard } from "../components/ui/WashiCard";
import "./AdminExports.css";

// ---------- date helpers ----------

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function thisMonthRange(now = new Date()): { from: string; to: string } {
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { from: isoDate(from), to: isoDate(to) };
}

function lastMonthRange(now = new Date()): { from: string; to: string } {
  const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const to = new Date(now.getFullYear(), now.getMonth(), 0);
  return { from: isoDate(from), to: isoDate(to) };
}

function thisQuarterRange(now = new Date()): { from: string; to: string } {
  const q = Math.floor(now.getMonth() / 3); // 0..3
  const from = new Date(now.getFullYear(), q * 3, 1);
  const to = new Date(now.getFullYear(), q * 3 + 3, 0);
  return { from: isoDate(from), to: isoDate(to) };
}

// ---------- filename builder (server と同じ規約) ----------

function buildFilename(
  format: ExportFormat,
  from: string,
  to: string,
  store?: Store | null,
): string {
  const storePart = store ? store.name : "全店舗";
  // 同月内なら hanare-2026-04, それ以外は hanare-from_to
  const sameMonth = from.slice(0, 7) === to.slice(0, 7);
  const period = sameMonth ? from.slice(0, 7) : `${from}_${to}`;
  return `hanare-${storePart}-${period}.${format}`;
}

// ---------- page ----------

type Quick = "this-month" | "last-month" | "this-quarter";

export function AdminExportsPage() {
  const storesQuery = useQuery({
    queryKey: ["stores"],
    queryFn: ({ signal }) => listStores(signal),
  });

  const initial = useMemo(() => thisMonthRange(), []);
  const [from, setFrom] = useState<string>(initial.from);
  const [to, setTo] = useState<string>(initial.to);
  const [storeId, setStoreId] = useState<number | "all">("all");
  const [format, setFormat] = useState<ExportFormat>("xlsx");
  const [activeQuick, setActiveQuick] = useState<Quick | null>("this-month");
  const [toast, setToast] = useState<{ msg: string; key: number } | null>(null);

  const stores = storesQuery.data ?? [];
  const selectedStore = storeId === "all" ? null : (stores.find((s) => s.id === storeId) ?? null);

  const periodValid = from && to && from <= to;

  function applyQuick(q: Quick) {
    const r =
      q === "this-month"
        ? thisMonthRange()
        : q === "last-month"
          ? lastMonthRange()
          : thisQuarterRange();
    setFrom(r.from);
    setTo(r.to);
    setActiveQuick(q);
  }

  function onPeriodChange(setter: (v: string) => void, v: string) {
    setter(v);
    setActiveQuick(null);
  }

  function download(fmt: ExportFormat) {
    if (!periodValid) {
      setToast({
        msg: "期間が正しくありません。開始日と終了日をご確認ください",
        key: Date.now(),
      });
      return;
    }
    const url = buildExportUrl({
      format: fmt,
      from,
      to,
      store_id: storeId === "all" ? undefined : storeId,
    });
    // ブラウザ標準の保存ダイアログに任せる
    const a = document.createElement("a");
    a.href = url;
    a.rel = "noopener";
    // download 属性は同一オリジンであれば効く
    a.download = buildFilename(fmt, from, to, selectedStore);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setToast({
      msg: `${buildFilename(fmt, from, to, selectedStore)} を保存しました`,
      key: Date.now(),
    });
  }

  function downloadThisMonthXlsx() {
    const r = thisMonthRange();
    setFrom(r.from);
    setTo(r.to);
    setActiveQuick("this-month");
    setFormat("xlsx");
    const url = buildExportUrl({
      format: "xlsx",
      from: r.from,
      to: r.to,
      store_id: storeId === "all" ? undefined : storeId,
    });
    const a = document.createElement("a");
    a.href = url;
    a.rel = "noopener";
    a.download = buildFilename("xlsx", r.from, r.to, selectedStore);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setToast({
      msg: `${buildFilename("xlsx", r.from, r.to, selectedStore)} を保存しました`,
      key: Date.now(),
    });
  }

  return (
    <Stack gap={6} className="wa-export">
      <header className="wa-export__header">
        <div>
          <Heading level={1} eyebrow="A06 ／ Export">
            勤怠を巻き取る
          </Heading>
          <p className="wa-export__lede">
            締日の集計を Excel または CSV
            に書き出します。期間と店舗を選び、ご準備の整った形式で保存してください。
          </p>
        </div>
      </header>

      {/* hero: 今月をワンクリック */}
      <WashiCard highlight padding="lg" className="wa-export__hero">
        <div className="wa-export__heroInner">
          <div className="wa-export__heroText">
            <span className="wa-export__heroEyebrow">本日のおすすめ</span>
            <h2 className="wa-export__heroTitle">今月分を、ひとつまみで</h2>
            <p className="wa-export__heroMeta">
              {initial.from} 〜 {initial.to} ／ {selectedStore?.display_name ?? "全店舗"} ／ xlsx
            </p>
          </div>
          <div className="wa-export__heroAction">
            <SumiButton
              variant="primary"
              size="lg"
              onClick={downloadThisMonthXlsx}
              aria-label="今月分の勤怠をxlsxでダウンロード"
            >
              今月をエクスポート
            </SumiButton>
          </div>
        </div>
      </WashiCard>

      {/* 期間 */}
      <WashiCard title="期間" eyebrow="01 ／ Period">
        <Stack gap={4}>
          <fieldset className="wa-export__quicks">
            <legend className="sr-only">期間クイック選択</legend>
            {[
              { key: "this-month" as const, label: "今月" },
              { key: "last-month" as const, label: "先月" },
              { key: "this-quarter" as const, label: "今四半期" },
            ].map((q) => (
              <button
                key={q.key}
                type="button"
                className={`wa-export__quick ${activeQuick === q.key ? "is-active" : ""}`}
                aria-pressed={activeQuick === q.key}
                onClick={() => applyQuick(q.key)}
              >
                {q.label}
              </button>
            ))}
          </fieldset>
          <Inline gap={4} align="flex-end">
            <label className="wa-export__field">
              <span className="wa-export__fieldLabel">開始日</span>
              <input
                type="date"
                className="wa-export__date"
                value={from}
                max={to || undefined}
                onChange={(e) => onPeriodChange(setFrom, e.target.value)}
              />
            </label>
            <span className="wa-export__bridge" aria-hidden="true">
              ─
            </span>
            <label className="wa-export__field">
              <span className="wa-export__fieldLabel">終了日</span>
              <input
                type="date"
                className="wa-export__date"
                value={to}
                min={from || undefined}
                onChange={(e) => onPeriodChange(setTo, e.target.value)}
              />
            </label>
          </Inline>
          {!periodValid ? (
            <p className="wa-export__warn" role="status">
              開始日は終了日と同日かそれ以前に設定してください。
            </p>
          ) : null}
        </Stack>
      </WashiCard>

      {/* 店舗 */}
      <WashiCard title="店舗" eyebrow="02 ／ Store">
        {storesQuery.isLoading ? (
          <p className="wa-export__loading">店舗を読み込んでいます…</p>
        ) : storesQuery.isError ? (
          <p className="wa-export__error">店舗一覧の取得に失敗しました</p>
        ) : (
          <fieldset className="wa-export__stores">
            <legend className="sr-only">店舗フィルタ</legend>
            <button
              type="button"
              aria-pressed={storeId === "all"}
              className={`wa-export__chip ${storeId === "all" ? "is-active" : ""}`}
              onClick={() => setStoreId("all")}
            >
              <span className="wa-export__chipKana">全店舗</span>
              <span className="wa-export__chipMeta">All Stores</span>
            </button>
            {stores.map((s) => (
              <button
                key={s.id}
                type="button"
                aria-pressed={storeId === s.id}
                className={`wa-export__chip ${storeId === s.id ? "is-active" : ""}`}
                onClick={() => setStoreId(s.id)}
              >
                <span className="wa-export__chipKana">{s.display_name || s.name}</span>
                <span className="wa-export__chipMeta">{s.code}</span>
              </button>
            ))}
          </fieldset>
        )}
      </WashiCard>

      {/* 形式 + ダウンロード */}
      <WashiCard title="形式と書き出し" eyebrow="03 ／ Format">
        <Stack gap={5}>
          <fieldset className="wa-export__formats">
            <legend className="sr-only">出力形式</legend>
            <button
              type="button"
              aria-pressed={format === "xlsx"}
              className={`wa-export__format ${format === "xlsx" ? "is-active" : ""}`}
              onClick={() => setFormat("xlsx")}
            >
              <span className="wa-export__formatKana">Excel</span>
              <span className="wa-export__formatExt">.xlsx</span>
              <span className="wa-export__formatNote">ヘッダー固定 ／ 列幅自動 ／ Excel 2016+</span>
            </button>
            <button
              type="button"
              aria-pressed={format === "csv"}
              className={`wa-export__format ${format === "csv" ? "is-active" : ""}`}
              onClick={() => setFormat("csv")}
            >
              <span className="wa-export__formatKana">CSV</span>
              <span className="wa-export__formatExt">.csv</span>
              <span className="wa-export__formatNote">UTF-8 BOM ／ CRLF ／ Excel 直開き対応</span>
            </button>
          </fieldset>

          <div className="wa-export__summary">
            <div className="wa-export__summaryRow">
              <span className="wa-export__summaryLabel">期間</span>
              <span className="wa-export__summaryValue">
                {from || "—"} 〜 {to || "—"}
              </span>
            </div>
            <div className="wa-export__summaryRow">
              <span className="wa-export__summaryLabel">店舗</span>
              <span className="wa-export__summaryValue">
                {selectedStore?.display_name ?? "全店舗"}
              </span>
            </div>
            <div className="wa-export__summaryRow">
              <span className="wa-export__summaryLabel">形式</span>
              <span className="wa-export__summaryValue">{format.toUpperCase()}</span>
            </div>
            <div className="wa-export__summaryRow">
              <span className="wa-export__summaryLabel">ファイル名</span>
              <span className="wa-export__summaryValue wa-export__summaryFile">
                {periodValid ? buildFilename(format, from, to, selectedStore) : "—"}
              </span>
            </div>
          </div>

          <Inline gap={3}>
            <SumiButton
              variant="primary"
              size="lg"
              disabled={!periodValid}
              onClick={() => download(format)}
            >
              {format === "xlsx" ? "Excel で書き出す" : "CSV で書き出す"}
            </SumiButton>
            <SumiButton
              variant="ghost"
              size="md"
              disabled={!periodValid}
              onClick={() => download(format === "xlsx" ? "csv" : "xlsx")}
            >
              {format === "xlsx" ? "CSV でも書き出す" : "Excel でも書き出す"}
            </SumiButton>
          </Inline>
        </Stack>
      </WashiCard>

      {toast ? (
        <Toast key={toast.key} message={toast.msg} tone="success" onClose={() => setToast(null)} />
      ) : null}
    </Stack>
  );
}
