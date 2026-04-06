import type { Store } from "../api/admin";
import "./StoreSwitcher.css";

export type StoreFilter = number | "all";

type StoreSwitcherProps = {
  stores: Store[];
  value: StoreFilter;
  onChange: (next: StoreFilter) => void;
  /** 「全店舗」選択肢を出すか (default true) */
  includeAll?: boolean;
};

/**
 * 店舗切替タブ。雀庵 / 雀庵はなれ / 全店舗。
 * 色だけに頼らず選択中はアンダーラインと aria-pressed で示す。
 */
export function StoreSwitcher({ stores, value, onChange, includeAll = true }: StoreSwitcherProps) {
  return (
    <fieldset className="wa-store-switcher">
      <legend className="sr-only">店舗切替</legend>
      {stores.map((s) => {
        const active = value === s.id;
        return (
          <button
            key={s.id}
            type="button"
            className={`wa-store-switcher__tab ${active ? "is-active" : ""}`}
            aria-pressed={active}
            onClick={() => onChange(s.id)}
          >
            <span className="wa-store-switcher__label">{s.display_name || s.name}</span>
          </button>
        );
      })}
      {includeAll ? (
        <button
          type="button"
          className={`wa-store-switcher__tab ${value === "all" ? "is-active" : ""}`}
          aria-pressed={value === "all"}
          onClick={() => onChange("all")}
        >
          <span className="wa-store-switcher__label">全店舗</span>
        </button>
      ) : null}
    </fieldset>
  );
}
