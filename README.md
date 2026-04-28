# 雀庵 タイムカード (hanare-timecard)

## 概要

鶏肉専門店「雀庵 本店」および「雀庵 離れ」2 店舗共用のタイムカード兼シフト管理 web アプリケーション。紙のタイムカードと手書きシフト表を電子化し、打刻 → 月次集計 → Excel エクスポートまでをローカル 1 台のマシンで完結させる。

- 打刻 (出勤 / 退勤 / 休憩開始 / 休憩終了) を共用端末で氏名選択だけで実施
- 店長はシフト編成・修正申請承認、管理者は月次エクスポートを含む全管理機能を Web UI から操作
- 墨黒 × 和紙白 × 朱赤の和モダンテーマ、iPad 縦表示に最適化
- 完全ローカル動作 (外部 API・クラウド不要)。LAN 内の iPad から共用

## 本番運用の全体像

2 店舗で使う場合は、**1 台の本番サーバー PC にデータを集約し、各店舗の PC / iPad からブラウザで打刻する**運用を推奨する。

```text
本店の打刻端末   ─┐
                 ├─> 本番サーバー PC ─> data/hanare.db ─> 月末 Excel 出力
離れの打刻端末   ─┘         │
                            └─> 自動バックアップ
```

### なぜ 1 台に集約するか

このアプリは `data/hanare.db` という 1 つのデータベースファイルに勤怠を保存する。店舗ごとに別々の PC でアプリを起動すると、本店の DB と離れの DB が分かれてしまい、月末に 2 つのデータを手作業で合わせる必要が出る。

そのため、本番では次の形にする。

- 本番サーバー PC: アプリと DB を置く中心の PC。原則、営業中は常時起動する
- 本店の打刻端末: ブラウザで本番サーバー PC にアクセスする
- 離れの打刻端末: ブラウザで本番サーバー PC にアクセスする
- 月末処理: 管理者が本番サーバー PC のデータから Excel を出力する

### ネットワーク構成の選び方

| 店舗間の状況 | 推奨構成 | 説明 |
| --- | --- | --- |
| 2 店舗が同じ LAN / 同じ社内ネットワーク | 本番サーバー PC 1 台 | 各端末から `http://<サーバーPCのIP>:3000` を開く |
| 2 店舗が別回線で直接つながっていない | VPN / Tailscale 等で接続 | 安全な専用経路を作り、離れから本店の本番サーバー PC にアクセスする |
| どうしてもネットワーク接続できない | 店舗別運用は非推奨 | DB が分かれ、月末集計・修正・バックアップが複雑になる |

## 権限と管理画面の導線

管理画面は `manager` (店長) と `admin` (管理者) が使う。共用端末の打刻トップ右上にある「管理者画面へ」を押すと `/admin/login` に進む。管理者 PC から直接開く場合も `/admin/login` を使う。

```text
打刻トップ `/`
  └─ 管理者画面へ → `/admin/login`
       ├─ 店長 (manager) → `/admin` / `/admin/shifts` / `/admin/corrections`
       └─ 管理者 (admin) → 上記 + 従業員・店舗・エクスポート・監査ログ
```

| 役割 | できること | 管理画面で表示される主な導線 |
| --- | --- | --- |
| 従業員 (`staff`) | 打刻、自分の履歴確認、修正申請、公開シフト確認 | 管理画面は利用不可 |
| 店長 (`manager`) | 自店舗のダッシュボード確認、シフト編成、修正申請の承認/却下 | `/admin`, `/admin/shifts`, `/admin/corrections` |
| 管理者 (`admin`) | 全店舗・全管理機能。従業員/店舗管理、月次エクスポート、監査ログ、バックアップ実行 | `/admin` 配下の全画面 |

ログインしていない場合はログイン画面へ移動する。ログイン済みでも権限が足りない画面を開いた場合は、ログイン画面ではなく 403「権限がありません」画面が表示される。

## 本番デプロイ手順

ここでの「デプロイ」は、クラウドに公開することではなく、**店舗で使う本番サーバー PC にアプリを設置し、毎日安定して起動できる状態にすること**を指す。

### 1. 本番サーバー PC を決める

- 営業中に電源を切らない PC を 1 台選ぶ
- できれば有線 LAN、または安定した Wi-Fi に接続する
- IP アドレスは固定、またはルーター側で固定割り当てにする
- スリープで止まらないように、OS の電源設定を調整する

### 2. アプリを設置する

本番サーバー PC で以下を実行する。

```bash
git clone <repo-url> hanare-timecard
cd hanare-timecard
npm install
npm run migrate
npm run seed
./start.sh
```

`npm run seed` は初回だけ実行する。実運用開始後に実行すると、既存データが初期データで作り直されるため注意する。

### 3. 起動できたことを確認する

`./start.sh` を実行すると、次のようにアクセス先が表示される。

```text
hanare-timecard server
  -> http://localhost:3000
  -> http://192.168.1.42:3000  (LAN)
```

本番サーバー PC では `http://localhost:3000` を開く。
本店・離れの打刻端末では `http://192.168.1.42:3000` のように、表示された LAN 用 URL を開く。

### 4. 初期ログイン情報を変更する

初期データには確認用の管理者パスワードが入っている。本番運用前に必ず管理画面から変更する。

1. 打刻トップの「管理者画面へ」から進む、または `/admin/login` を直接開く
2. 管理者でログインする
3. `/admin/employees` を開く
4. 管理者・店長アカウントのパスワードを本番用に変更する

### 5. PC 起動時に自動起動する

毎朝手で `./start.sh` を実行してもよいが、本番では PC 起動時に自動起動する設定を推奨する。macOS では `launchd`、Windows ではタスクスケジューラを使う。

自動起動の目的は次の 2 つ。

- PC 再起動後に、打刻画面が使えない時間を減らす
- 担当者がコマンドを覚えていなくても運用できるようにする

### 6. バックアップを設定する

最低限、1 日 1 回は自動バックアップを取る。

```bash
npm run backup
```

バックアップは `data/backups/` に保存される。PC 故障に備えて、週 1 回程度は外付けディスクや別 PC にもコピーする。

## 日々の運用

### 開店前

1. 本番サーバー PC の電源が入っていることを確認する
2. 打刻画面が開けることを確認する
3. 本店・離れの端末で、それぞれ正しい店舗が選ばれていることを確認する

### 出勤・退勤

従業員は打刻端末で以下を行う。

1. 店舗を選ぶ
2. 自分の名前を押す
3. `出勤する` / `退勤する` / `休憩開始` / `休憩終了` を押す
4. 記録完了画面が出たら完了

打刻漏れや間違いがあった場合は、従業員が修正申請を出し、店長または管理者が確認して承認する。

### 管理者・店長の日次確認

店長または管理者で `/admin/login` からログインし、管理画面 `/admin` で次を確認する。店長はダッシュボード・シフト・修正申請、管理者はすべての管理メニューを確認できる。

- 今日の出勤状況
- 未処理の修正申請
- シフトの公開状況
- 明らかな打刻漏れがないか

## 月末の Excel 出力

給与計算前に、管理者が Excel を出力する。

1. `/admin/login` から管理者でログインする
2. `/admin/exports` を開く
3. 対象期間を選ぶ
   例: `2026-04-01` から `2026-04-30`
4. 店舗を選ぶ
   `本店` / `離れ` / `全店舗`
5. `今月をエクスポート`、または形式で `.xlsx` を選んで `Excel で書き出す` を押す
6. ダウンロードした Excel を確認し、給与計算に使う

確認ポイント:

- 出勤・退勤時刻が入っている
- 休憩時間、実働時間、深夜時間が出ている
- 修正申請を承認した内容が反映されている
- 本店・離れ・全店舗の出力対象が意図どおりになっている

## 本番投入前チェックリスト

本番運用を始める前に、最低限以下を確認する。

- [ ] 本番サーバー PC を 1 台に決めた
- [ ] 本店・離れの端末から同じ本番サーバー PC にアクセスできる
- [ ] 管理者・店長の初期パスワードを変更した
- [ ] 従業員マスタと所属店舗を確認した
- [ ] 兼務スタッフが正しい店舗で打刻できることを確認した
- [ ] `npm run backup` でバックアップが作成できる
- [ ] バックアップファイルを別の場所にも保管する運用を決めた
- [ ] 月末 Excel 出力をテストした
- [ ] PC のスリープ設定を解除した
- [ ] ルーターやファイアウォールで、必要な端末からアクセスできる

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
| 本店 店長      | ID + パスワード | `suzumean_mgr` / `suzumean2026` |
| 離れ 店長      | ID + パスワード | `hanare_mgr` / `hanare2026` |
| 本店スタッフ   | 氏名選択        | 山田 太郎                   |
| 本店スタッフ   | 氏名選択        | 佐藤 花子                   |
| 本店スタッフ   | 氏名選択        | 鈴木 次郎                   |
| 離れスタッフ   | 氏名選択        | 田中 美咲                   |
| 離れスタッフ   | 氏名選択        | 高橋 健                     |
| 離れスタッフ   | 氏名選択        | 伊藤 彩                     |
| 兼務スタッフ   | 氏名選択        | 渡辺 翼                     |

> 本番運用に入る前に、管理者ログイン情報は必ず変更してください。

## 利用方法

| 画面                  | URL (概念)           | 対象ユーザー | 用途                                           |
| --------------------- | -------------------- | ------------ | ---------------------------------------------- |
| 打刻トップ (キオスク) | `/`                  | 全従業員     | 店舗選択 → 従業員選択 → 4 種打刻               |
| 従業員ホーム          | `/me`                | 従業員       | 当月勤務時間、打刻履歴、修正申請作成           |
| 管理者ダッシュボード  | `/admin`             | 店長・管理者 | 未処理申請、本日の出勤状況                     |
| シフト編成            | `/admin/shifts`      | 店長・管理者 | 週/月ビュー、ドラフト/公開トグル、重複検出     |
| 修正申請レビュー      | `/admin/corrections` | 店長・管理者 | 承認 / 却下 (理由必須)                         |
| 従業員マスタ          | `/admin/employees`   | 管理者       | 追加 / 編集 / 退職 / 権限・所属店舗の管理      |
| 店舗マスタ            | `/admin/stores`      | 管理者       | 店舗の追加 / 表示名変更                        |
| 勤怠エクスポート      | `/admin/exports`     | 管理者       | 期間指定で CSV / xlsx ダウンロード             |
| 監査ログ              | `/admin/audit`       | 管理者       | 打刻修正・承認・マスタ変更の時系列             |

### 打刻 (出勤 / 退勤 / 休憩)

iPad で `http://<サーバ IP>:3000/` を開くとキオスク画面が表示される。上部の「店舗切り替え」で表示店舗を選び、出勤者一覧から自分の氏名をタップすると、そのまま「出勤」「退勤」「休憩開始」「休憩終了」の打刻画面へ進む。右上側の「管理者画面へ」を押すと管理者ログイン画面へ進む。状況に応じて 1 つだけタップすると打刻が完了し、数秒後に氏名選択画面へ自動で戻る。誤って打刻した場合は、従業員ホーム `/me` から修正申請を作成し、店長/管理者の承認を待つ。

### シフト編成

店長または管理者で `/admin/shifts` を開く。週ビュー / 月ビューを切り替え、空セルをクリックしてシフトを追加、既存セルをクリックして編集または削除する。ドラフト状態では従業員ホームに公開されず、「公開」トグルを ON にすると `/me` で各従業員に表示される。同一従業員の時間帯重複は保存時に検出してエラー表示する。

### 月次エクスポート

管理者で `/admin/exports` を開き、対象店舗と期間 (年月または任意日付範囲) を指定する。通常は `.xlsx` を選んで「Excel で書き出す」を押す。当月分をすぐ出す場合は、画面上部の「今月をエクスポート」を使う。出力ファイルには従業員別の出退勤時刻、休憩時間、実労働時間、深夜時間が含まれ、給与計算ソフトにそのまま取り込める形式になっている。承認済みの修正申請は反映後の値で出力される。

店長アカウントで `/admin/exports` を開いた場合は、ログイン画面へ戻されず、403「権限がありません」と表示される。月次エクスポートは管理者アカウントで実行する。

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

### 本番セキュリティ設定の確認

本番起動時は、debug API は無効化され、CORS は同一オリジンまたは `HANARE_ALLOWED_ORIGINS` に列挙したオリジンだけを許可する。複数指定する場合はカンマ区切りにする:

```bash
NODE_ENV=production HANARE_TLS=1 HANARE_ALLOWED_ORIGINS="https://timecard.example.local" ./start.sh
```

起動後、別ターミナルから以下を確認する:

```bash
# debug API は本番では 404
curl -i http://localhost:3000/api/system/_debug/whoami

# 主要セキュリティヘッダーを確認
curl -I http://localhost:3000/api/system/health

# 許可した Origin のみ Access-Control-Allow-Origin が返る
curl -i -H "Origin: https://timecard.example.local" http://localhost:3000/api/system/health
curl -i -H "Origin: https://unknown.example.local" http://localhost:3000/api/system/health

# HANARE_TLS=1 のとき、ログイン後の Set-Cookie に Secure が付く
curl -i -X POST http://localhost:3000/api/auth/admin-login \
  -H "Content-Type: application/json" \
  -d '{"login_id":"<LOGIN_ID>","password":"<PASSWORD>"}'
```

## トラブルシュート

### サーバが起動しない

- `EADDRINUSE` → ポート 3000 が使用中。`PORT=8080 ./start.sh` で別ポートへ。
- `dist/` が壊れた → `rm -rf dist && ./start.sh` で再ビルド。
- 依存が壊れた → `rm -rf node_modules package-lock.json && npm install`

### iPad から繋がらない

- サーバを起動した Mac と iPad が同じ Wi-Fi SSID に接続しているか確認
- 起動時に表示された LAN IP を Safari に直打ちしているか確認
- macOS ファイアウォールで `node` の着信を許可したか確認

### 管理者アカウントがロックされた

認証失敗が続くと一時的にロックされる。直ちに解除したい場合:

```bash
sqlite3 data/hanare.db "UPDATE employees SET pin_fail_count=0, lock_until=NULL WHERE login_id='<LOGIN_ID>';"
```

### データベースが壊れた

`data/backups/` 内の最新 `.db` を `data/hanare.db` に戻して再起動する。上書き前に、壊れた可能性のある現在の DB は別名で残しておく。

```bash
mv data/hanare.db data/hanare.db.broken
cp data/backups/hanare-20260406-030000.db data/hanare.db
./start.sh
```

## 技術スタック

- **ランタイム**: Node.js v20+ (v25 動作確認)
- **サーバ**: [Hono](https://hono.dev/) + `@hono/node-server`
- **DB**: SQLite (`better-sqlite3`) + [Drizzle ORM](https://orm.drizzle.team/)
- **フロント**: React 19 + Vite + React Router + TanStack Query + Zustand
- **xlsx**: [exceljs](https://github.com/exceljs/exceljs)
- **認証**: 管理者パスワード + サーバ側セッション
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
