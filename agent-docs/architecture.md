# Architecture

## 概要

ローカル 1 マシンで完結する単一プロセス Web アプリ。Hono バックエンド + React (Vite) フロントエンド + SQLite。LAN 内の iPad/PC からブラウザでアクセスする。

## 技術スタック確定

| 層             | 採用                                            |
| -------------- | ----------------------------------------------- |
| ランタイム     | Node.js v25                                     |
| 言語           | TypeScript                                      |
| HTTP           | Hono (Node adapter `@hono/node-server`)         |
| フロント       | React 18 + Vite 5 + TypeScript                  |
| ルーティング   | React Router v6                                 |
| 状態管理       | TanStack Query (server state) + Zustand (UI)    |
| DB             | SQLite (better-sqlite3, 同期 API)               |
| ORM            | Drizzle ORM + drizzle-kit (migration)           |
| 認証           | セッション Cookie + bcrypt (管理者パスワード)   |
| Excel          | exceljs                                         |
| CSV            | 自前実装 (UTF-8 BOM + CRLF)                     |
| バリデーション | zod                                             |
| テスト         | vitest (unit) + Playwright (E2E スモーク)       |
| Lint/Format    | Biome                                           |

### 選定理由

1. **Hono**: Express より軽量、型推論強力、ローカル単一プロセスに最適。Next.js は SSR とビルドが重いため不採用。SvelteKit も候補だったが、シフト編成のドラッグ UI 等で React のライブラリ資産（dnd-kit, react-aria）が活きる。
2. **better-sqlite3**: 同期 API でローカル前提に合致。コネクションプール不要、トランザクション簡潔。
3. **Drizzle**: Prisma と違いランタイムが軽くマイグレーションも DDL に近い。SQLite と相性良い。
4. **exceljs**: 純 JS、Excel 2016+ で開ける ISO/IEC 29500 準拠 xlsx を生成可。日本語フォント・列幅自動調整も可能。
5. **配布**: `npm install && npm run start` の 2 コマンド要件を満たす。Vite で SPA を `dist/` にビルド → Hono が静的配信 + API を同一ポートで返す。

## ディレクトリ構成

```
hanare-timecard/
├── package.json
├── tsconfig.json
├── biome.json
├── drizzle.config.ts
├── vite.config.ts
├── start.sh                  # 起動スクリプト
├── scripts/
│   ├── backup.ts             # 日次バックアップ
│   ├── seed.ts               # シードデータ投入
│   └── migrate.ts            # マイグレーション実行
├── data/
│   ├── hanare.db             # 本番 DB ファイル (gitignore)
│   └── backups/              # 日次バックアップ (gitignore)
├── drizzle/                  # 生成 SQL マイグレーション
├── src/
│   ├── server/
│   │   ├── index.ts          # Hono エントリ
│   │   ├── db/
│   │   │   ├── client.ts     # better-sqlite3 + drizzle インスタンス
│   │   │   └── schema.ts     # Drizzle スキーマ定義
│   │   ├── routes/
│   │   │   ├── auth.ts
│   │   │   ├── punches.ts
│   │   │   ├── shifts.ts
│   │   │   ├── corrections.ts
│   │   │   ├── exports.ts
│   │   │   ├── employees.ts
│   │   │   ├── stores.ts
│   │   │   └── audit.ts
│   │   ├── services/         # ドメインロジック
│   │   │   ├── auth.ts
│   │   │   ├── timecard.ts
│   │   │   ├── aggregation.ts
│   │   │   └── export.ts
│   │   ├── middleware/
│   │   │   ├── session.ts
│   │   │   └── audit.ts
│   │   └── lib/
│   │       ├── time.ts       # 日跨ぎ勤務、深夜・残業計算
│   │       └── crypto.ts
│   ├── client/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── routes/           # 画面コンポーネント
│   │   ├── components/       # 共通 UI
│   │   ├── styles/
│   │   │   ├── tokens.css    # 和モダン CSS variables
│   │   │   └── global.css
│   │   ├── api/              # fetch ラッパ + zod パース
│   │   └── stores/           # zustand
│   └── shared/
│       ├── types.ts          # サーバ・クライアント共有型
│       └── schemas.ts        # zod スキーマ
└── tests/
    ├── unit/
    └── e2e/
```

## 起動フロー

1. `./start.sh` → `npm run build` (vite build → `dist/client`) → `node dist/server/index.js`
2. dev は `npm run dev` で Vite dev server (5173) と Hono (3000) を並行起動。フロントは API へプロキシ。
3. 本番起動時、Hono は:
   - DB ファイル存在チェック → 無ければマイグレーション + シード
   - `dist/client` を静的配信
   - `/api/*` を REST で受ける
   - `0.0.0.0:3000` にバインド (LAN 公開)

## LAN 公開戦略

- バインド: `0.0.0.0:3000` (環境変数 `PORT` で変更可)
- ホスト機の IP を `start.sh` 起動時にコンソールへ表示 (`http://192.168.x.x:3000`)
- TLS は標準では無効。`HANARE_TLS_CERT` / `HANARE_TLS_KEY` 環境変数があれば https モードで起動 (オプション)
- ファイアウォール: macOS は `System Settings > Network > Firewall` で Node を許可する旨を README に記載

## 認証セッション方式

- 共用端末向け打刻: 氏名選択で 5 分有効の Cookie セッション発行 → 打刻完了で即破棄
- 管理者 ID/PW: 2 時間有効の Cookie セッション (sliding 更新)
- セッション保存: SQLite `sessions` テーブル (id, user_id, role, expires_at)
- Cookie: HttpOnly, SameSite=Lax, Secure は TLS 時のみ
- bcrypt cost = 10
- 管理者ログイン失敗が続いた場合は `employee.lock_until` を 5 分先に設定

## バックアップ方式

- `scripts/backup.ts` を `cron` or `launchd` で 1 日 1 回起動 (README に手順記載)
- 動作: SQLite の `VACUUM INTO 'data/backups/hanare-YYYYMMDD-HHmm.db'` で整合性のあるコピー作成
- 30 世代を超える古いファイルを削除
- アプリ管理画面からも「今すぐバックアップ」ボタンで実行可

## テスト方針

- **unit (vitest)**: `lib/time.ts` の日跨ぎ・深夜計算、集計関数、CSV/xlsx 生成、管理者認証ロックロジック
- **integration (vitest)**: Hono ルートを `app.request()` で直接叩いてレスポンス検証 (in-memory SQLite)
- **E2E (Playwright)**: スモーク 1 本のみ。打刻 → 履歴閲覧 → 管理者ログイン → エクスポートの最低フロー
- 視覚回帰や負荷テストはスコープ外

## 制約

- 外部ネットワーク呼び出し禁止 (オフライン動作)
- DB ファイルは `data/hanare.db` 固定。`HANARE_DB_PATH` で上書き可
- マイグレーションは drizzle-kit generate で生成し git 管理
