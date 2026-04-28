import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Modal } from "./ui/Modal";
import { SumiButton } from "./ui/SumiButton";
import "./AdminOnboardingWizard.css";

export type AdminOnboardingRole = "manager" | "admin";

type AdminOnboardingStep = {
  id: string;
  chapter: string;
  title: string;
  lead: string;
  checks: string[];
  route: string;
  routeLabel: string;
  adminOnly?: boolean;
};

export const ADMIN_ONBOARDING_VERSION = "2026-04-admin-v1";

export const ADMIN_ONBOARDING_STEPS: AdminOnboardingStep[] = [
  {
    id: "whole-flow",
    chapter: "壱",
    title: "まず全体像をそろえる",
    lead: "本店と離れの打刻は、1台の本番サーバーPCに集まります。各端末はアプリを入れるのではなく、同じURLをブラウザで開きます。",
    checks: [
      "本番サーバーPCで表示されたURLを確認する",
      "本店・離れの端末から同じURLを開ける",
      "管理作業は /admin から始める、と決めておく",
    ],
    route: "/admin",
    routeLabel: "ダッシュボードを見る",
  },
  {
    id: "daily-check",
    chapter: "弐",
    title: "毎日の確認場所を覚える",
    lead: "開店中は、ダッシュボードで「いま誰が勤務中か」と「未処理の修正申請があるか」を見るだけで状況をつかめます。",
    checks: [
      "店舗切り替えで確認したい店舗を選ぶ",
      "現在勤務中の人数と休憩中人数を見る",
      "未処理の修正申請があれば一覧で確認する",
    ],
    route: "/admin/corrections",
    routeLabel: "修正申請へ進む",
  },
  {
    id: "weekly-shifts",
    chapter: "参",
    title: "週の準備はシフトから",
    lead: "翌週のシフトは、下書きで入力してから公開します。公開後は従業員の画面にも見えるため、最後に表示を確認します。",
    checks: [
      "シフト画面で対象週と店舗を選ぶ",
      "不足や重複がないか確認する",
      "公開後に従業員側で見えることを確認する",
    ],
    route: "/admin/shifts",
    routeLabel: "シフトを開く",
  },
  {
    id: "masters",
    chapter: "肆",
    title: "初回だけ、従業員と店舗を確認",
    lead: "名前・所属店舗・権限が正しいと、打刻ミスや見えない画面を減らせます。初期パスワードも本番用に変更します。",
    checks: [
      "管理者と店長のパスワードを変更する",
      "従業員の所属店舗と退職者を確認する",
      "店舗名が現場で分かる表記になっているか確認する",
    ],
    route: "/admin/employees",
    routeLabel: "従業員を確認する",
    adminOnly: true,
  },
  {
    id: "month-end",
    chapter: "伍",
    title: "月末はエクスポート",
    lead: "給与計算前は、管理者が期間と店舗を選んでExcelを書き出します。承認済みの修正申請は出力に反映されます。",
    checks: [
      "期間と店舗を選ぶ",
      "通常は xlsx で出力する",
      "氏名・店舗・実働時間・休憩時間をExcelで確認する",
    ],
    route: "/admin/exports",
    routeLabel: "エクスポートへ進む",
    adminOnly: true,
  },
  {
    id: "backup",
    chapter: "陸",
    title: "最後に守り方を決める",
    lead: "ローカル1台運用なので、バックアップの置き場所と復旧時の担当者を決めておくと安心です。",
    checks: [
      "バックアップの保管先を決める",
      "復旧手順は docs/operations.md にあると共有する",
      "困った時は壊れたDBを消さず、先に残す",
    ],
    route: "/admin/audit",
    routeLabel: "監査ログを見る",
    adminOnly: true,
  },
];

export function getAdminOnboardingSteps(role: AdminOnboardingRole): AdminOnboardingStep[] {
  return ADMIN_ONBOARDING_STEPS.filter((step) => role === "admin" || !step.adminOnly);
}

function readFlag(storage: Storage | undefined, key: string): boolean {
  if (!storage) return false;
  try {
    return storage.getItem(key) === "true";
  } catch {
    return false;
  }
}

function writeFlag(storage: Storage | undefined, key: string): void {
  if (!storage) return;
  try {
    storage.setItem(key, "true");
  } catch {
    // 保存できない環境でも、ウィザード本体の操作は継続できる。
  }
}

type AdminOnboardingWizardProps = {
  role?: AdminOnboardingRole;
};

export function AdminOnboardingWizard({ role }: AdminOnboardingWizardProps) {
  const [open, setOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  const steps = useMemo(() => (role ? getAdminOnboardingSteps(role) : []), [role]);
  const storageKey = role ? `hanare:onboarding:${ADMIN_ONBOARDING_VERSION}:${role}` : "";
  const sessionKey = role ? `hanare:onboarding:dismissed:${ADMIN_ONBOARDING_VERSION}:${role}` : "";
  const isLastStep = stepIndex >= steps.length - 1;
  const current = steps[stepIndex];

  useEffect(() => {
    if (!role || steps.length === 0) return;
    const completed = readFlag(window.localStorage, storageKey);
    const dismissedThisSession = readFlag(window.sessionStorage, sessionKey);
    if (!completed && !dismissedThisSession) {
      setOpen(true);
      setStepIndex(0);
    }
  }, [role, sessionKey, steps.length, storageKey]);

  function openGuide() {
    setStepIndex(0);
    setOpen(true);
  }

  function closeForNow() {
    writeFlag(window.sessionStorage, sessionKey);
    setOpen(false);
  }

  function completeGuide() {
    writeFlag(window.localStorage, storageKey);
    setOpen(false);
  }

  if (!role || steps.length === 0) return null;

  return (
    <>
      <button type="button" className="wa-onboarding-entry" onClick={openGuide}>
        <span className="wa-onboarding-entry__rule" aria-hidden="true" />
        <span className="wa-onboarding-entry__label">操作案内</span>
      </button>

      <Modal
        open={open}
        onClose={closeForNow}
        title="はじめの運用確認"
        eyebrow={current?.chapter ?? "壱"}
        maxWidth="720px"
        footer={
          current ? (
            <div className="wa-onboarding__footer">
              <Link className="wa-onboarding__route" to={current.route} onClick={closeForNow}>
                {current.routeLabel}
              </Link>
              <div className="wa-onboarding__actions">
                <SumiButton variant="ghost" size="sm" onClick={closeForNow}>
                  あとで
                </SumiButton>
                <SumiButton
                  variant="ghost"
                  size="sm"
                  onClick={() => setStepIndex((index) => Math.max(index - 1, 0))}
                  disabled={stepIndex === 0}
                >
                  前へ
                </SumiButton>
                {isLastStep ? (
                  <SumiButton variant="primary" size="sm" onClick={completeGuide}>
                    完了
                  </SumiButton>
                ) : (
                  <SumiButton
                    variant="secondary"
                    size="sm"
                    data-autofocus="true"
                    onClick={() => setStepIndex((index) => Math.min(index + 1, steps.length - 1))}
                  >
                    次へ
                  </SumiButton>
                )}
              </div>
            </div>
          ) : null
        }
      >
        {current ? (
          <div className="wa-onboarding">
            <nav className="wa-onboarding__progress" aria-label="案内の進み具合">
              {steps.map((step, index) => (
                <button
                  key={step.id}
                  type="button"
                  className={`wa-onboarding__dot ${index === stepIndex ? "is-active" : ""}`}
                  aria-label={`${index + 1}番目: ${step.title}`}
                  aria-current={index === stepIndex ? "step" : undefined}
                  onClick={() => setStepIndex(index)}
                />
              ))}
            </nav>

            <p className="wa-onboarding__count">
              {stepIndex + 1} / {steps.length}
            </p>
            <h3 className="wa-onboarding__title">{current.title}</h3>
            <p className="wa-onboarding__lead">{current.lead}</p>

            <ul className="wa-onboarding__checks">
              {current.checks.map((check) => (
                <li key={check} className="wa-onboarding__check">
                  <span className="wa-onboarding__mark" aria-hidden="true">
                    済
                  </span>
                  <span>{check}</span>
                </li>
              ))}
            </ul>

            <aside className="wa-onboarding__map" aria-label="運用の流れ">
              <span>打刻端末</span>
              <span aria-hidden="true">→</span>
              <span>管理画面</span>
              <span aria-hidden="true">→</span>
              <span>確認・承認・出力</span>
            </aside>
          </div>
        ) : null}
      </Modal>
    </>
  );
}
