# Data Model

## ER 図 (テキスト)

```
stores 1 ── * employee_stores * ── 1 employees
employees 1 ── * time_punches
employees 1 ── * shifts
employees 1 ── * shift_requests
employees 1 ── * correction_requests
employees 1 ── * sessions
employees 1 ── * audit_logs (actor)
stores    1 ── * time_punches
stores    1 ── * shifts
```

`User` は仕様 7.User 注記の通り **Employee.role に統合**する (`staff` / `manager` / `admin`)。管理者ログインは Employee の `login_id` + `password_hash` を使う。

## DDL 相当 (drizzle スキーマで実装)

### stores

```sql
CREATE TABLE stores (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  code          TEXT NOT NULL UNIQUE,        -- 'suzumean' / 'hanare'
  name          TEXT NOT NULL,               -- '雀庵'
  display_name  TEXT NOT NULL,               -- '雀庵 本店'
  opening_time  TEXT NOT NULL,               -- 'HH:MM'
  closing_time  TEXT NOT NULL,
  closed_days   TEXT,                        -- JSON array of weekday ints
  created_at    INTEGER NOT NULL             -- unix ms
);
```

### employees

```sql
CREATE TABLE employees (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  name           TEXT NOT NULL,
  kana           TEXT NOT NULL,
  role           TEXT NOT NULL CHECK(role IN ('staff','manager','admin')),
  login_id       TEXT UNIQUE,                -- manager/admin のみ
  password_hash  TEXT,                       -- manager/admin のみ
  pin_hash       TEXT NOT NULL,              -- 全員 (4-6桁 PIN bcrypt)
  hourly_wage    INTEGER NOT NULL DEFAULT 0,
  hire_date      TEXT NOT NULL,              -- 'YYYY-MM-DD'
  retire_date    TEXT,
  pin_fail_count INTEGER NOT NULL DEFAULT 0,
  lock_until     INTEGER,                    -- unix ms
  note           TEXT,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);
CREATE INDEX idx_employees_kana ON employees(kana);
CREATE INDEX idx_employees_retire ON employees(retire_date);
```

### employee_stores (多対多)

```sql
CREATE TABLE employee_stores (
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  store_id    INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  is_primary  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (employee_id, store_id)
);
CREATE INDEX idx_emp_stores_store ON employee_stores(store_id);
```

### time_punches

```sql
CREATE TABLE time_punches (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  store_id    INTEGER NOT NULL REFERENCES stores(id),
  punch_type  TEXT NOT NULL CHECK(punch_type IN ('clock_in','clock_out','break_start','break_end')),
  punched_at  INTEGER NOT NULL,             -- unix ms (server time)
  source      TEXT NOT NULL CHECK(source IN ('kiosk','admin','correction')),
  note        TEXT,
  created_at  INTEGER NOT NULL
);
CREATE INDEX idx_punches_emp_time ON time_punches(employee_id, punched_at);
CREATE INDEX idx_punches_store_time ON time_punches(store_id, punched_at);
```

打刻の論理削除はしない。修正は新しいレコードを作り、AuditLog に before/after を残す。

### shifts

```sql
CREATE TABLE shifts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  store_id    INTEGER NOT NULL REFERENCES stores(id),
  date        TEXT NOT NULL,                -- 'YYYY-MM-DD'
  start_time  TEXT NOT NULL,                -- 'HH:MM'
  end_time    TEXT NOT NULL,
  status      TEXT NOT NULL CHECK(status IN ('draft','published')),
  created_by  INTEGER NOT NULL REFERENCES employees(id),
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX idx_shifts_store_date ON shifts(store_id, date);
CREATE INDEX idx_shifts_emp_date ON shifts(employee_id, date);
```

同一従業員 × 同日 × 重複時間帯は **アプリ層で検査** (SQLite で時間帯重複制約は組みにくいため)。

### shift_requests (シフト希望)

```sql
CREATE TABLE shift_requests (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id   INTEGER NOT NULL REFERENCES employees(id),
  date          TEXT NOT NULL,
  start_time    TEXT,                       -- nullable: 終日希望
  end_time      TEXT,
  preference    TEXT NOT NULL CHECK(preference IN ('available','preferred','unavailable')),
  note          TEXT,
  submitted_at  INTEGER NOT NULL
);
CREATE INDEX idx_shift_req_date ON shift_requests(date);
```

### correction_requests

```sql
CREATE TABLE correction_requests (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id     INTEGER NOT NULL REFERENCES employees(id),
  target_punch_id INTEGER REFERENCES time_punches(id),
  target_date     TEXT NOT NULL,
  requested_value INTEGER,                  -- unix ms 修正後時刻
  requested_type  TEXT,                     -- 修正後 punch_type
  reason          TEXT NOT NULL,
  status          TEXT NOT NULL CHECK(status IN ('pending','approved','rejected')),
  reviewer_id     INTEGER REFERENCES employees(id),
  reviewed_at     INTEGER,
  review_comment  TEXT,
  created_at      INTEGER NOT NULL
);
CREATE INDEX idx_corrections_status ON correction_requests(status);
CREATE INDEX idx_corrections_emp ON correction_requests(employee_id);
```

### audit_logs

```sql
CREATE TABLE audit_logs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id    INTEGER REFERENCES employees(id),
  action      TEXT NOT NULL,                 -- 'punch.create','punch.update','shift.publish' など
  entity_type TEXT NOT NULL,
  entity_id   INTEGER,
  before_json TEXT,
  after_json  TEXT,
  occurred_at INTEGER NOT NULL
);
CREATE INDEX idx_audit_time ON audit_logs(occurred_at);
CREATE INDEX idx_audit_actor ON audit_logs(actor_id);
```

UI からの削除手段は提供しない (DELETE エンドポイントを実装しない)。

### sessions

```sql
CREATE TABLE sessions (
  id          TEXT PRIMARY KEY,              -- ランダム 32byte hex
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  role        TEXT NOT NULL,
  expires_at  INTEGER NOT NULL,
  created_at  INTEGER NOT NULL
);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);
```

### work_days (集計キャッシュ — 任意, Phase 4 後半で導入可)

```sql
CREATE TABLE work_days (
  employee_id      INTEGER NOT NULL REFERENCES employees(id),
  store_id         INTEGER NOT NULL REFERENCES stores(id),
  date             TEXT NOT NULL,
  worked_minutes   INTEGER NOT NULL,
  break_minutes    INTEGER NOT NULL,
  overtime_minutes INTEGER NOT NULL,
  night_minutes    INTEGER NOT NULL,
  computed_at      INTEGER NOT NULL,
  PRIMARY KEY (employee_id, store_id, date)
);
```

初期実装ではキャッシュなしの都度集計。性能要件 (30 名/2 秒) を満たさない場合のみ導入。

## マイグレーション戦略

- drizzle-kit `generate` で `drizzle/0000_init.sql` 等を生成し git コミット
- 起動時に `scripts/migrate.ts` が `drizzle/` 配下の未適用 SQL を順次適用 (`__drizzle_migrations` テーブルで管理)
- 開発中の破壊的変更は新マイグレーションで対応 (既存 SQL を編集しない)

## 集計仕様の要点 (lib/time.ts)

- 1 勤務 = `clock_in` から次の `clock_out` まで。日跨ぎ可
- 休憩 = 同一勤務内の `break_start` ～ `break_end` の合計
- worked_minutes = (退勤 - 出勤) - 休憩
- 残業 = 8 時間 (480 分) を超えた分
- 深夜 = 22:00–05:00 に該当する分
- 異常データ (clock_in 後 24 時間以上 clock_out なし) は集計から除外し管理者に警告
