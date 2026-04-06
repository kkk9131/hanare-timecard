# Phase 1: Planning

- 目的: 雀庵/雀庵はなれ 2 店舗向けタイムカード兼シフト管理アプリの高レベル仕様策定
- 開始日: 2026-04-06
- 更新日: 2026-04-06

## Spec Alignment

- spec.md 全体（要求の初回展開）

## Phase

Complete (pass)

## Completed

- planner agent による仕様展開
- agent-docs/spec.md に仕様書を保存
- 主要機能・受け入れ条件・非機能要件・UI/UX 方針・データモデル・推奨技術スタック候補を記述

## In Progress

- なし

## Not Started

- Phase 2: Architecture

## Failed Tests / Known Issues

- なし

## Key Decisions

- DB は SQLite を推奨（ローカル簡潔運用のため）
- フレームワーク候補は Node (SvelteKit/Hono+React) / Rust (Axum) / Python (FastAPI)。最終決定は architect
- 認証は従業員=PIN、管理者=ID+パスワードの 2 系統
- UI コンセプト: 墨黒ベース、和紙白・朱・金茶アクセント、明朝系縦書き
- スコープ外: 給与計算自動化、外部通知、AI 最適化

## Next Step

- Phase 2: Architecture を起動。architect agent で spec.md を読み、フェーズ分けタスクチケット (tasks/phase-X/task-XNNN.md + .done_when.md) を生成

## Files Changed

- agent-docs/spec.md
