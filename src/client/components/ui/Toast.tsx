import { useEffect, useState } from "react";
import "./Toast.css";

type Tone = "info" | "success" | "danger";

type ToastProps = {
  message: string;
  tone?: Tone;
  /** 表示時間 (ms)。0 で自動消去しない */
  duration?: number;
  /** 閉じたとき */
  onClose?: () => void;
};

/**
 * 打刻完了・エラーのフィードバック通知。画面下中央に現れる。
 */
export function Toast({ message, tone = "info", duration = 3200, onClose }: ToastProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (duration <= 0) return;
    const id = window.setTimeout(() => {
      setVisible(false);
      onClose?.();
    }, duration);
    return () => window.clearTimeout(id);
  }, [duration, onClose]);

  if (!visible) return null;

  return (
    <div
      className={`wa-toast wa-toast--${tone}`}
      role={tone === "danger" ? "alert" : "status"}
      aria-live={tone === "danger" ? "assertive" : "polite"}
    >
      <span className="wa-toast__bar" aria-hidden="true" />
      <span className="wa-toast__message">{message}</span>
    </div>
  );
}
