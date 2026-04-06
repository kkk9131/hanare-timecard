import { useCallback } from "react";
import "./PinPad.css";

type PinPadProps = {
  value: string;
  onChange: (next: string) => void;
  onSubmit?: (value: string) => void;
  /** 最大桁数 (4-6 想定) */
  maxLength?: number;
  /** 入力エラー表示 */
  error?: boolean;
  /** 無効化 (ロック中など) */
  disabled?: boolean;
};

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

/**
 * 10 キー PIN パッド。各キー 64×64 (最低 56×56)。
 * クリア + 決定ボタン付き。
 */
export function PinPad({
  value,
  onChange,
  onSubmit,
  maxLength = 6,
  error = false,
  disabled = false,
}: PinPadProps) {
  const appendDigit = useCallback(
    (d: string) => {
      if (disabled) return;
      if (value.length >= maxLength) return;
      onChange(value + d);
    },
    [value, maxLength, onChange, disabled],
  );

  const clear = useCallback(() => {
    if (disabled) return;
    onChange("");
  }, [onChange, disabled]);

  const submit = useCallback(() => {
    if (disabled) return;
    onSubmit?.(value);
  }, [onSubmit, value, disabled]);

  return (
    <div
      className={`wa-pinpad ${error ? "wa-pinpad--error" : ""} ${disabled ? "wa-pinpad--disabled" : ""}`.trim()}
      aria-disabled={disabled}
    >
      <div
        className="wa-pinpad__display"
        role="status"
        aria-live="polite"
        aria-label={`PIN ${value.length}桁入力中`}
      >
        {Array.from({ length: maxLength }).map((_, i) => {
          const filled = i < value.length;
          return (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length display slots
              key={i}
              className={`wa-pinpad__cell ${filled ? "is-filled" : ""}`}
              aria-hidden="true"
            />
          );
        })}
      </div>
      <div className="wa-pinpad__grid">
        {KEYS.map((k) => (
          <button
            key={k}
            type="button"
            className="wa-pinpad__key"
            onClick={() => appendDigit(k)}
            disabled={disabled}
            aria-label={`数字 ${k}`}
          >
            {k}
          </button>
        ))}
        <button
          type="button"
          className="wa-pinpad__key wa-pinpad__key--util"
          onClick={clear}
          disabled={disabled}
          aria-label="クリア"
        >
          クリア
        </button>
        <button
          type="button"
          className="wa-pinpad__key"
          onClick={() => appendDigit("0")}
          disabled={disabled}
          aria-label="数字 0"
        >
          0
        </button>
        <button
          type="button"
          className="wa-pinpad__key wa-pinpad__key--submit"
          onClick={submit}
          disabled={disabled || value.length === 0}
          aria-label="決定"
        >
          決定
        </button>
      </div>
    </div>
  );
}
