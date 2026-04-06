import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  type CreateEmployeeBody,
  createEmployee,
  type Employee,
  listEmployees,
  listStores,
  resetEmployeePin,
  retireEmployee,
  type Store,
  type UpdateEmployeeBody,
  updateEmployee,
} from "../api/admin";
import { type StoreFilter, StoreSwitcher } from "../components/StoreSwitcher";
import { Heading } from "../components/ui/Heading";
import { Modal } from "../components/ui/Modal";
import { StatePill } from "../components/ui/StatePill";
import { SumiButton } from "../components/ui/SumiButton";
import { Toast } from "../components/ui/Toast";
import { WashiCard } from "../components/ui/WashiCard";
import "./AdminEmployees.css";

const ROLE_LABEL: Record<string, string> = {
  staff: "従業員",
  manager: "店長",
  admin: "管理者",
};

const ROLE_TONE: Record<"staff" | "manager" | "admin", "neutral" | "warning" | "danger"> = {
  staff: "neutral",
  manager: "warning",
  admin: "danger",
};

function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

type FormMode = { kind: "create" } | { kind: "edit"; employee: Employee } | null;

type PinModalState = { employee: Employee; pin: string } | null;
type RetireModalState = { employee: Employee } | null;
type ToastState = {
  tone: "info" | "success" | "danger";
  message: string;
} | null;

type FormState = {
  name: string;
  kana: string;
  role: "staff" | "manager" | "admin";
  login_id: string;
  password: string;
  pin: string;
  hourly_wage: string;
  hire_date: string;
  store_ids: number[];
  primary_store_id: number | null;
  note: string;
};

function emptyForm(stores: Store[]): FormState {
  const first = stores[0]?.id ?? null;
  return {
    name: "",
    kana: "",
    role: "staff",
    login_id: "",
    password: "",
    pin: "",
    hourly_wage: "",
    hire_date: todayISO(),
    store_ids: first ? [first] : [],
    primary_store_id: first,
    note: "",
  };
}

function fromEmployee(e: Employee): FormState {
  return {
    name: e.name,
    kana: e.kana ?? "",
    role: e.role,
    login_id: e.login_id ?? "",
    password: "",
    pin: "",
    hourly_wage: e.hourly_wage != null ? String(e.hourly_wage) : "",
    hire_date: e.hire_date ?? todayISO(),
    store_ids: e.store_ids ?? [],
    primary_store_id: e.primary_store_id ?? e.store_ids?.[0] ?? null,
    note: e.note ?? "",
  };
}

export function AdminEmployeesPage() {
  const qc = useQueryClient();
  const [storeFilter, setStoreFilter] = useState<StoreFilter>("all");
  const [search, setSearch] = useState("");
  const [includeRetired, setIncludeRetired] = useState(false);
  const [formMode, setFormMode] = useState<FormMode>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [pinModal, setPinModal] = useState<PinModalState>(null);
  const [retireModal, setRetireModal] = useState<RetireModalState>(null);
  const [toast, setToast] = useState<ToastState>(null);

  const storesQuery = useQuery<Store[]>({
    queryKey: ["stores"],
    queryFn: ({ signal }) => listStores(signal),
    staleTime: 60_000,
  });

  const storeIdQuery = storeFilter === "all" ? undefined : storeFilter;

  const employeesQuery = useQuery<Employee[]>({
    queryKey: ["employees", storeIdQuery, includeRetired, search],
    queryFn: ({ signal }) =>
      listEmployees(
        {
          store_id: storeIdQuery,
          include_retired: includeRetired,
          search: search.trim() || undefined,
        },
        signal,
      ),
  });

  const stores = storesQuery.data ?? [];
  const storeNameById = useMemo(() => {
    const m = new Map<number, string>();
    for (const s of stores) m.set(s.id, s.display_name || s.name);
    return m;
  }, [stores]);

  const createMutation = useMutation({
    mutationFn: (body: CreateEmployeeBody) => createEmployee(body),
    onSuccess: () => {
      setToast({ tone: "success", message: "従業員を追加しました。" });
      setFormMode(null);
      setForm(null);
      qc.invalidateQueries({ queryKey: ["employees"] });
    },
    onError: () => {
      setToast({
        tone: "danger",
        message: "追加に失敗しました。入力をご確認ください。",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (input: { id: number; body: UpdateEmployeeBody }) =>
      updateEmployee(input.id, input.body),
    onSuccess: () => {
      setToast({ tone: "success", message: "従業員を更新しました。" });
      setFormMode(null);
      setForm(null);
      qc.invalidateQueries({ queryKey: ["employees"] });
    },
    onError: () => {
      setToast({ tone: "danger", message: "更新に失敗しました。" });
    },
  });

  const pinMutation = useMutation({
    mutationFn: (input: { id: number; pin: string }) =>
      resetEmployeePin(input.id, { pin: input.pin }),
    onSuccess: () => {
      setToast({ tone: "success", message: "PIN を再設定しました。" });
      setPinModal(null);
      qc.invalidateQueries({ queryKey: ["employees"] });
    },
    onError: () => {
      setToast({ tone: "danger", message: "PIN の再設定に失敗しました。" });
    },
  });

  const retireMutation = useMutation({
    mutationFn: (input: { id: number; date: string }) =>
      retireEmployee(input.id, { retire_date: input.date }),
    onSuccess: () => {
      setToast({ tone: "success", message: "退職処理を行いました。" });
      setRetireModal(null);
      qc.invalidateQueries({ queryKey: ["employees"] });
    },
    onError: () => {
      setToast({ tone: "danger", message: "退職処理に失敗しました。" });
    },
  });

  function openCreate() {
    setForm(emptyForm(stores));
    setFormMode({ kind: "create" });
  }

  function openEdit(e: Employee) {
    setForm(fromEmployee(e));
    setFormMode({ kind: "edit", employee: e });
  }

  function submitForm() {
    if (!form || !formMode) return;
    if (form.store_ids.length === 0) {
      setToast({
        tone: "danger",
        message: "所属店舗を 1 つ以上選択してください。",
      });
      return;
    }
    if (formMode.kind === "create") {
      const body: CreateEmployeeBody = {
        name: form.name.trim(),
        kana: form.kana.trim(),
        role: form.role,
        pin: form.pin,
        hourly_wage: form.hourly_wage ? Number(form.hourly_wage) : 0,
        hire_date: form.hire_date,
        store_ids: form.store_ids,
        primary_store_id: form.primary_store_id ?? form.store_ids[0],
        note: form.note || undefined,
      };
      if (form.role !== "staff") {
        body.login_id = form.login_id || undefined;
        body.password = form.password || undefined;
      }
      createMutation.mutate(body);
    } else {
      const body: UpdateEmployeeBody = {
        name: form.name.trim(),
        kana: form.kana.trim(),
        role: form.role,
        hourly_wage: form.hourly_wage ? Number(form.hourly_wage) : 0,
        hire_date: form.hire_date,
        store_ids: form.store_ids,
        primary_store_id: form.primary_store_id ?? form.store_ids[0],
        note: form.note || undefined,
      };
      if (form.role !== "staff") {
        if (form.login_id) body.login_id = form.login_id;
        if (form.password) body.password = form.password;
      }
      updateMutation.mutate({ id: formMode.employee.id, body });
    }
  }

  const employees = employeesQuery.data ?? [];

  return (
    <div className="wa-emp">
      <header className="wa-emp__header">
        <div className="wa-emp__heading">
          <span className="wa-emp__chapter" aria-hidden="true">
            肆
          </span>
          <Heading level={1} eyebrow="A04">
            従業員マスタ
          </Heading>
        </div>
        <SumiButton variant="primary" onClick={openCreate}>
          新規追加
        </SumiButton>
      </header>

      <div className="wa-emp__filters">
        {storesQuery.data ? (
          <StoreSwitcher stores={stores} value={storeFilter} onChange={setStoreFilter} />
        ) : null}
        <div className="wa-emp__search">
          <span className="wa-emp__searchPrompt" aria-hidden="true">
            検 |
          </span>
          <input
            type="search"
            className="wa-emp__searchInput"
            placeholder="氏名 または カナで検索"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="検索"
          />
        </div>
        <label className="wa-emp__toggle">
          <input
            type="checkbox"
            checked={includeRetired}
            onChange={(e) => setIncludeRetired(e.target.checked)}
          />
          <span>退職者も表示</span>
        </label>
      </div>

      {employeesQuery.isLoading ? (
        <p className="wa-emp__empty">読み込んでおります…</p>
      ) : employeesQuery.isError ? (
        <p className="wa-emp__empty wa-emp__empty--error">従業員一覧の取得に失敗しました。</p>
      ) : employees.length === 0 ? (
        <WashiCard padding="lg">
          <p className="wa-emp__empty">該当する従業員はおりません。</p>
        </WashiCard>
      ) : (
        <ul className="wa-emp__list">
          {employees.map((e, idx) => {
            const retired = !!e.retire_date;
            const storeNames = (e.store_ids ?? [])
              .map((sid) => storeNameById.get(sid))
              .filter(Boolean) as string[];
            return (
              <li
                key={e.id}
                className="wa-emp__item"
                style={{ animationDelay: `${Math.min(idx, 8) * 50}ms` }}
              >
                <WashiCard padding="md">
                  <div className="wa-emp__row">
                    <span className="wa-emp__primaryMark" aria-hidden="true">
                      {(e.store_ids?.length ?? 0) > 1 ? "兼" : "主"}
                    </span>
                    <div className="wa-emp__main">
                      <div className="wa-emp__nameLine">
                        <span className="wa-emp__name">{e.name}</span>
                        <span className="wa-emp__kana">{e.kana ?? ""}</span>
                        <StatePill tone={ROLE_TONE[e.role]} label={ROLE_LABEL[e.role] ?? e.role} />
                        {retired ? <StatePill tone="neutral" label="退職済" /> : null}
                      </div>
                      <dl className="wa-emp__meta">
                        <div className="wa-emp__metaItem">
                          <dt>所属店舗</dt>
                          <dd>{storeNames.join(" / ") || "—"}</dd>
                        </div>
                        <div className="wa-emp__metaItem">
                          <dt>時給</dt>
                          <dd className="tnum">
                            {e.hourly_wage != null ? `¥${e.hourly_wage.toLocaleString()}` : "—"}
                          </dd>
                        </div>
                        <div className="wa-emp__metaItem">
                          <dt>入社日</dt>
                          <dd className="tnum">{e.hire_date ?? "—"}</dd>
                        </div>
                        {retired ? (
                          <div className="wa-emp__metaItem">
                            <dt>退職日</dt>
                            <dd className="tnum">{e.retire_date}</dd>
                          </div>
                        ) : null}
                      </dl>
                    </div>
                    <div className="wa-emp__actions">
                      <SumiButton variant="ghost" size="sm" onClick={() => openEdit(e)}>
                        編集
                      </SumiButton>
                      <SumiButton
                        variant="ghost"
                        size="sm"
                        onClick={() => setPinModal({ employee: e, pin: "" })}
                      >
                        PIN リセット
                      </SumiButton>
                      {!retired ? (
                        <SumiButton
                          variant="danger"
                          size="sm"
                          onClick={() => setRetireModal({ employee: e })}
                        >
                          退職処理
                        </SumiButton>
                      ) : null}
                    </div>
                  </div>
                </WashiCard>
              </li>
            );
          })}
        </ul>
      )}

      {/* ---- 追加 / 編集 モーダル ---- */}
      <Modal
        open={formMode !== null && form !== null}
        onClose={() => {
          setFormMode(null);
          setForm(null);
        }}
        eyebrow="編"
        title={formMode?.kind === "create" ? "従業員を追加" : "従業員を編集"}
        maxWidth="720px"
        footer={
          <>
            <SumiButton
              variant="ghost"
              onClick={() => {
                setFormMode(null);
                setForm(null);
              }}
            >
              取り消し
            </SumiButton>
            <SumiButton
              variant="primary"
              disabled={createMutation.isPending || updateMutation.isPending || !form}
              onClick={submitForm}
            >
              {formMode?.kind === "create" ? "追加する" : "保存する"}
            </SumiButton>
          </>
        }
      >
        {form ? (
          <div className="wa-emp__form">
            <div className="wa-emp__formGrid">
              <label className="wa-emp__field">
                <span>氏名</span>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </label>
              <label className="wa-emp__field">
                <span>カナ</span>
                <input
                  type="text"
                  value={form.kana}
                  onChange={(e) => setForm({ ...form, kana: e.target.value })}
                />
              </label>
              <label className="wa-emp__field">
                <span>役割</span>
                <select
                  value={form.role}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      role: e.target.value as FormState["role"],
                    })
                  }
                >
                  <option value="staff">従業員</option>
                  <option value="manager">店長</option>
                  <option value="admin">管理者</option>
                </select>
              </label>
              <label className="wa-emp__field">
                <span>時給 (円)</span>
                <input
                  type="number"
                  min={0}
                  value={form.hourly_wage}
                  onChange={(e) => setForm({ ...form, hourly_wage: e.target.value })}
                />
              </label>
              <label className="wa-emp__field">
                <span>入社日</span>
                <input
                  type="date"
                  value={form.hire_date}
                  onChange={(e) => setForm({ ...form, hire_date: e.target.value })}
                />
              </label>
              {formMode?.kind === "create" ? (
                <label className="wa-emp__field">
                  <span>PIN (4-6 桁)</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]{4,6}"
                    value={form.pin}
                    onChange={(e) => setForm({ ...form, pin: e.target.value })}
                  />
                </label>
              ) : null}
              {form.role !== "staff" ? (
                <>
                  <label className="wa-emp__field">
                    <span>ログイン ID</span>
                    <input
                      type="text"
                      value={form.login_id}
                      onChange={(e) => setForm({ ...form, login_id: e.target.value })}
                    />
                  </label>
                  <label className="wa-emp__field">
                    <span>
                      パスワード
                      {formMode?.kind === "edit" ? "（変更時のみ）" : ""}
                    </span>
                    <input
                      type="password"
                      value={form.password}
                      onChange={(e) => setForm({ ...form, password: e.target.value })}
                    />
                  </label>
                </>
              ) : null}
            </div>

            <fieldset className="wa-emp__stores">
              <legend>所属店舗（複数可）</legend>
              {stores.map((s) => {
                const checked = form.store_ids.includes(s.id);
                const isPrimary = form.primary_store_id === s.id;
                return (
                  <div key={s.id} className="wa-emp__storeRow">
                    <label className="wa-emp__storeCheck">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          const next = e.target.checked
                            ? [...form.store_ids, s.id]
                            : form.store_ids.filter((x) => x !== s.id);
                          let primary = form.primary_store_id;
                          if (!next.includes(primary ?? -1)) {
                            primary = next[0] ?? null;
                          }
                          setForm({
                            ...form,
                            store_ids: next,
                            primary_store_id: primary,
                          });
                        }}
                      />
                      <span>{s.display_name || s.name}</span>
                    </label>
                    <label className="wa-emp__storePrimary">
                      <input
                        type="radio"
                        name="primary_store"
                        checked={isPrimary}
                        disabled={!checked}
                        onChange={() => setForm({ ...form, primary_store_id: s.id })}
                      />
                      <span>主店舗</span>
                    </label>
                  </div>
                );
              })}
            </fieldset>

            <label className="wa-emp__field">
              <span>備考</span>
              <textarea
                rows={3}
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
              />
            </label>
          </div>
        ) : null}
      </Modal>

      {/* ---- PIN リセット モーダル ---- */}
      <Modal
        open={pinModal !== null}
        onClose={() => setPinModal(null)}
        eyebrow="鍵"
        title="PIN を再設定"
        footer={
          <>
            <SumiButton variant="ghost" onClick={() => setPinModal(null)}>
              取り消し
            </SumiButton>
            <SumiButton
              variant="primary"
              disabled={!pinModal || !/^[0-9]{4,6}$/.test(pinModal.pin) || pinMutation.isPending}
              onClick={() => {
                if (!pinModal) return;
                pinMutation.mutate({
                  id: pinModal.employee.id,
                  pin: pinModal.pin,
                });
              }}
            >
              再設定する
            </SumiButton>
          </>
        }
      >
        {pinModal ? (
          <>
            <p className="wa-emp__modalLead">
              {pinModal.employee.name}さんの新しい PIN を入力してください（4〜6 桁の数字）。
            </p>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]{4,6}"
              className="wa-emp__pinInput tnum"
              value={pinModal.pin}
              onChange={(e) => setPinModal({ ...pinModal, pin: e.target.value })}
              aria-label="新しい PIN"
            />
          </>
        ) : null}
      </Modal>

      {/* ---- 退職処理 確認モーダル ---- */}
      <Modal
        open={retireModal !== null}
        onClose={() => setRetireModal(null)}
        eyebrow="退"
        title="退職処理の確認"
        footer={
          <>
            <SumiButton variant="ghost" onClick={() => setRetireModal(null)}>
              取り消し
            </SumiButton>
            <SumiButton
              variant="danger"
              disabled={!retireModal || retireMutation.isPending}
              onClick={() => {
                if (!retireModal) return;
                retireMutation.mutate({
                  id: retireModal.employee.id,
                  date: todayISO(),
                });
              }}
            >
              退職を確定
            </SumiButton>
          </>
        }
      >
        {retireModal ? (
          <p className="wa-emp__retireConfirm">
            {retireModal.employee.name}さんを退職扱いにします。よろしいですか？
          </p>
        ) : null}
      </Modal>

      {toast ? (
        <Toast message={toast.message} tone={toast.tone} onClose={() => setToast(null)} />
      ) : null}
    </div>
  );
}
