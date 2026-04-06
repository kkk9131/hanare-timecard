import bcrypt from "bcrypt";
import { and, asc, eq, isNull, like, or } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { writeAuditLog } from "./audit.js";

const BCRYPT_ROUNDS = 10;

export type Role = "staff" | "manager" | "admin";

export interface EmployeeStoreLink {
  store_id: number;
  is_primary: boolean;
}

export interface EmployeeDTO {
  id: number;
  name: string;
  kana: string;
  role: Role;
  login_id: string | null;
  hourly_wage: number;
  hire_date: string;
  retire_date: string | null;
  note: string | null;
  store_ids: number[];
  primary_store_id: number | null;
  created_at: number;
  updated_at: number;
}

function rowToDTO(
  row: typeof schema.employees.$inferSelect,
  links: { storeId: number; isPrimary: number }[],
): EmployeeDTO {
  const store_ids = links.map((l) => l.storeId);
  const primary = links.find((l) => l.isPrimary === 1);
  return {
    id: row.id,
    name: row.name,
    kana: row.kana,
    role: row.role as Role,
    login_id: row.loginId,
    hourly_wage: row.hourlyWage,
    hire_date: row.hireDate,
    retire_date: row.retireDate,
    note: row.note,
    store_ids,
    primary_store_id: primary ? primary.storeId : null,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}

function loadLinks(employeeId: number) {
  return db
    .select({
      storeId: schema.employeeStores.storeId,
      isPrimary: schema.employeeStores.isPrimary,
    })
    .from(schema.employeeStores)
    .where(eq(schema.employeeStores.employeeId, employeeId))
    .all();
}

export interface ListEmployeesQuery {
  store_id?: number;
  include_retired?: boolean;
  search?: string;
}

export function listEmployees(query: ListEmployeesQuery = {}): EmployeeDTO[] {
  const conditions = [] as ReturnType<typeof eq>[];
  if (!query.include_retired) {
    conditions.push(isNull(schema.employees.retireDate) as unknown as ReturnType<typeof eq>);
  }
  if (query.search && query.search.trim().length > 0) {
    const term = `%${query.search.trim()}%`;
    conditions.push(
      or(
        like(schema.employees.name, term),
        like(schema.employees.kana, term),
      ) as unknown as ReturnType<typeof eq>,
    );
  }

  const where =
    conditions.length === 0
      ? undefined
      : conditions.length === 1
        ? conditions[0]
        : and(...conditions);

  const rows = where
    ? db.select().from(schema.employees).where(where).orderBy(asc(schema.employees.kana)).all()
    : db.select().from(schema.employees).orderBy(asc(schema.employees.kana)).all();

  // Pre-load all links in one pass.
  const allLinks = db.select().from(schema.employeeStores).all();
  const byEmp = new Map<number, { storeId: number; isPrimary: number }[]>();
  for (const link of allLinks) {
    const arr = byEmp.get(link.employeeId) ?? [];
    arr.push({ storeId: link.storeId, isPrimary: link.isPrimary });
    byEmp.set(link.employeeId, arr);
  }

  const out: EmployeeDTO[] = [];
  for (const r of rows) {
    const links = byEmp.get(r.id) ?? [];
    if (query.store_id != null && !links.some((l) => l.storeId === query.store_id)) {
      continue;
    }
    out.push(rowToDTO(r, links));
  }
  return out;
}

export function getEmployee(id: number): EmployeeDTO | null {
  const row = db.select().from(schema.employees).where(eq(schema.employees.id, id)).get();
  if (!row) return null;
  return rowToDTO(row, loadLinks(id));
}

export interface CreateEmployeeInput {
  name: string;
  kana: string;
  role: Role;
  login_id?: string;
  password?: string;
  pin: string;
  hourly_wage?: number;
  hire_date: string;
  store_ids: number[];
  primary_store_id?: number;
  note?: string;
}

export class EmployeeServiceError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function assertStoresExist(storeIds: number[]): void {
  for (const sid of storeIds) {
    const exists = db.select().from(schema.stores).where(eq(schema.stores.id, sid)).get();
    if (!exists) {
      throw new EmployeeServiceError("invalid_store", `店舗 id=${sid} が存在しません`, 422);
    }
  }
}

export function createEmployee(input: CreateEmployeeInput, actorId: number): EmployeeDTO {
  if (input.role !== "staff" && (!input.login_id || !input.password)) {
    throw new EmployeeServiceError(
      "missing_credentials",
      "manager/admin には login_id と password が必要です",
      422,
    );
  }
  if (input.store_ids.length === 0) {
    throw new EmployeeServiceError("no_store", "store_ids は 1 件以上必要です", 422);
  }
  assertStoresExist(input.store_ids);
  if (input.primary_store_id != null && !input.store_ids.includes(input.primary_store_id)) {
    throw new EmployeeServiceError(
      "invalid_primary",
      "primary_store_id は store_ids に含まれている必要があります",
      422,
    );
  }

  // login_id uniqueness check (besides DB constraint, return clean error).
  if (input.login_id) {
    const dup = db
      .select()
      .from(schema.employees)
      .where(eq(schema.employees.loginId, input.login_id))
      .get();
    if (dup) {
      throw new EmployeeServiceError("login_id_conflict", "login_id は既に使用されています", 409);
    }
  }

  const now = Date.now();
  const pinHash = bcrypt.hashSync(input.pin, BCRYPT_ROUNDS);
  const passwordHash = input.password ? bcrypt.hashSync(input.password, BCRYPT_ROUNDS) : null;

  const inserted = db
    .insert(schema.employees)
    .values({
      name: input.name,
      kana: input.kana,
      role: input.role,
      loginId: input.login_id ?? null,
      passwordHash,
      pinHash,
      hourlyWage: input.hourly_wage ?? 0,
      hireDate: input.hire_date,
      retireDate: null,
      note: input.note ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();

  // employee_stores 兼務リンクを挿入
  const primaryId = input.primary_store_id ?? input.store_ids[0];
  for (const sid of input.store_ids) {
    db.insert(schema.employeeStores)
      .values({
        employeeId: inserted.id,
        storeId: sid,
        isPrimary: sid === primaryId ? 1 : 0,
      })
      .run();
  }

  const dto = rowToDTO(inserted, loadLinks(inserted.id));
  writeAuditLog({
    actorId,
    action: "employee.create",
    entityType: "employee",
    entityId: dto.id,
    before: null,
    after: { ...dto, pin: "***", password: input.password ? "***" : null },
    occurredAt: now,
  });
  return dto;
}

export interface UpdateEmployeeInput {
  name?: string;
  kana?: string;
  role?: Role;
  login_id?: string | null;
  password?: string;
  hourly_wage?: number;
  hire_date?: string;
  retire_date?: string | null;
  store_ids?: number[];
  primary_store_id?: number;
  note?: string | null;
}

export function updateEmployee(
  id: number,
  patch: UpdateEmployeeInput,
  actorId: number,
): EmployeeDTO | null {
  const before = db.select().from(schema.employees).where(eq(schema.employees.id, id)).get();
  if (!before) return null;
  const beforeLinks = loadLinks(id);
  const beforeDTO = rowToDTO(before, beforeLinks);

  if (patch.store_ids) {
    if (patch.store_ids.length === 0) {
      throw new EmployeeServiceError("no_store", "store_ids は 1 件以上必要です", 422);
    }
    assertStoresExist(patch.store_ids);
  }
  if (patch.primary_store_id != null) {
    const targetStores = patch.store_ids ?? beforeLinks.map((l) => l.storeId);
    if (!targetStores.includes(patch.primary_store_id)) {
      throw new EmployeeServiceError(
        "invalid_primary",
        "primary_store_id は store_ids に含まれている必要があります",
        422,
      );
    }
  }
  if (patch.login_id && patch.login_id !== before.loginId) {
    const dup = db
      .select()
      .from(schema.employees)
      .where(eq(schema.employees.loginId, patch.login_id))
      .get();
    if (dup && dup.id !== id) {
      throw new EmployeeServiceError("login_id_conflict", "login_id は既に使用されています", 409);
    }
  }

  const now = Date.now();
  const updates: Partial<typeof schema.employees.$inferInsert> = {
    updatedAt: now,
  };
  if (patch.name !== undefined) updates.name = patch.name;
  if (patch.kana !== undefined) updates.kana = patch.kana;
  if (patch.role !== undefined) updates.role = patch.role;
  if (patch.login_id !== undefined) updates.loginId = patch.login_id;
  if (patch.password !== undefined)
    updates.passwordHash = bcrypt.hashSync(patch.password, BCRYPT_ROUNDS);
  if (patch.hourly_wage !== undefined) updates.hourlyWage = patch.hourly_wage;
  if (patch.hire_date !== undefined) updates.hireDate = patch.hire_date;
  if (patch.retire_date !== undefined) updates.retireDate = patch.retire_date;
  if (patch.note !== undefined) updates.note = patch.note;

  db.update(schema.employees).set(updates).where(eq(schema.employees.id, id)).run();

  // store_ids 差分更新
  if (patch.store_ids) {
    const newSet = new Set(patch.store_ids);
    const oldSet = new Set(beforeLinks.map((l) => l.storeId));
    // delete removed
    for (const oldSid of oldSet) {
      if (!newSet.has(oldSid)) {
        db.delete(schema.employeeStores)
          .where(
            and(
              eq(schema.employeeStores.employeeId, id),
              eq(schema.employeeStores.storeId, oldSid),
            ),
          )
          .run();
      }
    }
    // insert added
    for (const newSid of newSet) {
      if (!oldSet.has(newSid)) {
        db.insert(schema.employeeStores)
          .values({ employeeId: id, storeId: newSid, isPrimary: 0 })
          .run();
      }
    }
  }

  // primary 切り替え
  if (patch.primary_store_id != null) {
    db.update(schema.employeeStores)
      .set({ isPrimary: 0 })
      .where(eq(schema.employeeStores.employeeId, id))
      .run();
    db.update(schema.employeeStores)
      .set({ isPrimary: 1 })
      .where(
        and(
          eq(schema.employeeStores.employeeId, id),
          eq(schema.employeeStores.storeId, patch.primary_store_id),
        ),
      )
      .run();
  }

  const after = db.select().from(schema.employees).where(eq(schema.employees.id, id)).get();
  if (!after) return null;
  const afterDTO = rowToDTO(after, loadLinks(id));

  writeAuditLog({
    actorId,
    action: "employee.update",
    entityType: "employee",
    entityId: id,
    before: beforeDTO,
    after: afterDTO,
    occurredAt: now,
  });
  return afterDTO;
}

export function resetPin(id: number, newPin: string, actorId: number): EmployeeDTO | null {
  const before = db.select().from(schema.employees).where(eq(schema.employees.id, id)).get();
  if (!before) return null;

  const now = Date.now();
  const pinHash = bcrypt.hashSync(newPin, BCRYPT_ROUNDS);
  db.update(schema.employees)
    .set({ pinHash, pinFailCount: 0, lockUntil: null, updatedAt: now })
    .where(eq(schema.employees.id, id))
    .run();

  writeAuditLog({
    actorId,
    action: "employee.reset_pin",
    entityType: "employee",
    entityId: id,
    before: { pin_hash: "***" },
    after: { pin_hash: "***" },
    occurredAt: now,
  });

  return getEmployee(id);
}

export function retireEmployee(
  id: number,
  retireDate: string,
  actorId: number,
): EmployeeDTO | null {
  const before = db.select().from(schema.employees).where(eq(schema.employees.id, id)).get();
  if (!before) return null;
  const beforeDTO = rowToDTO(before, loadLinks(id));

  const now = Date.now();
  db.update(schema.employees)
    .set({ retireDate, updatedAt: now })
    .where(eq(schema.employees.id, id))
    .run();

  const after = getEmployee(id);
  writeAuditLog({
    actorId,
    action: "employee.retire",
    entityType: "employee",
    entityId: id,
    before: beforeDTO,
    after,
    occurredAt: now,
  });
  return after;
}
