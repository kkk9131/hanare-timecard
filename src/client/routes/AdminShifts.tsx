import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  createShift,
  deleteShift,
  type Employee,
  getShiftConflicts,
  listEmployees,
  listShiftRequests,
  listShifts,
  listStores,
  publishShifts,
  type Shift,
  type ShiftConflictReport,
  type ShiftRequest,
  type Store,
  updateShift,
} from "../api/admin";
import { ApiError } from "../api/client";
import { type StoreFilter, StoreSwitcher } from "../components/StoreSwitcher";
import { Heading } from "../components/ui/Heading";
import { SumiButton } from "../components/ui/SumiButton";
import "./AdminShifts.css";

// ---------- date helpers ----------

const WEEKDAY_JP = ["月", "火", "水", "木", "金", "土", "日"] as const;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function toISO(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function startOfWeekMon(d: Date): Date {
  const dt = new Date(d);
  const dow = (dt.getDay() + 6) % 7; // 月=0
  dt.setDate(dt.getDate() - dow);
  dt.setHours(0, 0, 0, 0);
  return dt;
}

function addDays(d: Date, n: number): Date {
  const dt = new Date(d);
  dt.setDate(dt.getDate() + n);
  return dt;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

function enumerateDates(from: Date, days: number): Date[] {
  return Array.from({ length: days }, (_, i) => addDays(from, i));
}

// ---------- types ----------

type ViewMode = "week" | "month";

type EditorState =
  | { kind: "create"; date: string; employeeId: number }
  | { kind: "edit"; shift: Shift };

type ConfirmState =
  | { kind: "delete"; shift: Shift }
  | { kind: "publish"; draftCount: number; storeId: number; from: string; to: string };

// ---------- main ----------

export function AdminShiftsPage() {
  const queryClient = useQueryClient();

  const storesQuery = useQuery<Store[]>({
    queryKey: ["stores"],
    queryFn: ({ signal }) => listStores(signal),
    staleTime: 60_000,
  });

  const stores = storesQuery.data ?? [];
  const [storeFilter, setStoreFilter] = useState<StoreFilter>("all");

  // 初回 stores 取得後、最初の店舗を自動選択（編成は店舗単位なので "all" は不可）
  useEffect(() => {
    if (stores.length > 0 && storeFilter === "all") {
      const first = stores[0];
      if (first) setStoreFilter(first.id);
    }
  }, [stores, storeFilter]);

  const activeStoreId = typeof storeFilter === "number" ? storeFilter : undefined;

  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [anchorDate, setAnchorDate] = useState<Date>(() => startOfWeekMon(new Date()));

  // range
  const range = useMemo(() => {
    if (viewMode === "week") {
      const from = startOfWeekMon(anchorDate);
      const to = addDays(from, 6);
      return { from, to, days: enumerateDates(from, 7) };
    }
    const from = startOfMonth(anchorDate);
    const to = endOfMonth(anchorDate);
    const dayCount = Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
    return { from, to, days: enumerateDates(from, dayCount) };
  }, [viewMode, anchorDate]);

  const fromISO = toISO(range.from);
  const toISOStr = toISO(range.to);

  const employeesQuery = useQuery<Employee[]>({
    queryKey: ["employees", activeStoreId],
    queryFn: ({ signal }) => listEmployees({ store_id: activeStoreId }, signal),
    enabled: activeStoreId != null,
    staleTime: 60_000,
  });

  const shiftsQuery = useQuery<Shift[]>({
    queryKey: ["shifts", "range", activeStoreId, fromISO, toISOStr],
    queryFn: ({ signal }) =>
      listShifts({ store_id: activeStoreId, from: fromISO, to: toISOStr }, signal),
    enabled: activeStoreId != null,
  });

  const conflictsQuery = useQuery<ShiftConflictReport>({
    queryKey: ["shift-conflicts", activeStoreId, fromISO, toISOStr],
    queryFn: ({ signal }) => {
      if (activeStoreId == null) {
        return Promise.resolve({ duplicates: [], understaffed: [] });
      }
      return getShiftConflicts({ store_id: activeStoreId, from: fromISO, to: toISOStr }, signal);
    },
    enabled: activeStoreId != null,
  });

  const requestsQuery = useQuery<ShiftRequest[]>({
    queryKey: ["shift-requests", fromISO, toISOStr],
    queryFn: ({ signal }) => listShiftRequests({ from: fromISO, to: toISOStr }, signal),
  });

  // ---------- shift index ----------

  const shiftsByEmpDate = useMemo(() => {
    const map = new Map<string, Shift[]>();
    for (const s of shiftsQuery.data ?? []) {
      const key = `${s.employee_id}#${s.date}`;
      const arr = map.get(key) ?? [];
      arr.push(s);
      map.set(key, arr);
    }
    return map;
  }, [shiftsQuery.data]);

  const understaffDates = useMemo(() => {
    const set = new Set<string>();
    for (const u of conflictsQuery.data?.understaffed ?? []) set.add(u.date);
    return set;
  }, [conflictsQuery.data]);

  // ---------- modal state ----------

  const [editor, setEditor] = useState<EditorState | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [modalStart, setModalStart] = useState("09:00");
  const [modalEnd, setModalEnd] = useState("17:00");
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);

  function openCreate(date: string, employeeId: number) {
    setEditor({ kind: "create", date, employeeId });
    setModalStart("09:00");
    setModalEnd("17:00");
    setModalError(null);
  }

  function openEdit(shift: Shift) {
    setEditor({ kind: "edit", shift });
    setModalStart(shift.start_time.slice(0, 5));
    setModalEnd(shift.end_time.slice(0, 5));
    setModalError(null);
  }

  function closeModal() {
    setEditor(null);
    setModalError(null);
  }

  // ---------- mutations ----------

  function invalidateShifts() {
    queryClient.invalidateQueries({ queryKey: ["shifts", "range"] });
    queryClient.invalidateQueries({ queryKey: ["shift-conflicts"] });
  }

  const createMut = useMutation({
    mutationFn: (body: {
      employee_id: number;
      store_id: number;
      date: string;
      start_time: string;
      end_time: string;
    }) => createShift(body),
    onSuccess: () => {
      invalidateShifts();
      closeModal();
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409) {
        setModalError("同じ従業員の時間帯が重複しています。");
      } else {
        setModalError("シフトの保存に失敗しました。もう一度お試しください。");
      }
    },
  });

  const updateMut = useMutation({
    mutationFn: (args: { id: number; start_time: string; end_time: string }) =>
      updateShift(args.id, {
        start_time: args.start_time,
        end_time: args.end_time,
      }),
    onSuccess: () => {
      invalidateShifts();
      closeModal();
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409) {
        setModalError("同じ従業員の時間帯が重複しています。");
      } else {
        setModalError("シフトの更新に失敗しました。");
      }
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteShift(id),
    onSuccess: () => {
      invalidateShifts();
      closeModal();
    },
    onError: () => {
      setModalError("シフトの削除に失敗しました。公開済みのシフトは削除できません。");
    },
  });

  const publishMut = useMutation({
    mutationFn: (args: { store_id: number; from: string; to: string }) => publishShifts(args),
    onSuccess: () => {
      invalidateShifts();
    },
  });

  function handleSubmitModal() {
    setModalError(null);
    if (modalStart >= modalEnd) {
      setModalError("終了時刻は開始時刻より後にしてください。");
      return;
    }
    if (editor?.kind === "create") {
      if (activeStoreId == null) return;
      createMut.mutate({
        employee_id: editor.employeeId,
        store_id: activeStoreId,
        date: editor.date,
        start_time: modalStart,
        end_time: modalEnd,
      });
    } else if (editor?.kind === "edit") {
      updateMut.mutate({
        id: editor.shift.id,
        start_time: modalStart,
        end_time: modalEnd,
      });
    }
  }

  function handleDelete() {
    if (editor?.kind !== "edit") return;
    if (editor.shift.status === "published") {
      setModalError("公開済みのシフトは削除できません。");
      return;
    }
    setConfirmState({ kind: "delete", shift: editor.shift });
  }

  function handlePublish() {
    if (activeStoreId == null) return;
    const draftCount = (shiftsQuery.data ?? []).filter((s) => s.status === "draft").length;
    if (draftCount === 0) {
      window.alert("公開できる下書きがありません。");
      return;
    }
    setConfirmState({
      kind: "publish",
      draftCount,
      storeId: activeStoreId,
      from: fromISO,
      to: toISOStr,
    });
  }

  function handleConfirmAction() {
    if (!confirmState) return;
    if (confirmState.kind === "delete") {
      const shiftId = confirmState.shift.id;
      setConfirmState(null);
      deleteMut.mutate(shiftId);
      return;
    }
    const { storeId, from, to } = confirmState;
    setConfirmState(null);
    publishMut.mutate({
      store_id: storeId,
      from,
      to,
    });
  }

  // ---------- nav ----------

  function goPrev() {
    setAnchorDate(
      viewMode === "week"
        ? addDays(anchorDate, -7)
        : new Date(anchorDate.getFullYear(), anchorDate.getMonth() - 1, 1),
    );
  }
  function goNext() {
    setAnchorDate(
      viewMode === "week"
        ? addDays(anchorDate, 7)
        : new Date(anchorDate.getFullYear(), anchorDate.getMonth() + 1, 1),
    );
  }
  function goToday() {
    setAnchorDate(viewMode === "week" ? startOfWeekMon(new Date()) : startOfMonth(new Date()));
  }

  // ---------- render ----------

  const weekLabel = useMemo(() => {
    if (viewMode === "week") {
      return `${range.from.getFullYear()}年 ${range.from.getMonth() + 1}月${range.from.getDate()}日 〜 ${range.to.getMonth() + 1}月${range.to.getDate()}日`;
    }
    return `${range.from.getFullYear()}年 ${range.from.getMonth() + 1}月`;
  }, [range, viewMode]);

  const employees = employeesQuery.data ?? [];
  const draftCount = (shiftsQuery.data ?? []).filter((s) => s.status === "draft").length;

  // grid columns: 1 fixed (employee) + days
  const gridTemplate = `minmax(140px, 180px) repeat(${range.days.length}, minmax(110px, 1fr))`;

  return (
    <div className="wa-shifts">
      <header className="wa-shifts__header">
        <div>
          <Heading level={1} eyebrow="A02 / SHIFTS">
            シフト編成
          </Heading>
          <p className="wa-shifts__date">雀庵のシフトをこの画面から編成・公開します</p>
        </div>
        <div>
          {storesQuery.isLoading ? (
            <span className="wa-shifts__status">店舗情報を読み込み中…</span>
          ) : (
            <StoreSwitcher
              stores={stores}
              value={storeFilter}
              onChange={setStoreFilter}
              includeAll={false}
            />
          )}
        </div>
      </header>

      <div className="wa-shifts__toolbar">
        <nav className="wa-shifts__week-nav" aria-label="期間ナビゲーション">
          <button type="button" onClick={goPrev} aria-label="前へ">
            ‹ {viewMode === "week" ? "前週" : "前月"}
          </button>
          <button type="button" onClick={goToday} aria-label="今日へ">
            今日
          </button>
          <button type="button" onClick={goNext} aria-label="次へ">
            {viewMode === "week" ? "翌週" : "翌月"} ›
          </button>
          <span className="wa-shifts__week-label">{weekLabel}</span>
        </nav>

        <div className="wa-shifts__view-toggle" role="tablist" aria-label="表示切替">
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === "week"}
            className={viewMode === "week" ? "is-active" : ""}
            onClick={() => setViewMode("week")}
          >
            週ビュー
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === "month"}
            className={viewMode === "month" ? "is-active" : ""}
            onClick={() => setViewMode("month")}
          >
            月ビュー
          </button>
        </div>

        <div className="wa-shifts__actions">
          <span
            className={`wa-shifts__status${publishMut.isError ? " wa-shifts__status--error" : ""}`}
          >
            下書き <strong>{draftCount}</strong> 件
            {publishMut.isSuccess ? ` / 直近 ${publishMut.data.published} 件公開しました` : ""}
            {publishMut.isError ? " / 公開に失敗しました" : ""}
          </span>
          <SumiButton
            variant="primary"
            onClick={handlePublish}
            disabled={activeStoreId == null || publishMut.isPending || draftCount === 0}
          >
            この{viewMode === "week" ? "週" : "月"}を公開する
          </SumiButton>
        </div>
      </div>

      <div className="wa-shifts__legend" aria-hidden="true">
        <span className="wa-shifts__legend-item">
          <span className="wa-shifts__legend-swatch wa-shifts__legend-swatch--draft" />
          下書き（点線）
        </span>
        <span className="wa-shifts__legend-item">
          <span className="wa-shifts__legend-swatch wa-shifts__legend-swatch--published" />
          公開済み（朱線）
        </span>
        <span className="wa-shifts__legend-item">
          <span className="wa-shifts__legend-swatch wa-shifts__legend-swatch--understaff" />
          人員不足の日
        </span>
      </div>

      {activeStoreId == null ? (
        <div className="wa-shifts__loading">店舗を選択してください。</div>
      ) : shiftsQuery.isLoading || employeesQuery.isLoading ? (
        <div className="wa-shifts__loading">読み込み中…</div>
      ) : shiftsQuery.isError ? (
        <div className="wa-shifts__loading wa-shifts__status--error">
          シフトの取得に失敗しました。
        </div>
      ) : (
        <div className="wa-shifts__grid-wrap">
          <div
            className={`wa-shifts__grid${viewMode === "month" ? " wa-shifts__grid--month" : ""}`}
            style={{ gridTemplateColumns: gridTemplate }}
          >
            <div className="wa-shifts__grid-head wa-shifts__grid-head--corner">従業員</div>
            {range.days.map((d) => {
              const iso = toISO(d);
              const dow = (d.getDay() + 6) % 7;
              const understaff = understaffDates.has(iso);
              return (
                <div
                  key={iso}
                  className={`wa-shifts__grid-head ${
                    dow === 5 ? "wa-shifts__grid-head--sat" : ""
                  } ${dow === 6 ? "wa-shifts__grid-head--sun" : ""} ${
                    understaff ? "wa-shifts__grid-head--understaff" : ""
                  }`}
                  title={`${d.getMonth() + 1}月${d.getDate()}日 ${WEEKDAY_JP[dow]}${understaff ? " 人員不足" : ""}`}
                >
                  <span className="day-num tnum">{d.getDate()}</span>
                  <span className="day-label">
                    {WEEKDAY_JP[dow]}
                    {understaff ? <span className="warn-icon">⚠</span> : null}
                  </span>
                </div>
              );
            })}

            {employees.length === 0 ? (
              <div className="wa-shifts__loading" style={{ gridColumn: `1 / -1` }}>
                この店舗の従業員が登録されていません。
              </div>
            ) : (
              employees.map((emp) => (
                <EmployeeRow
                  key={emp.id}
                  employee={emp}
                  days={range.days}
                  shiftsByKey={shiftsByEmpDate}
                  understaffDates={understaffDates}
                  onCreate={openCreate}
                  onEdit={openEdit}
                />
              ))
            )}
          </div>
        </div>
      )}

      <details className="wa-shifts__requests">
        <summary className="wa-shifts__requests-summary">
          シフト希望（{requestsQuery.data?.length ?? 0} 件）
        </summary>
        {requestsQuery.isLoading ? (
          <p className="wa-shifts__requests-empty">読み込み中…</p>
        ) : requestsQuery.data && requestsQuery.data.length > 0 ? (
          <ul className="wa-shifts__requests-list">
            {requestsQuery.data.map((r) => {
              const emp = employees.find((e) => e.id === r.employee_id);
              const time =
                r.start_time && r.end_time
                  ? `${r.start_time}–${r.end_time}`
                  : r.preference === "unavailable"
                    ? "終日不可"
                    : "終日可";
              return (
                <li key={r.id} className="wa-shifts__requests-item">
                  <strong>{emp?.name ?? `従業員 #${r.employee_id}`}</strong>
                  <span className="req-meta">
                    {r.date} ／ {time} ／ {labelPreference(r.preference)}
                  </span>
                  {r.note ? <span className="req-meta">{r.note}</span> : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="wa-shifts__requests-empty">この期間に提出された希望はありません。</p>
        )}
      </details>

      {editor ? (
        <ShiftEditorModal
          editor={editor}
          employees={employees}
          start={modalStart}
          end={modalEnd}
          error={modalError}
          isPending={createMut.isPending || updateMut.isPending || deleteMut.isPending}
          onChangeStart={setModalStart}
          onChangeEnd={setModalEnd}
          onSubmit={handleSubmitModal}
          onDelete={handleDelete}
          onClose={closeModal}
        />
      ) : null}

      {confirmState ? (
        <ShiftConfirmModal
          state={confirmState}
          isPending={deleteMut.isPending || publishMut.isPending}
          onCancel={() => setConfirmState(null)}
          onConfirm={handleConfirmAction}
        />
      ) : null}
    </div>
  );
}

// ---------- subcomponents ----------

function EmployeeRow({
  employee,
  days,
  shiftsByKey,
  understaffDates,
  onCreate,
  onEdit,
}: {
  employee: Employee;
  days: Date[];
  shiftsByKey: Map<string, Shift[]>;
  understaffDates: Set<string>;
  onCreate: (date: string, employeeId: number) => void;
  onEdit: (shift: Shift) => void;
}) {
  return (
    <>
      <div className="wa-shifts__grid-emp">
        <span>{employee.name}</span>
        {employee.kana ? <span className="emp-kana">{employee.kana}</span> : null}
      </div>
      {days.map((d) => {
        const iso = toISO(d);
        const key = `${employee.id}#${iso}`;
        const cellShifts = shiftsByKey.get(key) ?? [];
        const understaff = understaffDates.has(iso);
        return (
          <div
            key={iso}
            className={`wa-shifts__grid-cell${
              understaff ? " wa-shifts__grid-cell--understaff" : ""
            }`}
          >
            {cellShifts.length === 0 ? (
              <button
                type="button"
                className="wa-shifts__grid-cell-empty"
                onClick={() => onCreate(iso, employee.id)}
                aria-label={`${employee.name} ${iso} にシフトを追加`}
              >
                <span className="wa-shifts__grid-cell-add" aria-hidden="true">
                  ＋
                </span>
              </button>
            ) : (
              cellShifts.map((s) => <ShiftChip key={s.id} shift={s} onClick={() => onEdit(s)} />)
            )}
          </div>
        );
      })}
    </>
  );
}

function ShiftChip({ shift, onClick }: { shift: Shift; onClick: () => void }) {
  const cls =
    shift.status === "published"
      ? "wa-shifts__chip wa-shifts__chip--published"
      : "wa-shifts__chip wa-shifts__chip--draft";
  return (
    <button
      type="button"
      className={cls}
      onClick={onClick}
      aria-label={`${shift.status === "published" ? "公開済み" : "下書き"} ${shift.start_time}-${shift.end_time}`}
    >
      <span className="wa-shifts__chip-time">
        {shift.start_time.slice(0, 5)}–{shift.end_time.slice(0, 5)}
      </span>
      <span className="wa-shifts__chip-status">
        {shift.status === "published" ? "公開済み" : "下書き"}
      </span>
    </button>
  );
}

function ShiftEditorModal({
  editor,
  employees,
  start,
  end,
  error,
  isPending,
  onChangeStart,
  onChangeEnd,
  onSubmit,
  onDelete,
  onClose,
}: {
  editor: EditorState;
  employees: Employee[];
  start: string;
  end: string;
  error: string | null;
  isPending: boolean;
  onChangeStart: (v: string) => void;
  onChangeEnd: (v: string) => void;
  onSubmit: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const empId = editor.kind === "create" ? editor.employeeId : editor.shift.employee_id;
  const date = editor.kind === "create" ? editor.date : editor.shift.date;
  const emp = employees.find((e) => e.id === empId);
  const title = editor.kind === "create" ? "シフトを追加" : "シフトを編集";
  const isPublished = editor.kind === "edit" && editor.shift.status === "published";

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="wa-shifts__modal-backdrop">
      <button
        type="button"
        className="wa-shifts__modal-backdrop-btn"
        aria-label="閉じる"
        onClick={onClose}
      />
      <div className="wa-shifts__modal" role="dialog" aria-modal="true" aria-label={title}>
        <h3>{title}</h3>
        <p className="wa-shifts__modal-meta">
          {emp?.name ?? `従業員 #${empId}`} ／ {date}
          {isPublished ? "（公開済み）" : ""}
        </p>

        <div className="wa-shifts__modal-row">
          <label htmlFor="shift-start">開始</label>
          <input
            id="shift-start"
            data-testid="shift-start-time"
            type="time"
            value={start}
            onChange={(e) => onChangeStart(e.target.value)}
          />
        </div>
        <div className="wa-shifts__modal-row">
          <label htmlFor="shift-end">終了</label>
          <input
            id="shift-end"
            data-testid="shift-end-time"
            type="time"
            value={end}
            onChange={(e) => onChangeEnd(e.target.value)}
          />
        </div>

        {error ? <p className="wa-shifts__modal-error">{error}</p> : null}

        <div className="wa-shifts__modal-actions">
          {editor.kind === "edit" && !isPublished ? (
            <SumiButton variant="danger" onClick={onDelete} disabled={isPending}>
              削除
            </SumiButton>
          ) : null}
          <SumiButton variant="ghost" onClick={onClose} disabled={isPending}>
            キャンセル
          </SumiButton>
          <SumiButton variant="primary" onClick={onSubmit} disabled={isPending}>
            {editor.kind === "create" ? "追加する" : "更新する"}
          </SumiButton>
        </div>
      </div>
    </div>
  );
}

function ShiftConfirmModal({
  state,
  isPending,
  onCancel,
  onConfirm,
}: {
  state: ConfirmState;
  isPending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const isDelete = state.kind === "delete";
  const title = isDelete ? "シフトを削除しますか" : "下書きを公開しますか";
  const confirmLabel = isDelete ? "削除を確定" : "公開を確定";
  const confirmAriaLabel = isDelete ? "シフト削除を確定" : "シフト公開を確定";
  const cancelAriaLabel = isDelete ? "シフト削除をキャンセル" : "シフト公開をキャンセル";
  const description = isDelete
    ? `${state.shift.date} ${state.shift.start_time.slice(0, 5)}–${state.shift.end_time.slice(0, 5)} の下書きシフトを削除します。`
    : `${state.draftCount} 件の下書きシフトを公開します。公開後は従業員側にも表示されます。`;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
      }
    }
    window.addEventListener("keydown", onKey, true);
    panelRef.current
      ?.querySelector<HTMLElement>("[data-autofocus='true'], button, [tabindex]")
      ?.focus();
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onCancel]);

  return (
    <div className="wa-shifts__modal-backdrop">
      <button
        type="button"
        className="wa-shifts__modal-backdrop-btn"
        aria-label="確認を閉じる"
        onClick={onCancel}
      />
      <div
        ref={panelRef}
        className="wa-shifts__modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="shift-confirm-title"
        aria-describedby="shift-confirm-description"
        tabIndex={-1}
      >
        <h3 id="shift-confirm-title">{title}</h3>
        <p id="shift-confirm-description" className="wa-shifts__modal-meta">
          {description}
        </p>
        <div className="wa-shifts__modal-actions">
          <SumiButton
            variant="ghost"
            onClick={onCancel}
            disabled={isPending}
            aria-label={cancelAriaLabel}
          >
            キャンセル
          </SumiButton>
          <SumiButton
            variant={isDelete ? "danger" : "primary"}
            onClick={onConfirm}
            disabled={isPending}
            aria-label={confirmAriaLabel}
            data-autofocus="true"
          >
            {confirmLabel}
          </SumiButton>
        </div>
      </div>
    </div>
  );
}

function labelPreference(p: ShiftRequest["preference"]): string {
  switch (p) {
    case "available":
      return "可";
    case "preferred":
      return "希望";
    case "unavailable":
      return "不可";
  }
}
