import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  type CreateStoreBody,
  createStore,
  listStores,
  type Store,
  type UpdateStoreBody,
  updateStore,
} from "../api/admin";
import { Heading } from "../components/ui/Heading";
import { Modal } from "../components/ui/Modal";
import { SumiButton } from "../components/ui/SumiButton";
import { Toast } from "../components/ui/Toast";
import { WashiCard } from "../components/ui/WashiCard";
import "./AdminStores.css";

const WEEKDAYS = [
  { value: 0, label: "日" },
  { value: 1, label: "月" },
  { value: 2, label: "火" },
  { value: 3, label: "水" },
  { value: 4, label: "木" },
  { value: 5, label: "金" },
  { value: 6, label: "土" },
];

type FormState = {
  code: string;
  name: string;
  display_name: string;
  opening_time: string;
  closing_time: string;
  closed_days: number[];
};

type EditMode = { kind: "create" } | { kind: "edit"; store: Store } | null;

type ToastState = {
  tone: "info" | "success" | "danger";
  message: string;
} | null;

function storeBadgeLabel(store: Store): string {
  const code = store.code.trim().toLowerCase();
  if (["jakuan", "zyakuan", "zyakuann", "suzumean"].includes(code)) return "本店";
  if (code === "hanare") return "離れ";
  if (store.display_name.includes("本店")) return "本店";
  if (store.display_name.includes("離れ") || store.display_name.includes("はなれ")) return "離れ";
  return "店舗";
}

function emptyForm(): FormState {
  return {
    code: "",
    name: "",
    display_name: "",
    opening_time: "10:00",
    closing_time: "22:00",
    closed_days: [],
  };
}

function fromStore(s: Store): FormState {
  return {
    code: s.code,
    name: s.name,
    display_name: s.display_name,
    opening_time: s.opening_time ?? "10:00",
    closing_time: s.closing_time ?? "22:00",
    closed_days: s.closed_days ?? [],
  };
}

export function AdminStoresPage() {
  const qc = useQueryClient();
  const [mode, setMode] = useState<EditMode>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [toast, setToast] = useState<ToastState>(null);

  const storesQuery = useQuery<Store[]>({
    queryKey: ["stores", "all"],
    queryFn: ({ signal }) => listStores(signal),
  });

  const createMutation = useMutation({
    mutationFn: (body: CreateStoreBody) => createStore(body),
    onSuccess: () => {
      setToast({ tone: "success", message: "店舗を追加しました。" });
      setMode(null);
      setForm(null);
      qc.invalidateQueries({ queryKey: ["stores"] });
    },
    onError: () => {
      setToast({ tone: "danger", message: "追加に失敗しました。" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (input: { id: number; body: UpdateStoreBody }) => updateStore(input.id, input.body),
    onSuccess: () => {
      setToast({ tone: "success", message: "店舗を更新しました。" });
      setMode(null);
      setForm(null);
      qc.invalidateQueries({ queryKey: ["stores"] });
    },
    onError: () => {
      setToast({ tone: "danger", message: "更新に失敗しました。" });
    },
  });

  function openCreate() {
    setForm(emptyForm());
    setMode({ kind: "create" });
  }

  function openEdit(s: Store) {
    setForm(fromStore(s));
    setMode({ kind: "edit", store: s });
  }

  function submit() {
    if (!form || !mode) return;
    if (form.opening_time >= form.closing_time) {
      setToast({
        tone: "danger",
        message: "営業開始時刻は終了時刻より前である必要があります。",
      });
      return;
    }
    if (mode.kind === "create") {
      createMutation.mutate({ ...form });
    } else {
      updateMutation.mutate({ id: mode.store.id, body: { ...form } });
    }
  }

  const stores = storesQuery.data ?? [];

  return (
    <div className="wa-stores">
      <header className="wa-stores__header">
        <div className="wa-stores__heading">
          <span className="wa-stores__chapter" aria-hidden="true">
            伍
          </span>
          <Heading level={1} eyebrow="A05">
            店舗マスタ
          </Heading>
        </div>
        <SumiButton variant="primary" onClick={openCreate}>
          店舗を追加
        </SumiButton>
      </header>

      {storesQuery.isLoading ? (
        <p className="wa-stores__empty">読み込んでおります…</p>
      ) : storesQuery.isError ? (
        <p className="wa-stores__empty wa-stores__empty--error">店舗一覧の取得に失敗しました。</p>
      ) : stores.length === 0 ? (
        <WashiCard padding="lg">
          <p className="wa-stores__empty">店舗が登録されておりません。</p>
        </WashiCard>
      ) : (
        <div className="wa-stores__grid">
          {stores.map((s, idx) => {
            const closedLabel =
              (s.closed_days ?? []).length === 0
                ? "年中無休"
                : `${(s.closed_days ?? [])
                    .map((d) => WEEKDAYS[d]?.label ?? "")
                    .filter(Boolean)
                    .join("・")}曜定休`;
            return (
              <div
                key={s.id}
                className="wa-stores__item"
                style={{ animationDelay: `${idx * 80}ms` }}
              >
                <WashiCard padding="lg" highlight={idx === 0}>
                  <div className="wa-stores__cardInner">
                    <div className="wa-stores__cardHead">
                      <span className="wa-stores__code">{storeBadgeLabel(s)}</span>
                      <h2 className="wa-stores__name">{s.display_name || s.name}</h2>
                    </div>
                    <dl className="wa-stores__meta">
                      <div className="wa-stores__metaItem">
                        <dt>正式名称</dt>
                        <dd>{s.name}</dd>
                      </div>
                      <div className="wa-stores__metaItem">
                        <dt>営業時間</dt>
                        <dd className="tnum">
                          {s.opening_time ?? "—"}
                          <span className="wa-stores__particle"> から </span>
                          {s.closing_time ?? "—"}
                          <span className="wa-stores__particle"> まで</span>
                        </dd>
                      </div>
                      <div className="wa-stores__metaItem">
                        <dt>定休日</dt>
                        <dd>{closedLabel}</dd>
                      </div>
                    </dl>
                    <div className="wa-stores__actions">
                      <SumiButton variant="ghost" size="sm" onClick={() => openEdit(s)}>
                        編集する
                      </SumiButton>
                    </div>
                  </div>
                </WashiCard>
              </div>
            );
          })}
        </div>
      )}

      <Modal
        open={mode !== null && form !== null}
        onClose={() => {
          setMode(null);
          setForm(null);
        }}
        eyebrow="編"
        title={mode?.kind === "create" ? "店舗を追加" : "店舗を編集"}
        maxWidth="600px"
        footer={
          <>
            <SumiButton
              variant="ghost"
              onClick={() => {
                setMode(null);
                setForm(null);
              }}
            >
              取り消し
            </SumiButton>
            <SumiButton
              variant="primary"
              disabled={!form || createMutation.isPending || updateMutation.isPending}
              onClick={submit}
            >
              {mode?.kind === "create" ? "追加する" : "保存する"}
            </SumiButton>
          </>
        }
      >
        {form ? (
          <div className="wa-stores__form">
            <label className="wa-stores__field">
              <span>内部コード</span>
              <input
                type="text"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                disabled={mode?.kind === "edit"}
              />
            </label>
            <label className="wa-stores__field">
              <span>正式名称</span>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </label>
            <label className="wa-stores__field">
              <span>表示名</span>
              <input
                type="text"
                value={form.display_name}
                onChange={(e) => setForm({ ...form, display_name: e.target.value })}
              />
            </label>
            <div className="wa-stores__timeRow">
              <label className="wa-stores__field">
                <span>開店時刻</span>
                <input
                  type="time"
                  value={form.opening_time}
                  onChange={(e) => setForm({ ...form, opening_time: e.target.value })}
                />
              </label>
              <label className="wa-stores__field">
                <span>閉店時刻</span>
                <input
                  type="time"
                  value={form.closing_time}
                  onChange={(e) => setForm({ ...form, closing_time: e.target.value })}
                />
              </label>
            </div>
            <fieldset className="wa-stores__weekdays">
              <legend>定休日</legend>
              <div className="wa-stores__weekdaysRow">
                {WEEKDAYS.map((d) => {
                  const active = form.closed_days.includes(d.value);
                  return (
                    <button
                      key={d.value}
                      type="button"
                      className={`wa-stores__day ${active ? "is-active" : ""}`}
                      aria-pressed={active}
                      onClick={() =>
                        setForm({
                          ...form,
                          closed_days: active
                            ? form.closed_days.filter((x) => x !== d.value)
                            : [...form.closed_days, d.value].sort((a, b) => a - b),
                        })
                      }
                    >
                      {d.label}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          </div>
        ) : null}
      </Modal>

      {toast ? (
        <Toast message={toast.message} tone={toast.tone} onClose={() => setToast(null)} />
      ) : null}
    </div>
  );
}
