# 雀庵 タイムカード (hanare-timecard)

## 概要

鶏肉専門店「雀庵」および「雀庵はなれ」2 店舗共用のタイムカード兼シフト管理 web アプリケーション。紙のタイムカードと手書きシフト表を電子化し、打刻 → 月次集計 → Excel エクスポートまでをローカル 1 台のマシンで完結させる。

- 打刻 (出勤 / 退勤 / 休憩開始 / 休憩終了) を共用端末から PIN 認証で実施
- 店長・管理者はシフト編成、修正申請承認、月次エクスポートを Web UI から操作
- 墨黒 × 和紙白 × 朱赤の和モダンテーマ、iPad 縦表示に最適化
- 完全ローカル動作 (外部 API・クラウド不要)。LAN 内の iPad から共用

## 動作要件

- Node.js v20 以上 (v25 で動作確認済み)
- macOS (arm64 推奨) / Windows / Linux
- ブラウザ: Safari 最新 / Chrome 最新 / iPad Safari

## インストール / 初回セットアップ

```bash
git clone <repo-url> hanare-timecard
cd hanare-timecard
npm install
npm run migrate      # SQLite スキーマ作成
npm run seed         # 初期データ (店舗・サンプル従業員) 投入 ※初回のみ
```

## 起動

```bash
./start.sh           # ビルド後、http://localhost:3000 で起動
```

`./start.sh` は `node_modules` と `dist/` が無ければ自動で `npm install` / `npm run build` を実行する。

初回起動後はブラウザで **http://localhost:3000** を開く。

### LAN 共有 (iPad 等から利用)

`./start.sh` は `0.0.0.0` にバインドするため、同一 LAN の iPad からアクセスできる。起動時に LAN IP が表示されるので、iPad の Safari で `http://<表示されたIP>:3000` を開く。

```
hanare-timecard server
  -> http://localhost:3000
  -> http://192.168.1.42:3000  (LAN)
```

ポートを変更するときは環境変数 `PORT` を渡す:

```bash
PORT=8080 ./start.sh
```

macOS のファイアウォールが Node をブロックしている場合は、システム設定 → ネットワーク → ファイアウォール → オプション から `node` の着信接続を許可する。

## 初期ログイン情報 (シード直後)

| 役割           | ログイン方法    | 認証情報                    |
| -------------- | --------------- | --------------------------- |
| 管理者 (店主)  | ID + パスワード | `oyakata` / `hanare2026`    |
| 本店 店長      | ID + パスワード | `jakuan_mgr` / `jakuan2026` |
| はなれ 店長    | ID + パスワード | `hanare_mgr` / `hanare2026` |
| 本店スタッフ   | 氏名選択 + PIN  | 山田 太郎 PIN: `1001`       |
| 本店スタッフ   | 氏名選択 + PIN  | 佐藤 花子 PIN: `1002`       |
| 本店スタッフ   | 氏名選択 + PIN  | 鈴木 次郎 PIN: `1003`       |
| はなれスタッフ | 氏名選択 + PIN  | 田中 美咲 PIN: `2001`       |
| はなれスタッフ | 氏名選択 + PIN  | 高橋 健 PIN: `2002`         |
| はなれスタッフ | 氏名選択 + PIN  | 伊藤 彩 PIN: `2003`         |
| 兼務スタッフ   | 氏名選択 + PIN  | 渡辺 翼 PIN: `3001`         |

> 本番運用に入る前に、管理者ログインでパスワードと PIN を変更すること。

## 利用方法

| 画面                  | URL (概念)           | 対象ユーザー | 用途                                           |
| --------------------- | -------------------- | ------------ | ---------------------------------------------- |
| 打刻トップ (キオスク) | `/`                  | 全従業員     | 店舗選択 → 従業員選択 → PIN → 4 種打刻         |
| 従業員ホーム          | `/me`                | 従業員       | 当月勤務時間、打刻履歴、修正申請作成           |
| 管理者ダッシュボード  | `/admin`             | 店長・管理者 | 未処理申請、本日の出勤状況                     |
| シフト編成            | `/admin/shifts`      | 店長・管理者 | 週/月ビュー、ドラフト/公開トグル、重複検出     |
| 修正申請レビュー      | `/admin/corrections` | 店長・管理者 | 承認 / 却下 (理由必須)                         |
| 従業員マスタ          | `/admin/employees`   | 管理者       | 追加 / 編集 / 退職 / PIN リセット / ロック解除 |
| 勤怠エクスポート      | `/admin/export`      | 管理者       | 期間指定で CSV / xlsx ダウンロード             |
| 監査ログ              | `/admin/audit`       | 管理者       | 打刻修正・承認・マスタ変更の時系列             |

### 打刻 (出勤 / 退勤 / 休憩)

iPad で `http://<サーバ IP>:3000/` を開くとキオスク画面が表示される。店舗を選び、出勤者一覧から自分の氏名をタップし、4 桁の PIN を入力する。認証後は「出勤」「退勤」「休憩開始」「休憩終了」の 4 ボタンが表示されるので、状況に応じて 1 つだけタップする。打刻が成功するとトーストで時刻が表示され、数秒後に氏名選択画面へ自動で戻る。誤って打刻した場合は、従業員ホーム `/me` から修正申請を作成し、店長/管理者の承認を待つ。

### シフト編成

店長または管理者で `/admin/shifts` を開く。週ビュー / 月ビューを切り替え、空セルをクリックしてシフトを追加、既存セルをクリックして編集または削除する。ドラフト状態では従業員ホームに公開されず、「公開」トグルを ON にすると `/me` で各従業員に表示される。同一従業員の時間帯重複は保存時に検出してエラー表示する。

### 月次エクスポート

管理者で `/admin/export` を開き、対象店舗と期間 (年月または任意日付範囲) を指定してから「CSV ダウンロード」または「Excel (xlsx) ダウンロード」を押す。出力ファイルには従業員別の出退勤時刻、休憩時間、実労働時間、深夜時間が含まれ、給与計算ソフトにそのまま取り込める形式になっている。承認済みの修正申請は反映後の値で出力される。

## データ保存

- データベース: `data/hanare.db` (SQLite, better-sqlite3)
- バックアップ: `data/backups/hanare-YYYYMMDD-HHMMSS.db` (直近 30 世代保持)

### データ移行 (別マシンへ)

新しいマシンでリポジトリを clone し、`npm install` 後に旧マシンの `data/hanare.db` を同じパスへコピーする。`npm run migrate` は冪等なので移行後に実行して問題ない。

```bash
# 旧マシンで
scp data/hanare.db user@new-host:/path/to/hanare-timecard/data/hanare.db
# 新マシンで
cd /path/to/hanare-timecard && npm run migrate && ./start.sh
```

## バックアップ

### 手動バックアップ

```bash
npm run backup
```

`data/backups/hanare-<timestamp>.db` に書き出し、31 世代目以降は自動削除する。起動時にもバックアップを取りたい場合は以下で起動する:

```bash
HANARE_BACKUP_ON_START=1 ./start.sh
```

### 自動バックアップ (cron / launchd)

`scripts/backup.cron.example` に crontab と macOS launchd のサンプルがある。最小例 (macOS / Linux crontab):

```cron
PROJECT_DIR=/Users/owner/hanare-timecard
0 3 * * * cd $PROJECT_DIR && /usr/local/bin/npx tsx scripts/backup.ts >> $PROJECT_DIR/data/backups/backup.log 2>&1
```

運用手順の詳細は [docs/operations.md](docs/operations.md) を参照。

## TLS (LAN 内 https 化)

本アプリは LAN 内運用を前提としており、TLS は必須ではないが以下 2 方式で有効化できる:

1. **リバースプロキシ方式 (推奨)**: Caddy / nginx を同一ホスト上で起動し、`https://*:443 → http://localhost:3000` にプロキシする。この場合、アプリ側で環境変数 `HANARE_TLS=1` を指定するとセッション Cookie に `Secure` 属性が付与される。

   ```bash
   HANARE_TLS=1 ./start.sh
   ```

2. **ローカル自己署名証明書**: 店内 iPad のみが対象なので、Caddy の `tls internal` や mkcert で発行した証明書をリバースプロキシに読ませるのが最も単純。

## トラブルシュート

### サーバが起動しない

- `EADDRINUSE` → ポート 3000 が使用中。`PORT=8080 ./start.sh` で別ポートへ。
- `dist/` が壊れた → `rm -rf dist && ./start.sh` で再ビルド。
- 依存が壊れた → `rm -rf node_modules package-lock.json && npm install`

### iPad から繋がらない

- サーバを起動した Mac と iPad が同じ Wi-Fi SSID に接続しているか確認
- 起動時に表示された LAN IP を Safari に直打ちしているか確認
- macOS ファイアウォールで `node` の着信を許可したか確認

### 従業員が PIN ロックされた

誤 PIN 5 回で 5 分ロックされる。直ちに解除したい場合:

- 管理画面 `/admin/employees` → 対象従業員 → 「ロック解除」ボタン
- または SQLite を直接更新 (最終手段):

  ```bash
  sqlite3 data/hanare.db "UPDATE employees SET pin_fail_count=0, lock_until=NULL WHERE id=<EMP_ID>;"
  ```

### PIN を忘れた

管理画面 `/admin/employees` → 対象従業員 → 「PIN リセット」で新しい PIN を設定。運用詳細は [docs/operations.md](docs/operations.md)。

### データベースが壊れた

`data/backups/` 内の最新 `.db` を `data/hanare.db` に上書きコピーして再起動する。

```bash
cp data/backups/hanare-20260406-030000.db data/hanare.db
./start.sh
```

## 技術スタック

- **ランタイム**: Node.js v20+ (v25 動作確認)
- **サーバ**: [Hono](https://hono.dev/) + `@hono/node-server`
- **DB**: SQLite (`better-sqlite3`) + [Drizzle ORM](https://orm.drizzle.team/)
- **フロント**: React 19 + Vite + React Router + TanStack Query + Zustand
- **xlsx**: [exceljs](https://github.com/exceljs/exceljs)
- **認証**: bcrypt ハッシュ化 PIN / パスワード + サーバ側セッション
- **テスト**: Vitest
- **Lint / Format**: Biome

## 関連ドキュメント

- [docs/operations.md](docs/operations.md) - 運用手順 (日次/月次/障害対応)
- [docs/development.md](docs/development.md) - 開発者向け (構成・追加手順)
- [agent-docs/spec.md](agent-docs/spec.md) - 要件仕様
- [agent-docs/architecture.md](agent-docs/architecture.md) - アーキテクチャ設計
- [agent-docs/api-spec.md](agent-docs/api-spec.md) - API 仕様

## ライセンス

内部利用。再配布なし。
