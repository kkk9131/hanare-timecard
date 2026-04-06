import { create } from "zustand";
import type { EmployeeProfile, PublicEmployee } from "../api/auth";
import type { PunchType } from "../api/punches";

export type StoreFilter = "all" | number;

export type LastPunchSummary = {
  employee_name: string;
  punch_type: PunchType;
  punched_at: number;
  message: string;
};

type KioskState = {
  /** K01 の店舗フィルタタブ */
  storeFilter: StoreFilter;
  setStoreFilter: (filter: StoreFilter) => void;

  /** K02 で選択中の従業員 (PIN 入力対象) */
  selectedEmployee: PublicEmployee | null;
  selectEmployee: (e: PublicEmployee | null) => void;

  /** K03 のセッション。pin-login 成功後にセットされる */
  session: EmployeeProfile | null;
  /** ログイン時に push される打刻操作対象店舗 */
  activeStoreId: number | null;
  setSession: (s: EmployeeProfile | null, activeStoreId: number | null) => void;

  /** K04 表示用の直前打刻情報 */
  lastPunch: LastPunchSummary | null;
  setLastPunch: (p: LastPunchSummary | null) => void;

  /** すべて初期状態に戻す (K04 → K01) */
  resetAll: () => void;
};

export const useKioskStore = create<KioskState>((set) => ({
  storeFilter: "all",
  setStoreFilter: (storeFilter) => set({ storeFilter }),

  selectedEmployee: null,
  selectEmployee: (selectedEmployee) => set({ selectedEmployee }),

  session: null,
  activeStoreId: null,
  setSession: (session, activeStoreId) => set({ session, activeStoreId }),

  lastPunch: null,
  setLastPunch: (lastPunch) => set({ lastPunch }),

  resetAll: () =>
    set({
      selectedEmployee: null,
      session: null,
      activeStoreId: null,
      lastPunch: null,
    }),
}));
