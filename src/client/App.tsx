import { Route, Routes } from "react-router-dom";
import { AdminLayout } from "./components/AdminLayout";
import { AuthGuard } from "./components/AuthGuard";
import { EmployeeLayout, PunchLayout } from "./components/Layout";
import {
  AdminAuditPage,
  AdminCorrectionsPage,
  AdminDashboardPage,
  AdminEmployeesPage,
  AdminExportsPage,
  AdminHelpPage,
  AdminLoginPage,
  AdminShiftsPage,
  AdminStoresPage,
  NotFoundPage,
} from "./routes/admin";
import { DevComponentsPage } from "./routes/dev-components";
import {
  EmployeeCorrectionsPage,
  EmployeeDashboardPage,
  EmployeeHistoryPage,
  EmployeeShiftRequestsPage,
  EmployeeShiftsPage,
} from "./routes/employee";
import { KioskBoardPage, KioskDonePage, KioskTopPage } from "./routes/kiosk";

export function App() {
  return (
    <Routes>
      {/* 公開 / 打刻系 (K01) */}
      <Route element={<PunchLayout />}>
        <Route path="/" element={<KioskTopPage />} />
      </Route>

      {/* staff session 必須 打刻系 (K03, K04) */}
      <Route
        element={
          <AuthGuard allow={["staff", "manager", "admin"]} fallback="/">
            <PunchLayout />
          </AuthGuard>
        }
      >
        <Route path="/punch/board" element={<KioskBoardPage />} />
        <Route path="/punch/done" element={<KioskDonePage />} />
      </Route>

      {/* 従業員マイページ (E01-E05) */}
      <Route
        element={
          <AuthGuard allow={["staff", "manager", "admin"]} fallback="/">
            <EmployeeLayout />
          </AuthGuard>
        }
      >
        <Route path="/me" element={<EmployeeDashboardPage />} />
        <Route path="/me/history" element={<EmployeeHistoryPage />} />
        <Route path="/me/corrections" element={<EmployeeCorrectionsPage />} />
        <Route path="/me/shifts" element={<EmployeeShiftsPage />} />
        <Route path="/me/shift-requests" element={<EmployeeShiftRequestsPage />} />
      </Route>

      {/* 管理者ログイン (A00, 公開) */}
      <Route path="/admin/login" element={<AdminLoginPage />} />

      {/* 管理者画面 manager+ (A01-A03) */}
      <Route
        element={
          <AuthGuard allow={["manager", "admin"]} fallback="/admin/login">
            <AdminLayout />
          </AuthGuard>
        }
      >
        <Route path="/admin" element={<AdminDashboardPage />} />
        <Route path="/admin/help" element={<AdminHelpPage />} />
        <Route path="/admin/help/:topic" element={<AdminHelpPage />} />
        <Route path="/admin/shifts" element={<AdminShiftsPage />} />
        <Route path="/admin/corrections" element={<AdminCorrectionsPage />} />
      </Route>

      {/* admin 限定 (A04-A07) */}
      <Route
        element={
          <AuthGuard allow={["admin"]} fallback="/admin/login">
            <AdminLayout />
          </AuthGuard>
        }
      >
        <Route path="/admin/employees" element={<AdminEmployeesPage />} />
        <Route path="/admin/stores" element={<AdminStoresPage />} />
        <Route path="/admin/exports" element={<AdminExportsPage />} />
        <Route path="/admin/audit" element={<AdminAuditPage />} />
      </Route>

      {/* dev 限定プレビュー (共通コンポーネント確認用) */}
      {import.meta.env.DEV ? (
        <Route path="/dev/components" element={<DevComponentsPage />} />
      ) : null}

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
