import { pathToFileURL } from "node:url";
import bcrypt from "bcrypt";
import { createSqlite, resolveDbPath } from "../src/server/db/client.js";

type Sqlite = ReturnType<typeof createSqlite>;

const BCRYPT_ROUNDS = 10;

const STORE_CLEAR_ORDER = [
  "work_days",
  "audit_logs",
  "sessions",
  "correction_requests",
  "shift_requests",
  "shift_requirement_slots",
  "shift_recruitment_periods",
  "shift_monthly_settings",
  "shifts",
  "time_punches",
  "employee_stores",
  "employees",
  "stores",
];

function now(): number {
  return Date.now();
}

function hash(plain: string): string {
  return bcrypt.hashSync(plain, BCRYPT_ROUNDS);
}

function clearAll(db: Sqlite): void {
  const tx = db.transaction(() => {
    for (const table of STORE_CLEAR_ORDER) {
      db.exec(`DELETE FROM ${table}`);
      db.exec(`DELETE FROM sqlite_sequence WHERE name='${table}'`);
    }
  });
  tx();
}

interface StoreSeed {
  code: string;
  name: string;
  displayName: string;
  openingTime: string;
  closingTime: string;
  closedDays: string | null;
}

interface EmployeeSeed {
  name: string;
  kana: string;
  role: "staff" | "manager" | "admin";
  loginId: string | null;
  password: string | null;
  hourlyWage: number;
  hireDate: string;
  note: string | null;
  stores: Array<{ code: string; isPrimary: boolean }>;
}

const STORES: StoreSeed[] = [
  {
    code: "suzumean",
    name: "雀庵",
    displayName: "雀庵 本店",
    openingTime: "17:00",
    closingTime: "23:30",
    closedDays: "sun",
  },
  {
    code: "hanare",
    name: "雀庵 離れ",
    displayName: "雀庵 離れ",
    openingTime: "17:00",
    closingTime: "23:30",
    closedDays: "mon",
  },
];

const EMPLOYEES: EmployeeSeed[] = [
  {
    name: "店主 雀子",
    kana: "てんしゅ すずこ",
    role: "admin",
    loginId: "oyakata",
    password: "hanare2026",
    hourlyWage: 0,
    hireDate: "2020-01-01",
    note: "オーナー",
    stores: [
      { code: "suzumean", isPrimary: true },
      { code: "hanare", isPrimary: false },
    ],
  },
  {
    name: "本店 店長",
    kana: "ほんてん てんちょう",
    role: "manager",
    loginId: "suzumean_mgr",
    password: "suzumean2026",
    hourlyWage: 1500,
    hireDate: "2021-04-01",
    note: null,
    stores: [{ code: "suzumean", isPrimary: true }],
  },
  {
    name: "離れ 店長",
    kana: "はなれ てんちょう",
    role: "manager",
    loginId: "hanare_mgr",
    password: "hanare2026",
    hourlyWage: 1500,
    hireDate: "2022-03-01",
    note: null,
    stores: [{ code: "hanare", isPrimary: true }],
  },
  {
    name: "山田 太郎",
    kana: "やまだ たろう",
    role: "staff",
    loginId: null,
    password: null,
    hourlyWage: 1200,
    hireDate: "2023-06-01",
    note: null,
    stores: [{ code: "suzumean", isPrimary: true }],
  },
  {
    name: "佐藤 花子",
    kana: "さとう はなこ",
    role: "staff",
    loginId: null,
    password: null,
    hourlyWage: 1200,
    hireDate: "2023-07-01",
    note: null,
    stores: [{ code: "suzumean", isPrimary: true }],
  },
  {
    name: "鈴木 次郎",
    kana: "すずき じろう",
    role: "staff",
    loginId: null,
    password: null,
    hourlyWage: 1200,
    hireDate: "2023-08-01",
    note: null,
    stores: [{ code: "suzumean", isPrimary: true }],
  },
  {
    name: "田中 美咲",
    kana: "たなか みさき",
    role: "staff",
    loginId: null,
    password: null,
    hourlyWage: 1250,
    hireDate: "2023-09-01",
    note: null,
    stores: [{ code: "hanare", isPrimary: true }],
  },
  {
    name: "高橋 健",
    kana: "たかはし けん",
    role: "staff",
    loginId: null,
    password: null,
    hourlyWage: 1250,
    hireDate: "2023-10-01",
    note: null,
    stores: [{ code: "hanare", isPrimary: true }],
  },
  {
    name: "伊藤 彩",
    kana: "いとう あや",
    role: "staff",
    loginId: null,
    password: null,
    hourlyWage: 1250,
    hireDate: "2023-11-01",
    note: null,
    stores: [{ code: "hanare", isPrimary: true }],
  },
  {
    name: "渡辺 翼",
    kana: "わたなべ つばさ",
    role: "staff",
    loginId: null,
    password: null,
    hourlyWage: 1300,
    hireDate: "2024-01-15",
    note: "両店舗兼務",
    stores: [
      { code: "suzumean", isPrimary: true },
      { code: "hanare", isPrimary: false },
    ],
  },
];

interface InsertedStore {
  id: number;
  code: string;
}
interface InsertedEmployee {
  id: number;
  name: string;
  role: string;
  storeIds: number[];
  primaryStoreId: number;
}

function insertStores(db: Sqlite): InsertedStore[] {
  const stmt = db.prepare(
    `INSERT INTO stores (code, name, display_name, opening_time, closing_time, closed_days, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const created: InsertedStore[] = [];
  const ts = now();
  for (const s of STORES) {
    const info = stmt.run(
      s.code,
      s.name,
      s.displayName,
      s.openingTime,
      s.closingTime,
      s.closedDays,
      ts,
    );
    created.push({ id: Number(info.lastInsertRowid), code: s.code });
  }
  return created;
}

function insertEmployees(db: Sqlite, stores: InsertedStore[]): InsertedEmployee[] {
  const storeByCode = new Map(stores.map((s) => [s.code, s.id]));
  const empStmt = db.prepare(
    `INSERT INTO employees
     (name, kana, role, login_id, password_hash, pin_hash, hourly_wage, hire_date, retire_date, pin_fail_count, lock_until, note, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 0, NULL, ?, ?, ?)`,
  );
  const esStmt = db.prepare(
    `INSERT INTO employee_stores (employee_id, store_id, is_primary) VALUES (?, ?, ?)`,
  );
  const created: InsertedEmployee[] = [];
  const ts = now();
  for (const e of EMPLOYEES) {
    const passwordHash = e.password ? hash(e.password) : null;
    const pinHash = hash(`legacy-pin:${e.name}:${e.role}`);
    const info = empStmt.run(
      e.name,
      e.kana,
      e.role,
      e.loginId,
      passwordHash,
      pinHash,
      e.hourlyWage,
      e.hireDate,
      e.note,
      ts,
      ts,
    );
    const empId = Number(info.lastInsertRowid);
    const storeIds: number[] = [];
    let primaryStoreId = 0;
    for (const link of e.stores) {
      const storeId = storeByCode.get(link.code);
      if (!storeId) throw new Error(`unknown store code: ${link.code}`);
      esStmt.run(empId, storeId, link.isPrimary ? 1 : 0);
      storeIds.push(storeId);
      if (link.isPrimary) primaryStoreId = storeId;
    }
    created.push({
      id: empId,
      name: e.name,
      role: e.role,
      storeIds,
      primaryStoreId,
    });
  }
  return created;
}

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function atTime(base: Date, hour: number, minute: number): number {
  const d = new Date(base);
  d.setHours(hour, minute, 0, 0);
  return d.getTime();
}

function insertPunches(db: Sqlite, employees: InsertedEmployee[]): number {
  const staff = employees.filter((e) => e.role === "staff");
  const stmt = db.prepare(
    `INSERT INTO time_punches (employee_id, store_id, punch_type, punched_at, source, note, created_at)
     VALUES (?, ?, ?, ?, 'kiosk', NULL, ?)`,
  );
  let count = 0;
  const ts = now();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (const emp of staff) {
    // 5 work days within the past 14 days (every 2-3 days back)
    const offsets = [1, 3, 5, 8, 11];
    for (const off of offsets) {
      const day = new Date(today);
      day.setDate(day.getDate() - off);
      const clockIn = atTime(day, 17, 0);
      const breakStart = atTime(day, 20, 0);
      const breakEnd = atTime(day, 20, 30);
      const clockOut = atTime(day, 23, 30);
      stmt.run(emp.id, emp.primaryStoreId, "clock_in", clockIn, ts);
      stmt.run(emp.id, emp.primaryStoreId, "break_start", breakStart, ts);
      stmt.run(emp.id, emp.primaryStoreId, "break_end", breakEnd, ts);
      stmt.run(emp.id, emp.primaryStoreId, "clock_out", clockOut, ts);
      count += 4;
    }
  }
  return count;
}

function insertShifts(db: Sqlite, employees: InsertedEmployee[]): number {
  const admin = employees.find((e) => e.role === "admin");
  if (!admin) throw new Error("admin employee missing");
  const stmt = db.prepare(
    `INSERT INTO shifts (employee_id, store_id, date, start_time, end_time, status, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const ts = now();
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  // next week Monday
  const nextMon = new Date(base);
  const dow = nextMon.getDay();
  const addDays = ((1 - dow + 7) % 7) + 7; // next week's monday
  nextMon.setDate(nextMon.getDate() + addDays);

  const staff = employees.filter((e) => e.role === "staff");
  let count = 0;
  for (let i = 0; i < 6; i++) {
    const d = new Date(nextMon);
    d.setDate(d.getDate() + i);
    const date = ymd(d);
    // 3 staff per day, alternating draft/published, varying stores
    for (let j = 0; j < 3; j++) {
      const emp = staff[(i + j) % staff.length];
      if (!emp) continue;
      const storeId = emp.primaryStoreId;
      const status = (i + j) % 2 === 0 ? "published" : "draft";
      stmt.run(emp.id, storeId, date, "17:00", "23:30", status, admin.id, ts, ts);
      count += 1;
    }
  }
  return count;
}

export function seedDatabase(dbPath?: string): void {
  const resolvedPath = dbPath ?? resolveDbPath();
  console.log(`[seed] db = ${resolvedPath}`);
  const db = createSqlite(resolvedPath);
  try {
    console.log("[seed] clearing existing data...");
    clearAll(db);

    const tx = db.transaction(() => {
      const stores = insertStores(db);
      console.log(`[seed] inserted stores: ${stores.length}`);
      const employees = insertEmployees(db, stores);
      console.log(`[seed] inserted employees: ${employees.length}`);
      const esCount = employees.reduce((acc, e) => acc + e.storeIds.length, 0);
      console.log(`[seed] inserted employee_stores: ${esCount}`);
      const punchCount = insertPunches(db, employees);
      console.log(`[seed] inserted time_punches: ${punchCount}`);
      const shiftCount = insertShifts(db, employees);
      console.log(`[seed] inserted shifts: ${shiftCount}`);
    });
    tx();
    console.log("[seed] done.");
  } finally {
    db.close();
  }
}

function isDirectRun(): boolean {
  const entry = process.argv[1];
  return entry ? import.meta.url === pathToFileURL(entry).href : false;
}

if (isDirectRun()) {
  seedDatabase();
}
