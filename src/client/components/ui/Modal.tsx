import { type ReactNode, useEffect, useRef } from "react";
import "./Modal.css";

type ModalProps = {
  open: boolean;
  onClose: () => void;
  /** 明朝の見出し */
  title?: ReactNode;
  /** 見出し上の小さな縦組み章番号 (例: 「参」「肆」) */
  eyebrow?: ReactNode;
  /** 横幅 (px or css value) */
  maxWidth?: string;
  /** 子要素 */
  children: ReactNode;
  /** フッタ右側 (アクション) */
  footer?: ReactNode;
};

/**
 * 和紙片風モーダル。
 * - backdrop 墨黒 + 微細ノイズ
 * - panel WashiCard 風 (上辺 金茶ライン)
 * - ESC で閉じる、初期フォーカスを内側に
 * - クリック外で閉じる
 */
export function Modal({
  open,
  onClose,
  title,
  eyebrow,
  maxWidth = "560px",
  children,
  footer,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    // 初期フォーカス: パネル内最初の focusable
    const t = window.setTimeout(() => {
      const el = panelRef.current?.querySelector<HTMLElement>(
        "input, textarea, select, button, [tabindex]",
      );
      el?.focus();
    }, 30);
    // body スクロール抑制
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      window.clearTimeout(t);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="wa-modal__backdrop">
      <button
        type="button"
        className="wa-modal__scrim"
        aria-label="閉じる"
        tabIndex={-1}
        onClick={onClose}
      />
      <div
        ref={panelRef}
        className="wa-modal__panel"
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === "string" ? title : undefined}
        style={{ maxWidth }}
      >
        <header className="wa-modal__header">
          <div className="wa-modal__titles">
            {eyebrow ? <span className="wa-modal__eyebrow">{eyebrow}</span> : null}
            {title ? <h2 className="wa-modal__title">{title}</h2> : null}
          </div>
          <button type="button" className="wa-modal__close" aria-label="閉じる" onClick={onClose}>
            閉
          </button>
        </header>
        <div className="wa-modal__body">{children}</div>
        {footer ? <footer className="wa-modal__footer">{footer}</footer> : null}
      </div>
    </div>
  );
}
