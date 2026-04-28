# API Spec

REST over JSON。すべて `/api` プレフィックス。Cookie セッションで認証。zod でリクエスト検証。

## 認証共通

- `Cookie: hanare_sid=<session_id>`
- 未認証 → 401 `{ "error": "unauthenticated" }`
- 権限不足 → 403 `{ "error": "forbidden", "message": "権限がありません" }` などの日本語案内付きエラー

フロントエンドでは、未ログイン時だけログイン画面へ遷移する。ログイン済みで権限が足りない管理画面を開いた場合は、ログイン画面ではなく 403「権限がありません」案内を表示する。

ロール:

- `staff`: 自身の打刻・履歴・修正申請・公開シフト閲覧
- `manager`: staff の権限 + 自店舗のダッシュボード・シフト編成・修正申請審査。管理画面の導線は `/admin`, `/admin/shifts`, `/admin/corrections`
- `admin`: 全店舗・全管理機能。manager の導線に加えて従業員・店舗マスタ、エクスポート、監査ログ、バックアップを操作できる

Role 表記:

- `認証`: `staff` / `manager` / `admin` のいずれか
- `manager+`: `manager` または `admin`
- `manager` は原則として所属店舗のデータだけ参照・操作できる。別店舗を指定した場合は 403
- `admin` は全店舗を参照・操作できる

## エンドポイント一覧

### Auth

| Method | Path                  | Role | 説明                                               |
| ------ | --------------------- | ---- | -------------------------------------------------- |
| GET    | /api/auth/employees   | 公開 | 打刻トップ用従業員一覧 (id, name, kana, store_ids) |
| POST   | /api/auth/kiosk-login | 公開 | `{employee_id}` → 共用端末用セッション             |
| POST   | /api/auth/admin-login | 公開 | `{login_id, password}`                             |
| POST   | /api/auth/logout      | 認証 | セッション破棄                                     |
| GET    | /api/auth/me          | 認証 | 現在ユーザー情報                                   |

リクエスト例:

```json
POST /api/auth/kiosk-login
{ "employee_id": 12 }
→ 200 { "employee": {...}, "session_expires_at": 1712345678000 }
```

### Stores

| Method | Path            | Role  | 説明     |
| ------ | --------------- | ----- | -------- |
| GET    | /api/stores     | 認証  | 店舗一覧 |
| POST   | /api/stores     | admin | 店舗追加 |
| PATCH  | /api/stores/:id | admin | 店舗更新 |

### Employees

| Method | Path                      | Role     | 説明                                  |
| ------ | ------------------------- | -------- | ------------------------------------- |
| GET    | /api/employees            | manager+ | クエリ: `?store_id=&include_retired=&search=`。manager は自店舗のみ |
| GET    | /api/employees/:id        | manager+ | 1 件取得。manager は自店舗従業員のみ |
| POST   | /api/employees            | admin    | 新規追加                              |
| PATCH  | /api/employees/:id        | admin    | 更新                                  |
| POST   | /api/employees/:id/retire | admin    | 退職処理                              |

### Time Punches

| Method | Path                    | Role     | 説明                                                                          |
| ------ | ----------------------- | -------- | ----------------------------------------------------------------------------- |
| POST   | /api/punches            | 認証     | 打刻 `{punch_type, store_id}` (時刻はサーバが付与)。本人の所属店舗のみ        |
| GET    | /api/punches/me         | 認証     | 自分の打刻履歴 `?from=&to=`                                                   |
| GET    | /api/punches            | manager+ | 全打刻 `?store_id=&employee_id=&from=&to=`。manager は自店舗/自店舗従業員のみ |
| GET    | /api/punches/me/summary | 認証     | 当月累計 `{worked, overtime, break, night}` (分)                              |
| GET    | /api/punches/me/state   | 認証     | 現在の打刻状態。`state` は `off` / `working` / `on_break` のいずれか          |

`POST /api/punches` レスポンス:

```json
{
  "punch": { "id":..., "punch_type":"clock_in", "punched_at":1712345678000 },
  "message": "雀庵さん、お疲れさまです。出勤を記録しました（10:00）",
  "next_state": "working"
}
```

連続同種打刻 → 409 `{"error":"invalid_transition","current_state":"working"}`.

### Shifts

| Method | Path                  | Role                               | 説明                                                                 |
| ------ | --------------------- | ---------------------------------- | -------------------------------------------------------------------- |
| GET    | /api/shifts           | 認証                               | staff は自分の公開分のみ。manager+ は管理対象店舗の全件 `?store_id=&from=&to=&status=` |
| POST   | /api/shifts           | manager+                           | `{employee_id, store_id, date, start_time, end_time}` (status=draft)。manager は自店舗のみ |
| PATCH  | /api/shifts/:id       | manager+                           | 更新。manager は自店舗のみ                                           |
| DELETE | /api/shifts/:id       | manager+                           | 削除 (ドラフトのみ)。manager は自店舗のみ                            |
| POST   | /api/shifts/publish   | manager+                           | `{store_id, from, to}` 範囲を公開。manager は自店舗のみ              |
| GET    | /api/shifts/conflicts | manager+                           | `?store_id=&from=&to=` 人員不足/重複検出。manager は自店舗のみ       |

### Shift Requests

| Method | Path                    | Role         | 説明         |
| ------ | ----------------------- | ------------ | ------------ |
| GET    | /api/shift-requests     | manager+            | `?from=&to=`。manager は自店舗従業員のみ |
| GET    | /api/shift-requests/me  | 認証                | 自分の希望 |
| POST   | /api/shift-requests     | 認証                | 自分の希望追加 |
| DELETE | /api/shift-requests/:id | 認証 (本人) / manager+ | 本人の取り下げ、または manager+ による管理対象従業員の削除 |

### Correction Requests

| Method | Path                         | Role     | 説明                       |
| ------ | ---------------------------- | -------- | -------------------------- |
| GET    | /api/corrections             | manager+ | `?status=&store_id=`。manager は自店舗のみ |
| GET    | /api/corrections/me          | 認証     | 自分の申請 |
| POST   | /api/corrections             | 認証     | 自分の申請 |
| POST   | /api/corrections/:id/approve | manager+ | 承認 → 打刻反映 + 監査ログ。manager は自店舗のみ |
| POST   | /api/corrections/:id/reject  | manager+ | `{review_comment}` 必須。manager は自店舗のみ |

### Exports

| Method | Path                         | Role  | 説明                                     |
| ------ | ---------------------------- | ----- | ---------------------------------------- |
| GET    | /api/exports/period.xlsx     | admin | `?from=&to=&store_id=` xlsx ダウンロード |
| GET    | /api/exports/period.csv      | admin | 同上 CSV (UTF-8 BOM + CRLF)              |
| GET    | /api/exports/xlsx            | admin | 互換エイリアス。新規実装は `period.xlsx` 推奨 |
| GET    | /api/exports/csv             | admin | 互換エイリアス。新規実装は `period.csv` 推奨 |

レスポンスヘッダ例: `Content-Disposition: attachment; filename="hanare-all-2026-04.xlsx"; filename*=UTF-8''hanare-all-2026-04.xlsx`

### Audit Logs

| Method | Path       | Role  | 説明                                      |
| ------ | ---------- | ----- | ----------------------------------------- |
| GET    | /api/audit | admin | `?from=&to=&actor_id=&action=` ページング |

### System

| Method | Path               | Role  | 説明                     |
| ------ | ------------------ | ----- | ------------------------ |
| POST   | /api/system/backup | admin | 即時バックアップ実行     |
| GET    | /api/system/health | 公開  | `{status:"ok",time:...}` |

## エラー形式

```json
{ "error": "code_string", "message": "ユーザー向け日本語", "details": { ... } }
```

HTTP ステータスは意味どおり (400 / 401 / 403 / 404 / 409 / 422 / 423 / 500)。

## バリデーション

すべてのリクエストボディ・クエリは zod スキーマ (`src/shared/schemas.ts`) で検証。サーバ・クライアントで共有。
