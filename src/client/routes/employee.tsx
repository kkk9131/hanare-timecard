import { MeCorrections } from "./MeCorrections";
import { MeDashboard } from "./MeDashboard";
import { MeHistory } from "./MeHistory";
import { MeShiftRequests } from "./MeShiftRequests";
import { MeShifts } from "./MeShifts";

export function EmployeeDashboardPage() {
  return <MeDashboard />;
}

export function EmployeeHistoryPage() {
  return <MeHistory />;
}

export function EmployeeCorrectionsPage() {
  return <MeCorrections />;
}

export function EmployeeShiftsPage() {
  return <MeShifts />;
}

export function EmployeeShiftRequestsPage() {
  return <MeShiftRequests />;
}
