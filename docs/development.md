# 開発者ガイド (development.md)

hanare-timecard の開発者向け簡易リファレンス。運用手順は [operations.md](operations.md)、要件は [agent-docs/spec.md](../agent-docs/spec.md) を参照。

## ディレクトリ構成

```
hanare-timecard/
├── README.md
├── start.sh                  # 本番起動スクリプト (install + build + serve)
├── package.json
├── drizzle.config.ts
├── vite.config.ts
├── vitest.config.ts
├── biome.json
├── tsconfig.*.json           # server / client で分離
├── agent-docs/               # 要件・設計ドキュメント (spec / architecture / api-spec)
├── docs/                     # 運用・開発ドキュメント
├── drizzle/                  # Drizzle マイグレーション SQL
├── scripts/
│   ├── migrate.ts            # schema 適用 (冪等)
│   ├── seed.ts               # 初期データ投入
│   ├── backup.ts             # SQLite バックアップ
│   └── backup.cron.example   # cron / launchd テンプレート
├── src/
│   ├── server/               # Hono API サーバ
│   │   ├── index.ts          # エントリ (listen + migrate)
│   │   ├── app.ts            # Hono app 組み立て
│   │   ├── db/               # Drizzle client / schema
│   │   ├── middleware/       # auth / session / error handling
│   │   ├── routes/           # REST エンドポイント
│   │   ├── services/         # ビジネスロジック (punch / shift / export 等)
│   │   └── lib/              # ユーティリティ
│   ├── client/               # React + Vite フロントエンド
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── routes/           # React Router 画面
│   │   ├── components/       # 共通 UI コンポーネント
│   │   ├── api/              # TanStack Query フック
│   │   ├── state/            # Zustand ストア
│   │   ├── lib/              # クライアント utility
│   │   └── styles/           # グローバル CSS / テーマ
│   └── shared/               # サーバ・クライアント共通の型 / zod schema
├── tests/                    # 統合テスト
├── data/                     # SQLite DB と バックアップ (git ignore)
│   ├── hanare.db
│   └── backups/
└── dist/                     # ビルド成果物 (git ignore)
```

## npm スクリプト

| コマンド          | 説明                                                           |
| ----------------- | -------------------------------------------------------------- |
| `npm run dev`     | サーバ + Vite を `concurrently` で起動 (HMR)                   |
| `npm run build`   | Vite (client) + tsc (server) の本番ビルド → `dist/`            |
| `npm run start`   | `dist/` を本番モードで起動                                     |
| `npm run migrate` | Drizzle マイグレーションを `data/hanare.db` に適用 (冪等)      |
| `npm run seed`    | 初期データ (店舗 2 + 従業員 10) を投入。既存データは全消去     |
| `npm run backup`  | `data/backups/` に SQLite スナップショット (30 世代保持)       |
| `npm run lint`    | Biome で format + lint チェック                                |
| `npm run test`    | Vitest で全テスト実行                                          |
| `./start.sh`      | 依存 / ビルド確認 → `npm run start` (本番運用向けの薄いラッパ) |

## 開発フロー

```bash
npm install
npm run migrate
npm run seed            # 初回のみ、または DB をリセットしたいとき
npm run dev             # server + vite 両方を起動
```

- サーバ: http://localhost:3000 (Hono)
- Vite dev server: http://localhost:5173 (API は `/api/*` を 3000 にプロキシ)

保存すると自動リロードされる。シード済みの `oyakata / hanare2026` で管理者ログイン可能。

## テスト

```bash
npm run test                 # 全テスト
npm run test -- --watch      # ウォッチモード
npm run test <pattern>       # ファイル名パターンで絞り込み
npm run test:e2e             # Playwright smoke。専用の一時 DB を作って実行
```

- ユニット: `src/**/*.test.ts`
- 統合: `tests/**/*.test.ts`
- テスト用 SQLite は `:memory:` または `tests/tmp/` 配下を使う (本番 DB を汚さない)
- E2E: Playwright の `webServer` が `HANARE_DB_PATH` を一時 DB に向け、migrate/seed 後にサーバを起動する。`data/hanare.db` は変更しない

## 品質ゲートと依存リスク

本番前の最低確認は次の 5 つ。

```bash
npm run lint
npm test
npm run build
npm run test:e2e
npm audit --audit-level=moderate
```

`npm audit --audit-level=moderate` は 2026-04-28 時点で次の既知 moderate が残る。いずれも強制修正すると `drizzle-kit` の大幅ダウングレード、または `exceljs` の破壊的変更が入るため、現時点では risk acceptance とし、上流の安全な更新が出たら解消する。

| 依存経路 | 内容 | 受容理由 / 運用上の対策 |
| --- | --- | --- |
| `drizzle-kit -> @esbuild-kit/core-utils -> esbuild` | 開発サーバ応答を別サイトから読まれる可能性 | 本番は `npm run build` 後の `npm run start` で運用し、`npm run dev` や `drizzle-kit` は本番 LAN に公開しない |
| `exceljs -> uuid` | `uuid` の buffer 指定時の境界チェック不足 | アプリ側では `uuid` の buffer API を直接使わず、Excel 出力はサーバ内で生成する。未信頼入力を `uuid` buffer に渡さない |

`postcss` の moderate は `npm audit fix` で `8.5.12` に更新済み。

## 新しい API エンドポイント追加手順

1. **zod schema 定義** (`src/shared/schemas.ts`)
   - リクエスト/レスポンスの型を追加 (client と server で共有)
2. **サービス層実装** (`src/server/services/<feature>.ts`)
   - DB 操作とビジネスロジックを純粋関数で実装
3. **ルート追加** (`src/server/routes/<feature>.ts`)
   - Hono ルータに zod validator を噛ませてサービスを呼ぶ
   - 権限チェックは `middleware/auth.ts` の `requireRole('admin'|'manager'|'staff')` を使う
4. **`app.ts` でルータを mount**
5. **クライアント API フック追加** (`src/client/api/<feature>.ts`)
   - TanStack Query の `useQuery` / `useMutation` でラップ
6. **UI 実装** (`src/client/routes/` or `src/client/components/`)
7. **テスト追加**
   - サービス層のユニットテスト
   - 可能なら統合テスト (`tests/`) で HTTP レベルの振る舞いを確認

## データモデル変更フロー

スキーマ変更は Drizzle Kit で管理する。

1. **schema 編集**: `src/server/db/schema.ts` の該当テーブル定義を変更
2. **マイグレーション生成**:
   ```bash
   npx drizzle-kit generate
   ```
   `drizzle/` に新しい SQL ファイルが生成される
3. **生成 SQL を確認**
   - 破壊的変更 (列削除、型変更) が意図通りか
   - 既存データの移行が必要なら、手書きで `UPDATE` 文を追記する
4. **適用**:
   ```bash
   npm run backup          # 既存 DB をバックアップ (必須)
   npm run migrate         # 新しい SQL が適用される
   ```
5. **seed の整合性確認**:
   ```bash
   npm run seed && npm run test
   ```
6. **既存テストの修正 / 追加**
7. **本番 DB へ適用する前に、運用者向けにアップデート手順を周知** (README/docs 更新)

## コーディング規約

- Lint / Format: Biome (`npm run lint`)
- TypeScript strict mode
- サーバとクライアントで共有する型は必ず `src/shared/` に置く
- `console.log` は server/index.ts とスクリプト以外では避ける (エラーは throw して middleware で処理)
- zod schema は共有スキーマを再利用し、重複定義を避ける

## デバッグ tips

- DB の中身を見る: `sqlite3 data/hanare.db` (または TablePlus / DB Browser for SQLite)
- セッション状態: Cookie `hanare_session` の値をサーバ側 `sessions` テーブルで突き合わせる
- 監査ログ: `SELECT * FROM audit_logs ORDER BY occurred_at DESC LIMIT 20;`
- 打刻の生データ: `SELECT * FROM time_punches WHERE employee_id=? ORDER BY punched_at DESC;`

## 参考ドキュメント

- [agent-docs/spec.md](../agent-docs/spec.md) - プロダクト要件
- [agent-docs/architecture.md](../agent-docs/architecture.md) - アーキテクチャ設計
- [agent-docs/api-spec.md](../agent-docs/api-spec.md) - API 仕様
- [docs/operations.md](operations.md) - 運用ガイド
