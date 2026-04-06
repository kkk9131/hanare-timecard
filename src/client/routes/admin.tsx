import { Placeholder } from "./placeholder";

export { AdminAuditPage } from "./AdminAudit";
export { AdminCorrectionsPage } from "./AdminCorrections";
export { AdminDashboardPage } from "./AdminDashboard";
export { AdminEmployeesPage } from "./AdminEmployees";
export { AdminExportsPage } from "./AdminExports";
export { AdminLoginPage } from "./AdminLogin";
export { AdminShiftsPage } from "./AdminShifts";
export { AdminStoresPage } from "./AdminStores";

export function NotFoundPage() {
  return <Placeholder screenId="404" title="ページが見つかりません" />;
}
