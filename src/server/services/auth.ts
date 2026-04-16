import bcrypt from "bcrypt";
import { and, asc, eq, isNull, or } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { safeEqualText } from "../lib/crypto.js";

/** Number of failed authentication attempts before locking the account. */
export const MAX_AUTH_FAIL_COUNT = 5;

/** Lock duration once the failed-attempt threshold is reached. */
export const AUTH_LOCK_DURATION_MS = 5 * 60 * 1000;

export type Role = "staff" | "manager" | "admin";

export interface KioskLoginSuccess {
  kind: "ok";
  employee: {
    id: number;
    name: string;
    kana: string;
    role: Role;
    store_ids: number[];
  };
}

export interface KioskLoginNotFound {
  kind: "not_found";
}

export type KioskLoginResult = KioskLoginSuccess | KioskLoginNotFound;

/**
 * Create a kiosk session from employee selection alone.
 * Used for shared-device punch flow with no credential entry.
 */
export function startKioskSession(employeeId: number): KioskLoginResult {
  const employee = getEmployeeProfile(employeeId);
  if (!employee) {
    return { kind: "not_found" };
  }
  return {
    kind: "ok",
    employee,
  };
}

export interface AdminLoginSuccess {
  kind: "ok";
  employee: {
    id: number;
    name: string;
    kana: string;
    role: Role;
    store_ids: number[];
  };
}

export interface AdminLoginInvalid {
  kind: "invalid";
}

export interface AdminLoginLocked {
  kind: "locked";
  lock_until: number;
}

export type AdminLoginResult = AdminLoginSuccess | AdminLoginInvalid | AdminLoginLocked;

const DEFAULT_ADMIN_GATE_PIN = "9999";

/**
 * Validate an admin/manager login_id + password combination.
 * Reuses the employees table fail-count + lockout columns.
 */
export function verifyAdminLogin(
  loginId: string,
  password: string,
  now: number = Date.now(),
): AdminLoginResult {
  const emp = db.select().from(schema.employees).where(eq(schema.employees.loginId, loginId)).get();

  if (!emp?.passwordHash) return { kind: "invalid" };
  if (emp.retireDate != null) return { kind: "invalid" };
  if (emp.role !== "admin" && emp.role !== "manager") return { kind: "invalid" };

  if (emp.lockUntil != null && emp.lockUntil > now) {
    return { kind: "locked", lock_until: emp.lockUntil };
  }

  const ok = bcrypt.compareSync(password, emp.passwordHash);
  if (!ok) {
    const newCount = emp.pinFailCount + 1;
    if (newCount >= MAX_AUTH_FAIL_COUNT) {
      const lockUntil = now + AUTH_LOCK_DURATION_MS;
      db.update(schema.employees)
        .set({ pinFailCount: 0, lockUntil, updatedAt: now })
        .where(eq(schema.employees.id, emp.id))
        .run();
      return { kind: "locked", lock_until: lockUntil };
    }
    db.update(schema.employees)
      .set({ pinFailCount: newCount, updatedAt: now })
      .where(eq(schema.employees.id, emp.id))
      .run();
    return { kind: "invalid" };
  }

  if (emp.pinFailCount !== 0 || emp.lockUntil != null) {
    db.update(schema.employees)
      .set({ pinFailCount: 0, lockUntil: null, updatedAt: now })
      .where(eq(schema.employees.id, emp.id))
      .run();
  }

  const storeRows = db
    .select({ storeId: schema.employeeStores.storeId })
    .from(schema.employeeStores)
    .where(eq(schema.employeeStores.employeeId, emp.id))
    .all();

  return {
    kind: "ok",
    employee: {
      id: emp.id,
      name: emp.name,
      kana: emp.kana,
      role: emp.role as Role,
      store_ids: storeRows.map((r) => r.storeId),
    },
  };
}

/**
 * Shared entrance PIN for opening the admin login screen from the kiosk top page.
 * This is separate from each manager/admin account password.
 */
export function verifyAdminGatePin(pin: string): boolean {
  const expected = process.env.HANARE_ADMIN_GATE_PIN ?? DEFAULT_ADMIN_GATE_PIN;
  return safeEqualText(pin, expected);
}

export interface PublicEmployee {
  id: number;
  name: string;
  kana: string;
  store_ids: number[];
}

/**
 * Public employee directory used by the kiosk login screen.
 * Excludes retired employees. Optionally filtered to a single store.
 */
export function listPublicEmployees(filterStoreId?: number): PublicEmployee[] {
  const rows = db
    .select()
    .from(schema.employees)
    .where(isNull(schema.employees.retireDate))
    .orderBy(asc(schema.employees.kana))
    .all();

  // Hydrate store memberships in one pass.
  const allLinks = db.select().from(schema.employeeStores).all();
  const byEmp = new Map<number, number[]>();
  for (const link of allLinks) {
    const arr = byEmp.get(link.employeeId) ?? [];
    arr.push(link.storeId);
    byEmp.set(link.employeeId, arr);
  }

  const out: PublicEmployee[] = [];
  for (const r of rows) {
    const storeIds = byEmp.get(r.id) ?? [];
    if (filterStoreId != null && !storeIds.includes(filterStoreId)) continue;
    out.push({ id: r.id, name: r.name, kana: r.kana, store_ids: storeIds });
  }
  return out;
}

/** Look up an authenticated user's profile for /api/auth/me. */
export function getEmployeeProfile(employeeId: number): {
  id: number;
  name: string;
  kana: string;
  role: Role;
  store_ids: number[];
} | null {
  const emp = db.select().from(schema.employees).where(eq(schema.employees.id, employeeId)).get();
  if (!emp) return null;
  if (emp.retireDate != null) return null;
  const storeRows = db
    .select({ storeId: schema.employeeStores.storeId })
    .from(schema.employeeStores)
    .where(eq(schema.employeeStores.employeeId, employeeId))
    .all();
  return {
    id: emp.id,
    name: emp.name,
    kana: emp.kana,
    role: emp.role as Role,
    store_ids: storeRows.map((r) => r.storeId),
  };
}

// silence unused import lint if drizzle helpers are tree-shaken in some envs
void and;
void or;
