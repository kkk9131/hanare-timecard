# 運用ガイド (operations.md)

雀庵 タイムカードの日次・月次運用と、障害対応の手順をまとめる。インストール手順は [README.md](../README.md) を参照。

## 対象読者

- 店主 / オーナー (管理者ロール)
- 各店舗の店長 (manager ロール)
- システム管理を担当するスタッフ

---

## 1. 日次運用フロー

### 1.1 開店前 (共用端末セットアップ)

1. 店舗 PC で `./start.sh` が自動起動していることを確認 (launchd / Windows タスクスケジューラ推奨)
2. iPad の Safari で `http://<ホスト IP>:3000` を開き、打刻トップ画面 (キオスクモード) が表示されることを確認
3. Safari を「ホーム画面に追加」してフルスクリーンで使うと操作性が良い

### 1.2 従業員の打刻

1. iPad に表示された店舗を確認 (雀庵 / 雀庵はなれ)
2. 自分の氏名タイルをタップ
3. 氏名を選ぶとそのまま打刻画面へ進むので、出勤 / 退勤 / 休憩開始 / 休憩終了 のいずれかをタップ
4. 「◯◯さん、お疲れさまです。出勤を記録しました (HH:MM)」と表示されたら完了
5. 自動的にキオスクトップへ戻る (次の従業員が使える状態)

### 1.3 打刻漏れ・誤打刻の修正申請

従業員側:

1. ログイン後 `/me` → 「打刻履歴」
2. 誤った打刻行の「修正申請」ボタン
3. 修正後の時刻と理由を入力して送信

店長側:

1. `/admin` ダッシュボードの「未処理申請」バッジをタップ
2. `/admin/corrections` で内容を確認し、承認 or 却下 (却下時は理由必須)
3. 承認された修正は即座に打刻データへ反映され、旧値は監査ログに残る

---

## 2. 週次運用 (シフト編成)

1. 店長は前週末までに `/admin/shifts` で翌週のシフトを編成
2. 従業員 × 日付のセルをクリックし、開始/終了時刻と店舗を指定
3. ドラフト状態で全セル入力 → 「人員不足日」ハイライトがないことを確認
4. 「公開」ボタンで公開。従業員側 `/me` から参照できるようになる
5. 公開後の変更は履歴として残るため、やり直しを恐れず調整可能

目安: 1 週間分 (7 日 × 3〜5 名) の編成は 5 分以内で完了する。

---

## 3. 月次締めとエクスポート

毎月の給与計算前 (例: 月初の 1〜3 日) に実施する。

1. 管理者で `/admin/export` を開く
2. 期間を選択 (例: 2026-03-01 〜 2026-03-31)
3. 店舗フィルタ: 「雀庵」「雀庵はなれ」「全店舗」のいずれか
4. 「xlsx ダウンロード」または「CSV ダウンロード」
5. 生成されたファイルを Excel で開き、既存の給与計算シートに貼り付け

### 生成ファイルの確認ポイント

- 氏名・店舗・日別打刻・総労働時間・残業時間・深夜時間・休憩時間の列が揃っている
- 合計行の「総労働時間」が手集計と 1 分未満の誤差で一致する
- CSV を Excel ダブルクリックで開いても日本語が化けない (UTF-8 BOM 付き)
- 日をまたぐ勤務 (深夜営業) が 1 勤務として集計されている

### 締め後の修正

締め後に修正申請が承認された場合、エクスポートをやり直してから差し替える。監査ログで変更履歴を確認できる。

---

## 4. データバックアップ運用

### 4.1 自動バックアップ (推奨)

`scripts/backup.cron.example` の cron か launchd を登録する。`npm run backup` は次の動作をする:

- `data/hanare.db` を `data/backups/hanare-YYYYMMDD-HHMMSS.db` にコピー
- SQLite の `.backup` API を使用 (トランザクション中でも整合性を保つ)
- 直近 30 世代を超える古いバックアップを自動削除

### 4.2 macOS: launchd

```bash
# ~/Library/LaunchAgents/com.hanare.timecard.backup.plist を配置
launchctl load ~/Library/LaunchAgents/com.hanare.timecard.backup.plist
launchctl list | grep hanare  # 登録確認
```

plist テンプレートは `scripts/backup.cron.example` にある。

### 4.3 Linux / macOS: crontab

```cron
PROJECT_DIR=/Users/owner/hanare-timecard
0 3 * * * cd $PROJECT_DIR && /usr/local/bin/npx tsx scripts/backup.ts >> $PROJECT_DIR/data/backups/backup.log 2>&1
```

### 4.4 月次の外部保管

週 1 回程度、`data/backups/` 最新ファイルを外付け HDD や別マシンにコピーしておくことを推奨する。ローカル 1 台運用のためマシン自体の故障に備える必要がある。

```bash
rsync -av data/backups/ /Volumes/Backup/hanare-timecard-backups/
```

---

## 5. パスワードのリセット手順

### 5.1 管理者パスワード (UI 経由)

1. 管理者で `/admin/employees` を開き、対象の admin / manager アカウントを編集
2. 「パスワード変更」フィールドに新パスワードを入力して保存

### 5.2 DB 直接操作 (最終手段、管理者パスワード紛失時)

```bash
# bcrypt ハッシュ再生成 (Node ワンライナー)
node -e 'console.log(require("bcrypt").hashSync("新しいパスワード", 10))'
# 出力されたハッシュを使って更新
sqlite3 data/hanare.db "UPDATE employees SET password_hash='<ハッシュ>' WHERE login_id='oyakata';"
```

---

## 6. 障害対応

### 6.1 サーバが起動しない

1. `./start.sh` の標準出力とエラーを確認
2. `EADDRINUSE` の場合: 別ポートで起動 (`PORT=8080 ./start.sh`) または先に起動している Node を `lsof -i :3000` で特定して停止
3. `dist/` 破損の疑い: `rm -rf dist && ./start.sh`
4. 依存関係破損の疑い: `rm -rf node_modules package-lock.json && npm install`
5. DB スキーマ不整合の疑い: `npm run migrate` を手動実行してログ確認

### 6.2 DB 破損 / 復旧

```bash
# 1. サーバ停止
# 2. 最新バックアップを確認
ls -lt data/backups/ | head

# 3. 破損ファイルを退避
mv data/hanare.db data/hanare.db.broken

# 4. 最新バックアップを復元
cp data/backups/hanare-20260406-030000.db data/hanare.db

# 5. 再起動
./start.sh
```

### 6.3 ロックされた管理者アカウントの緊急解除

必要に応じて DB の `pin_fail_count` と `lock_until` を直接解除する。

### 6.4 打刻が反映されていないと従業員から申告

1. `/admin/audit` で当該従業員・時間帯の監査ログを確認
2. 打刻レコードが存在しない場合は、修正申請を管理者側で代理作成 (`/admin/corrections` → 新規)
3. 打刻は存在するが集計に反映されない場合は、`/admin/export` でキャッシュ更新、または `work_days` テーブルの該当行を再計算

---

## 7. セキュリティ注意事項

### 7.1 ネットワーク

- **外部公開しない**。ルータのポートフォワーディングで 3000 を開放してはいけない
- 同一 LAN (店内 Wi-Fi) の端末からのみアクセス可能にする
- ゲスト Wi-Fi は店舗 LAN と分離し、タイムカードのホスト IP に到達できないようにする

### 7.2 TLS

LAN 内 http でも運用可能だが、同じ LAN にお客様向け Wi-Fi を相乗りさせている場合や、セッション Cookie を盗聴されたくない場合は TLS を有効化する。推奨は Caddy によるリバースプロキシ:

```
# Caddyfile
hanare.local {
  tls internal
  reverse_proxy localhost:3000
}
```

アプリ側は `HANARE_TLS=1 ./start.sh` で起動し、セッション Cookie に `Secure` 属性を付与する。

### 7.3 パスワード

- 管理者 / 店長パスワードは bcrypt でハッシュ化して保存される (平文非保持)
- 認証失敗が続いた場合は一時ロックされる
- 運用上の推奨: パスワードは定期ローテーションし、退職者は即 `/admin/employees` で退職処理

### 7.4 監査ログ

- 打刻修正・承認・マスタ変更は `audit_logs` テーブルに記録され、UI 経由では削除できない
- 不正が疑われる場合は `/admin/audit` で時系列確認 → 該当期間の `data/backups/` を保全

### 7.5 物理セキュリティ

- 共用 iPad を店外に持ち出せないよう固定
- サーバ PC は業務外時間はロック画面に
- `data/hanare.db` を外部メディアにコピーして持ち出さない運用ルールを設ける

---

## 8. アップデート手順

```bash
cd /path/to/hanare-timecard
npm run backup                 # 念のため先にバックアップ
git pull                       # ソース更新
npm install                    # 依存関係更新
npm run migrate                # スキーマ差分適用 (冪等)
rm -rf dist && ./start.sh      # 再ビルドして起動
```

アップデート後は、打刻 → シフト → エクスポートの順で動作確認 (スモークテスト) を行う。
