import { useCallback, useEffect, useState } from "react";
import { type CorrectionRow, createCorrection, fetchMyCorrections } from "../api/corrections";
import type { PunchType } from "../api/punches";
import { StatePill } from "../components/ui/StatePill";
import { SumiButton } from "../components/ui/SumiButton";
import { WashiCard } from "../components/ui/WashiCard";
import "./MePages.css";
import { fromYmd, jpWeekday, toYmd } from "./me-utils";

const PUNCH_TYPE_OPTIONS: ReadonlyArray<{ value: PunchType; label: string }> = [
  { value: "clock_in", label: "出勤" },
  { value: "clock_out", label: "退勤" },
  { value: "break_start", label: "休憩開始" },
  { value: "break_end", label: "休憩終了" },
];

function tone(s: CorrectionRow["status"]) {
  if (s === "approved") return "success" as const;
  if (s === "rejected") return "danger" as const;
  return "warning" as const;
}

function statusLabel(s: CorrectionRow["status"]) {
  if (s === "approved") return "承認済み";
  if (s === "rejected") return "却下";
  return "申請中";
}

function defaultDate(): string {
  return toYmd(new Date());
}

export function MeCorrections() {
  const [rows, setRows] = useState<CorrectionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // form state
  const [date, setDate] = useState<string>(defaultDate());
  const [punchType, setPunchType] = useState<PunchType>("clock_in");
  const [time, setTime] = useState<string>("09:00");
  const [reason, setReason] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  const reload = useCallback(() => {
    const ac = new AbortController();
    setLoading(true);
    setError(null);
    fetchMyCorrections(ac.signal)
      .then(setRows)
      .catch((e) => {
        if ((e as { name?: string }).name === "AbortError") return;
        setError("申請一覧の取得に失敗しました");
      })
      .finally(() => setLoading(false));
    return () => ac.abort();
  }, []);

  useEffect(() => {
    return reload();
  }, [reload]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);
    if (!reason.trim()) {
      setFormError("理由を入力してください");
      return;
    }
    setSubmitting(true);
    try {
      // 修正後時刻を unix ms に変換
      const [hh, mm] = time.split(":").map((v) => Number.parseInt(v, 10));
      const target = fromYmd(date);
      target.setHours(hh ?? 0, mm ?? 0, 0, 0);

      await createCorrection({
        target_punch_id: null,
        target_date: date,
        requested_value: target.getTime(),
        requested_type: punchType,
        reason: reason.trim(),
      });
      setFormSuccess("申請を送信しました");
      setReason("");
      reload();
    } catch (err) {
      const msg = (err as { message?: string }).message ?? "送信に失敗しました";
      setFormError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="me-page">
      <header className="me-page__head">
        <span className="me-page__eyebrow">E03 — Corrections</span>
        <h1 className="me-page__title">修正申請</h1>
        <p className="me-page__subtitle">打刻漏れや誤打刻を店長に申請できます</p>
      </header>

      <WashiCard padding="lg" eyebrow="新規申請" title="申請フォーム">
        <form className="me-form" onSubmit={handleSubmit}>
          <div className="me-form__field">
            <label className="me-form__label" htmlFor="me-corr-date">
              対象日
            </label>
            <input
              id="me-corr-date"
              type="date"
              className="me-form__input"
              value={date}
              max={toYmd(new Date())}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>
          <div className="me-form__field">
            <label className="me-form__label" htmlFor="me-corr-type">
              打刻種別
            </label>
            <select
              id="me-corr-type"
              className="me-form__select"
              value={punchType}
              onChange={(e) => setPunchType(e.target.value as PunchType)}
            >
              {PUNCH_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="me-form__field">
            <label className="me-form__label" htmlFor="me-corr-time">
              修正後時刻
            </label>
            <input
              id="me-corr-time"
              type="time"
              className="me-form__input"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              required
            />
          </div>
          <div className="me-form__field me-form__field--full">
            <label className="me-form__label" htmlFor="me-corr-reason">
              理由
            </label>
            <textarea
              id="me-corr-reason"
              className="me-form__textarea"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="例: 退勤の打刻を忘れました。実際は 21:30 まで勤務しました。"
              required
              maxLength={1024}
            />
          </div>
          {formError ? <p className="me-form__error">{formError}</p> : null}
          {formSuccess ? <p className="me-form__success">{formSuccess}</p> : null}
          <div className="me-form__actions">
            <SumiButton type="submit" variant="primary" disabled={submitting}>
              {submitting ? "送信中…" : "申請する"}
            </SumiButton>
          </div>
        </form>
      </WashiCard>

      <WashiCard padding="lg" eyebrow="申請履歴" title="申請一覧">
        {loading ? (
          <div className="me-state">読み込んでおります…</div>
        ) : error ? (
          <div className="me-state me-state--error">{error}</div>
        ) : rows.length === 0 ? (
          <div className="me-state">申請はまだありません</div>
        ) : (
          <table className="me-table">
            <thead>
              <tr>
                <th>対象日</th>
                <th>種別</th>
                <th>理由</th>
                <th>状態</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const d = fromYmd(r.target_date);
                const typeLabel =
                  PUNCH_TYPE_OPTIONS.find((o) => o.value === r.requested_type)?.label ?? "—";
                return (
                  <tr key={r.id}>
                    <td className="is-date">
                      {d.getMonth() + 1}/{d.getDate()} ({jpWeekday(d)})
                    </td>
                    <td>{typeLabel}</td>
                    <td>{r.reason}</td>
                    <td>
                      <StatePill tone={tone(r.status)} label={statusLabel(r.status)} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </WashiCard>
    </div>
  );
}
