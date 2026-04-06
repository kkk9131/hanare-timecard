import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  approveCorrection,
  type Correction,
  type CorrectionStatus,
  type Employee,
  listCorrections,
  listEmployees,
  rejectCorrection,
} from "../api/admin";
import { Heading } from "../components/ui/Heading";
import { Modal } from "../components/ui/Modal";
import { StatePill } from "../components/ui/StatePill";
import { SumiButton } from "../components/ui/SumiButton";
import { Toast } from "../components/ui/Toast";
import { WashiCard } from "../components/ui/WashiCard";
import "./AdminCorrections.css";

const PUNCH_LABEL: Record<string, string> = {
  clock_in: "出勤",
  clock_out: "退勤",
  break_start: "休憩開始",
  break_end: "休憩終了",
};

function formatHHMM(unixMs: number | null | undefined): string {
  if (unixMs == null) return "—";
  return new Date(unixMs).toLocaleTimeString("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDate(d: string | undefined): string {
  if (!d) return "—";
  // YYYY-MM-DD → 「2026年4月6日 (月)」
  const dt = new Date(`${d}T00:00:00`);
  if (Number.isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  });
}

const STATUS_TABS: { value: CorrectionStatus; label: string }[] = [
  { value: "pending", label: "未処理" },
  { value: "approved", label: "承認済" },
  { value: "rejected", label: "却下済" },
];

const STATUS_TONE: Record<CorrectionStatus, "warning" | "success" | "danger" | "neutral"> = {
  pending: "warning",
  approved: "success",
  rejected: "danger",
};

const STATUS_LABEL: Record<CorrectionStatus, string> = {
  pending: "確認待ち",
  approved: "承認済",
  rejected: "却下",
};

type RejectModalState = {
  correction: Correction;
  comment: string;
} | null;

type ToastState = {
  tone: "info" | "success" | "danger";
  message: string;
} | null;

export function AdminCorrectionsPage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<CorrectionStatus>("pending");
  const [reject, setReject] = useState<RejectModalState>(null);
  const [toast, setToast] = useState<ToastState>(null);

  const correctionsQuery = useQuery<Correction[]>({
    queryKey: ["corrections", status],
    queryFn: ({ signal }) => listCorrections({ status }, signal),
  });

  const employeesQuery = useQuery<Employee[]>({
    queryKey: ["employees", "all-incl-retired"],
    queryFn: ({ signal }) => listEmployees({ include_retired: true }, signal),
    staleTime: 60_000,
  });

  const empNameById = useMemo(() => {
    const m = new Map<number, string>();
    for (const e of employeesQuery.data ?? []) m.set(e.id, e.name);
    return m;
  }, [employeesQuery.data]);

  const approveMutation = useMutation({
    mutationFn: (id: number) => approveCorrection(id),
    onSuccess: () => {
      setToast({ tone: "success", message: "申請を承認しました。" });
      qc.invalidateQueries({ queryKey: ["corrections"] });
    },
    onError: () => {
      setToast({
        tone: "danger",
        message: "承認に失敗しました。状態をご確認ください。",
      });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (input: { id: number; comment: string }) =>
      rejectCorrection(input.id, { review_comment: input.comment }),
    onSuccess: () => {
      setToast({ tone: "success", message: "申請を却下しました。" });
      setReject(null);
      qc.invalidateQueries({ queryKey: ["corrections"] });
    },
    onError: () => {
      setToast({ tone: "danger", message: "却下に失敗しました。" });
    },
  });

  const corrections = correctionsQuery.data ?? [];

  return (
    <div className="wa-corr">
      <header className="wa-corr__header">
        <div className="wa-corr__heading">
          <span className="wa-corr__chapter" aria-hidden="true">
            参
          </span>
          <Heading level={1} eyebrow="A03">
            修正申請審査
          </Heading>
        </div>
        <p className="wa-corr__lead">打刻の取り消しや時刻修正の申請を、承認または却下します。</p>
      </header>

      <nav className="wa-corr__tabs" aria-label="状態フィルタ">
        {STATUS_TABS.map((t) => {
          const active = status === t.value;
          return (
            <button
              key={t.value}
              type="button"
              className={`wa-corr__tab ${active ? "is-active" : ""}`}
              aria-pressed={active}
              onClick={() => setStatus(t.value)}
            >
              {t.label}
            </button>
          );
        })}
      </nav>

      {correctionsQuery.isLoading ? (
        <p className="wa-corr__empty">読み込んでおります…</p>
      ) : correctionsQuery.isError ? (
        <p className="wa-corr__empty wa-corr__empty--error">申請の取得に失敗しました。</p>
      ) : corrections.length === 0 ? (
        <WashiCard padding="lg">
          <p className="wa-corr__empty">該当する申請はございません。</p>
        </WashiCard>
      ) : (
        <ul className="wa-corr__list">
          {corrections.map((c, idx) => {
            const empName = empNameById.get(c.employee_id) ?? "不明な申請者";
            const oldLabel = c.target_punch_id ? "対象の打刻" : "新規打刻";
            const newType = c.requested_type
              ? (PUNCH_LABEL[c.requested_type] ?? c.requested_type)
              : "—";
            return (
              <li
                key={c.id}
                className="wa-corr__item"
                style={{
                  // staggered fade-in
                  animationDelay: `${Math.min(idx, 8) * 60}ms`,
                }}
              >
                <WashiCard padding="lg">
                  <div className="wa-corr__row">
                    <span className="wa-corr__index tnum">{String(idx + 1).padStart(2, "0")}</span>
                    <div className="wa-corr__main">
                      <div className="wa-corr__topline">
                        <span className="wa-corr__name">{empName}</span>
                        <StatePill tone={STATUS_TONE[c.status]} label={STATUS_LABEL[c.status]} />
                      </div>
                      <dl className="wa-corr__meta">
                        <div className="wa-corr__metaItem">
                          <dt>対象日</dt>
                          <dd>{formatDate(c.target_date)}</dd>
                        </div>
                        <div className="wa-corr__metaItem">
                          <dt>区分</dt>
                          <dd>{oldLabel}</dd>
                        </div>
                        <div className="wa-corr__metaItem">
                          <dt>申請内容</dt>
                          <dd>
                            <span className="wa-corr__diff">
                              <span className="wa-corr__diffNew tnum">
                                {formatHHMM(c.requested_value)}
                              </span>
                              <span className="wa-corr__particle"> へ </span>
                              <span className="wa-corr__diffType">{newType}</span>
                            </span>
                          </dd>
                        </div>
                        {c.reason ? (
                          <div className="wa-corr__metaItem wa-corr__metaItem--full">
                            <dt>理由</dt>
                            <dd className="wa-corr__reason">{c.reason}</dd>
                          </div>
                        ) : null}
                        {c.review_comment ? (
                          <div className="wa-corr__metaItem wa-corr__metaItem--full">
                            <dt>審査コメント</dt>
                            <dd className="wa-corr__reason">{c.review_comment}</dd>
                          </div>
                        ) : null}
                      </dl>
                    </div>
                    {c.status === "pending" ? (
                      <div className="wa-corr__actions">
                        <SumiButton
                          variant="primary"
                          size="md"
                          aria-label={`${empName} さんの申請を承認`}
                          disabled={approveMutation.isPending}
                          onClick={() => approveMutation.mutate(c.id)}
                        >
                          承認する
                        </SumiButton>
                        <SumiButton
                          variant="ghost"
                          size="md"
                          aria-label={`${empName} さんの申請を却下`}
                          onClick={() => setReject({ correction: c, comment: "" })}
                        >
                          却下する
                        </SumiButton>
                      </div>
                    ) : null}
                  </div>
                </WashiCard>
              </li>
            );
          })}
        </ul>
      )}

      <Modal
        open={reject !== null}
        onClose={() => setReject(null)}
        eyebrow="却"
        title="却下理由をお書きください"
        footer={
          <>
            <SumiButton variant="ghost" onClick={() => setReject(null)}>
              取り消し
            </SumiButton>
            <SumiButton
              variant="danger"
              disabled={!reject || reject.comment.trim().length === 0 || rejectMutation.isPending}
              onClick={() => {
                if (!reject) return;
                rejectMutation.mutate({
                  id: reject.correction.id,
                  comment: reject.comment.trim(),
                });
              }}
            >
              却下を確定
            </SumiButton>
          </>
        }
      >
        <p className="wa-corr__modalLead">
          申請者に表示される審査コメントです。何が不足しているか具体的にお伝えください。
        </p>
        <textarea
          className="wa-corr__textarea"
          rows={5}
          value={reject?.comment ?? ""}
          onChange={(e) =>
            setReject((prev) => (prev ? { ...prev, comment: e.target.value } : prev))
          }
          placeholder="例: 同日の出勤打刻が既にあるため、対象日をご確認ください。"
        />
      </Modal>

      {toast ? (
        <Toast message={toast.message} tone={toast.tone} onClose={() => setToast(null)} />
      ) : null}
    </div>
  );
}
