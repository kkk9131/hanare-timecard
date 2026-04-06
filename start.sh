#!/bin/bash
# 雀庵 タイムカード 起動スクリプト
set -euo pipefail

cd "$(dirname "$0")"

export PORT="${PORT:-3000}"
export NODE_ENV="${NODE_ENV:-production}"

echo "雀庵 タイムカード 起動中..."

# 依存関係の導入 (node_modules がなければ)
if [ ! -d node_modules ]; then
  echo "[start] npm install を実行します..."
  npm install --silent
fi

# フロントエンド + サーバビルド (dist がなければ)
if [ ! -d dist/server ] || [ ! -d dist/client ]; then
  echo "[start] npm run build を実行します..."
  npm run build
fi

# オプション: 起動時バックアップ
if [ "${HANARE_BACKUP_ON_START:-0}" = "1" ]; then
  echo "[start] 起動時バックアップを実行します..."
  npx tsx scripts/backup.ts || echo "[start] バックアップに失敗しましたが起動を続行します"
fi

echo "[start] サーバを起動します (PORT=${PORT})"
exec node dist/server/src/server/index.js
