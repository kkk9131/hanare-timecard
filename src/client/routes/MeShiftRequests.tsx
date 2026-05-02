import { useCallback, useEffect, useState } from "react";
import {
  createShiftRequest,
  deleteShiftRequest,
  fetchMyShiftRequests,
  fetchOpenShiftPeriods,
  type ShiftPeriod,
  type ShiftPreference,
  type ShiftRequestRow,
} from "../api/shifts";
import { Modal } from "../components/ui/Modal";
import { StatePill } from "../components/ui/StatePill";
import { SumiButton } from "../components/ui/SumiButton";
import { WashiCard } from "../components/ui/WashiCard";
import "./MePages.css";
import { fromYmd, jpWeekday, toYmd } from "./me-utils";

const PREFERENCE_OPTIONS: ReadonlyArray<{
  value: ShiftPreference;
  label: string;
  tone: "success" | "warning" | "danger";
}> = [
  { value: "preferred", label: "希望", tone: "success" },
  { value: "available", label: "可", tone: "warning" },
  { value: "unavailable", label: "不可", tone: "danger" },
];

function preferenceMeta(p: ShiftPreference) {
  return PREFERENCE_OPTIONS.find((o) => o.value === p) ?? PREFERENCE_OPTIONS[0];
}

function nextWeekYmd(): string {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return toYmd(d);
}

function addDays(d: Date, n: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + n);
  return next;
}

function enumerateYmd(from: string, to: string): string[] {
  const start = fromYmd(from);
  const end = fromYmd(to);
  const out: string[] = [];
  for (let cur = start; cur.getTime() <= end.getTime(); cur = addDays(cur, 1)) {
    out.push(toYmd(cur));
  }
  return out;
}

export function MeShiftRequests() {
  const [rows, setRows] = useState<ShiftRequestRow[]>([]);
  const [periods, setPeriods] = useState<ShiftPeriod[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // form state
  const [date, setDate] = useState<string>(nextWeekYmd());
  const [preference, setPreference] = useState<ShiftPreference>("preferred");
  const [allDay, setAllDay] = useState<boolean>(true);
  const [startTime, setStartTime] = useState<string>("10:00");
  const [endTime, setEndTime] = useState<string>("18:00");
  const [note, setNote] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [withdrawTarget, setWithdrawTarget] = useState<ShiftRequestRow | null>(null);
  const [withdrawing, setWithdrawing] = useState(false);

  const activePeriod = periods.find((p) => p.id === selectedPeriodId) ?? periods[0] ?? null;

  const reload = useCallback(() => {
    const ac = new AbortController();
    setLoading(true);
    setError(null);
    fetchMyShiftRequests(activePeriod ? { period_id: activePeriod.id } : {}, ac.signal)
      .then(setRows)
      .catch((e) => {
        if ((e as { name?: string }).name === "AbortError") return;
        setError("希望一覧の取得に失敗しました");
      })
      .finally(() => setLoading(false));
    return () => ac.abort();
  }, [activePeriod]);

  useEffect(() => {
    return reload();
  }, [reload]);

  useEffect(() => {
    const ac = new AbortController();
    fetchOpenShiftPeriods(ac.signal)
      .then((next) => {
        setPeriods(next);
        setSelectedPeriodId((current) => current ?? next[0]?.id ?? null);
        const first = next[0];
        if (first) setDate(first.target_from);
      })
      .catch(() => {
        setPeriods([]);
      });
    return () => ac.abort();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);
    if (!allDay && startTime >= endTime) {
      setFormError("開始時刻は終了時刻より前にしてください");
      return;
    }
    setSubmitting(true);
    try {
      await createShiftRequest({
        period_id: activePeriod?.id,
        store_id: activePeriod?.store_id,
        date,
        preference,
        start_time: allDay ? null : startTime,
        end_time: allDay ? null : endTime,
        note: note.trim() || undefined,
      });
      setFormSuccess("希望を提出しました");
      setNote("");
      reload();
    } catch (err) {
      const msg = (err as { message?: string }).message ?? "送信に失敗しました";
      setFormError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!withdrawTarget) return;
    setWithdrawing(true);
    try {
      await deleteShiftRequest(withdrawTarget.id);
      setWithdrawTarget(null);
      reload();
    } catch {
      setError("取り下げに失敗しました");
    } finally {
      setWithdrawing(false);
    }
  };

  const withdrawTargetDate = withdrawTarget ? fromYmd(withdrawTarget.date) : null;
  const withdrawTargetMeta = withdrawTarget ? preferenceMeta(withdrawTarget.preference) : null;
  const withdrawTargetTime = withdrawTarget
    ? withdrawTarget.start_time && withdrawTarget.end_time
      ? `${withdrawTarget.start_time.slice(0, 5)} 〜 ${withdrawTarget.end_time.slice(0, 5)}`
      : "終日"
    : "";
  const periodDates = activePeriod
    ? enumerateYmd(activePeriod.target_from, activePeriod.target_to)
    : [];
  const rowsByDate = new Map(rows.map((r) => [r.date, r]));

  return (
    <div className="me-page">
      <header className="me-page__head">
        <span className="me-page__eyebrow">E05 — Shift Requests</span>
        <h1 className="me-page__title">シフト希望</h1>
        <p className="me-page__subtitle">出勤可能な日時を店長に伝えられます</p>
      </header>

      <WashiCard
        padding="lg"
        eyebrow="希望提出"
        title={activePeriod ? activePeriod.name : "現在提出できる募集はありません"}
      >
        {periods.length > 0 ? (
          <div className="me-request-workspace">
            <section className="me-request-workspace__calendar" aria-label="提出期間と日付選択">
              <div className="me-request-period">
                <div className="me-form__field">
                  <label className="me-form__label" htmlFor="me-period">
                    募集
                  </label>
                  <select
                    id="me-period"
                    className="me-form__select"
                    value={activePeriod?.id ?? ""}
                    onChange={(e) => {
                      const nextId = Number(e.target.value);
                      setSelectedPeriodId(nextId);
                      const next = periods.find((p) => p.id === nextId);
                      if (next) setDate(next.target_from);
                    }}
                  >
                    {periods.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                {activePeriod ? (
                  <p className="me-request-period__meta">
                    対象 {activePeriod.target_from} 〜 {activePeriod.target_to}
                    <span>提出締切 {activePeriod.submission_to}</span>
                  </p>
                ) : null}
              </div>
              <fieldset className="me-request-calendar">
                <legend>シフト希望カレンダー</legend>
                {periodDates.map((ymd) => {
                  const d = fromYmd(ymd);
                  const submitted = rowsByDate.get(ymd);
                  const meta = submitted ? preferenceMeta(submitted.preference) : null;
                  return (
                    <button
                      key={ymd}
                      type="button"
                      className={`me-request-calendar__day${date === ymd ? " is-selected" : ""}${
                        submitted ? " is-submitted" : ""
                      }`}
                      onClick={() => setDate(ymd)}
                    >
                      <span>
                        {d.getMonth() + 1}/{d.getDate()} ({jpWeekday(d)})
                      </span>
                      <strong>{meta ? meta.label : "未提出"}</strong>
                    </button>
                  );
                })}
              </fieldset>
            </section>

            <section className="me-request-workspace__form" aria-label="希望入力">
              <div className="me-request-form-head">
                <span>希望入力</span>
                <strong>{date ? `${date.slice(5, 7)}/${date.slice(8, 10)}` : "日付未選択"}</strong>
              </div>
              <form className="me-form me-form--shift-request" onSubmit={handleSubmit}>
                <div className="me-form__field">
                  <label className="me-form__label" htmlFor="me-req-date">
                    対象日
                  </label>
                  <input
                    id="me-req-date"
                    type="date"
                    className="me-form__input"
                    value={date}
                    min={activePeriod?.target_from ?? toYmd(new Date())}
                    max={activePeriod?.target_to}
                    onChange={(e) => setDate(e.target.value)}
                    required
                  />
                </div>
                <div className="me-form__field">
                  <label className="me-form__label" htmlFor="me-req-pref">
                    希望種別
                  </label>
                  <select
                    id="me-req-pref"
                    className="me-form__select"
                    value={preference}
                    onChange={(e) => setPreference(e.target.value as ShiftPreference)}
                  >
                    {PREFERENCE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="me-form__field me-form__field--full">
                  <label
                    className="me-form__label"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "var(--space-2)",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={allDay}
                      onChange={(e) => setAllDay(e.target.checked)}
                    />
                    終日
                  </label>
                </div>
                {!allDay ? (
                  <>
                    <div className="me-form__field">
                      <label className="me-form__label" htmlFor="me-req-start">
                        開始時刻
                      </label>
                      <input
                        id="me-req-start"
                        type="time"
                        className="me-form__input"
                        value={startTime}
                        onChange={(e) => setStartTime(e.target.value)}
                        required
                      />
                    </div>
                    <div className="me-form__field">
                      <label className="me-form__label" htmlFor="me-req-end">
                        終了時刻
                      </label>
                      <input
                        id="me-req-end"
                        type="time"
                        className="me-form__input"
                        value={endTime}
                        onChange={(e) => setEndTime(e.target.value)}
                        required
                      />
                    </div>
                  </>
                ) : null}
                <div className="me-form__field me-form__field--full">
                  <label className="me-form__label" htmlFor="me-req-note">
                    備考
                  </label>
                  <textarea
                    id="me-req-note"
                    className="me-form__textarea"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    maxLength={512}
                    placeholder="例: 午前中のみ希望"
                  />
                </div>
                {formError ? <p className="me-form__error">{formError}</p> : null}
                {formSuccess ? <p className="me-form__success">{formSuccess}</p> : null}
                <div className="me-form__actions">
                  <SumiButton
                    type="submit"
                    variant="primary"
                    disabled={submitting || !activePeriod}
                  >
                    {submitting ? "送信中…" : "希望を提出"}
                  </SumiButton>
                </div>
              </form>
            </section>
          </div>
        ) : (
          <p className="me-state">今はシフト希望の提出期間ではありません。</p>
        )}
      </WashiCard>

      <WashiCard padding="lg" eyebrow="提出済み" title="希望一覧">
        {loading ? (
          <div className="me-state">読み込んでおります…</div>
        ) : error ? (
          <div className="me-state me-state--error">{error}</div>
        ) : rows.length === 0 ? (
          <div className="me-state">提出済みの希望はありません</div>
        ) : (
          <table className="me-table">
            <thead>
              <tr>
                <th>日付</th>
                <th>時間帯</th>
                <th>種別</th>
                <th>備考</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const d = fromYmd(r.date);
                const meta = preferenceMeta(r.preference);
                const range =
                  r.start_time && r.end_time
                    ? `${r.start_time.slice(0, 5)} 〜 ${r.end_time.slice(0, 5)}`
                    : "終日";
                return (
                  <tr key={r.id}>
                    <td className="is-date">
                      {d.getMonth() + 1}/{d.getDate()} ({jpWeekday(d)})
                    </td>
                    <td>{range}</td>
                    <td>
                      <StatePill tone={meta.tone} label={meta.label} />
                    </td>
                    <td>{r.note ?? ""}</td>
                    <td>
                      <SumiButton
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setWithdrawTarget(r)}
                      >
                        取り下げ
                      </SumiButton>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </WashiCard>

      <Modal
        open={withdrawTarget !== null}
        onClose={() => {
          if (!withdrawing) setWithdrawTarget(null);
        }}
        eyebrow="取"
        title="希望を取り下げますか"
        maxWidth="480px"
        footer={
          <>
            <SumiButton
              variant="ghost"
              onClick={() => setWithdrawTarget(null)}
              disabled={withdrawing}
              aria-label="希望取り下げをキャンセル"
            >
              キャンセル
            </SumiButton>
            <SumiButton
              variant="danger"
              onClick={handleDelete}
              disabled={withdrawing}
              aria-label="希望取り下げを確定"
              data-autofocus="true"
            >
              取り下げを確定
            </SumiButton>
          </>
        }
      >
        {withdrawTarget && withdrawTargetDate && withdrawTargetMeta ? (
          <p>
            {withdrawTargetDate.getMonth() + 1}/{withdrawTargetDate.getDate()} (
            {jpWeekday(withdrawTargetDate)}) の{withdrawTargetMeta.label}・{withdrawTargetTime}
            の希望を取り下げます。
          </p>
        ) : null}
      </Modal>
    </div>
  );
}
