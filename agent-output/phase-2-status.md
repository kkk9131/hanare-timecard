# Phase 2: Architecture

- 目的: spec.md を詳細設計とフェーズ分けタスクチケットに分解
- 開始日: 2026-04-06
- 更新日: 2026-04-06

## Spec Alignment

- spec 全要件 → architecture/data-model/api-spec/ui-design/excel-export ドキュメントとチケット 21 件に展開

## Phase

Complete (pass)

## Completed

- 詳細設計ドキュメント 5 本: architecture.md, data-model.md, api-spec.md, ui-design.md, excel-export.md
- フェーズ分け: Phase 3 (基盤), Phase 4 (バックエンド), Phase 5 (フロントエンド), Phase 6 (仕上げ)
- チケット 21 件: phase-3 x4, phase-4 x7, phase-5 x8, phase-6 x3
- 各チケットに本体 (.md) と完了条件 (.done_when.md) を分離して生成
- tasks/phases.md に依存関係を記述

## In Progress

- なし

## Not Started

- Phase 2.5: チケット登録 (TaskCreate でチケット 21 件 + Evaluate 4 件 = 25 件登録)

## Failed Tests / Known Issues

- なし

## Key Decisions

- 技術スタック確定: **Hono + React/Vite + TypeScript + better-sqlite3 + Drizzle + exceljs + bcrypt (Cookie セッション)**
  - Hono = 軽量、Cloudflare/Node 両対応、ローカル運用に最適
  - React + Vite = 開発速度とエコシステムの厚さ
  - better-sqlite3 = 同期 API でシンプル、ローカル単一プロセス向き
  - Drizzle = TypeScript 親和、軽量
  - exceljs = xlsx 生成の定番

## Next Step

- Phase 2.5: tasks/phases.md と各 task-XNNN.md を読み、TaskCreate で 21 チケット + フェーズごとの Evaluate 4 件を登録。Phase 7 の blockedBy を全 Evaluate で更新

## Files Changed

- agent-docs/architecture.md
- agent-docs/data-model.md
- agent-docs/api-spec.md
- agent-docs/ui-design.md
- agent-docs/excel-export.md
- tasks/phases.md
- tasks/phase-{3,4,5,6}/task-XNNN.md (21 件)
- tasks/phase-{3,4,5,6}/task-XNNN.done_when.md (21 件)
