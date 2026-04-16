# API Spec

REST over JSON。すべて `/api` プレフィックス。Cookie セッションで認証。zod でリクエスト検証。

## 認証共通

- `Cookie: hanare_sid=<session_id>`
- 未認証 → 401 `{ "error": "unauthenticated" }`
- 権限不足 → 403 `{ "error": "forbidden" }`

ロール:

- `staff`: 自身の打刻・履歴・修正申請・公開シフト閲覧
- `manager`: staff の権限 + 自店舗のシフト編成・修正申請審査・自店ダッシュボード
- `admin`: 全機能 + マスタ管理 + エクスポート + 監査ログ

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
| GET    | /api/employees            | manager+ | クエリ: `?store_id=&include_retired=` |
| POST   | /api/employees            | admin    | 新規追加                              |
| PATCH  | /api/employees/:id        | admin    | 更新                                  |
| POST   | /api/employees/:id/retire | admin    | 退職処理                              |

### Time Punches

| Method | Path                    | Role     | 説明                                               |
| ------ | ----------------------- | -------- | -------------------------------------------------- | --------- | ------------------------ |
| POST   | /api/punches            | staff    | 打刻 `{punch_type, store_id}` (時刻はサーバが付与) |
| GET    | /api/punches/me         | staff    | 自分の打刻履歴 `?from=&to=`                        |
| GET    | /api/punches            | manager+ | 全打刻 `?store_id=&employee_id=&from=&to=`         |
| GET    | /api/punches/me/summary | staff    | 当月累計 `{worked, overtime, break, night}` (分)   |
| GET    | /api/punches/me/state   | staff    | 現在の打刻状態 `{state: 'off'                      | 'working' | 'on_break', last_punch}` |

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
| GET    | /api/shifts           | staff (公開のみ) / manager+ (全件) | `?store_id=&from=&to=&status=`                                       |
| POST   | /api/shifts           | manager+                           | `{employee_id, store_id, date, start_time, end_time}` (status=draft) |
| PATCH  | /api/shifts/:id       | manager+                           | 更新                                                                 |
| DELETE | /api/shifts/:id       | manager+                           | 削除 (ドラフトのみ)                                                  |
| POST   | /api/shifts/publish   | manager+                           | `{store_id, from, to}` 範囲を公開                                    |
| GET    | /api/shifts/conflicts | manager+                           | `?store_id=&from=&to=` 人員不足/重複検出                             |

### Shift Requests

| Method | Path                    | Role         | 説明         |
| ------ | ----------------------- | ------------ | ------------ |
| GET    | /api/shift-requests     | manager+     | `?from=&to=` |
| GET    | /api/shift-requests/me  | staff        | 自分の希望   |
| POST   | /api/shift-requests     | staff        | 希望追加     |
| DELETE | /api/shift-requests/:id | staff (本人) | 取り下げ     |

### Correction Requests

| Method | Path                         | Role     | 説明                       |
| ------ | ---------------------------- | -------- | -------------------------- |
| GET    | /api/corrections             | manager+ | `?status=&store_id=`       |
| GET    | /api/corrections/me          | staff    | 自分の申請                 |
| POST   | /api/corrections             | staff    | 申請                       |
| POST   | /api/corrections/:id/approve | manager+ | 承認 → 打刻反映 + 監査ログ |
| POST   | /api/corrections/:id/reject  | manager+ | `{review_comment}` 必須    |

### Exports

| Method | Path              | Role  | 説明                                     |
| ------ | ----------------- | ----- | ---------------------------------------- |
| GET    | /api/exports/xlsx | admin | `?from=&to=&store_id=` xlsx ダウンロード |
| GET    | /api/exports/csv  | admin | 同上 CSV (UTF-8 BOM + CRLF)              |

レスポンスヘッダ: `Content-Disposition: attachment; filename="hanare-2026-04.xlsx"`

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
