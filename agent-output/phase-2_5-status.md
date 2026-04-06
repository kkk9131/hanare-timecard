# Phase 2.5: チケット登録

- 目的: architect 出力のチケットを TaskCreate で登録し依存関係を構築
- 開始日: 2026-04-06
- 更新日: 2026-04-06

## Spec Alignment

- spec.md の機能要件 → 21 Implement チケット + 4 Evaluate タスク

## Phase

Complete (pass)

## Completed

- Implement タスク 21 件登録 (#5〜#26)
- Evaluate タスク 4 件登録 (#27〜#30)
- 全タスクの blockedBy を依存関係に従って設定
- Phase 7 (#4) を全 Evaluate に blockedBy

## ID マッピング

- task-3001=#5, 3002=#6, 3003=#7, 3004=#8
- task-4001=#9, 4002=#10, 4003=#11, 4004=#12, 4005=#13, 4006=#14, 4007=#15
- task-5001=#16, 5002=#17, 5003=#18, 5004=#19, 5005=#20, 5006=#21, 5007=#22, 5008=#23
- task-6001=#24, 6002=#25, 6003=#26
- Evaluate: Phase3=#27, Phase4=#28, Phase5=#29 (UI), Phase6=#30

## Not Started

- Phase 3 以降の実装 (最初に着手するのは #5 = task-3001 プロジェクト初期化)

## Failed Tests / Known Issues

- なし

## Next Step

- TaskList で blockedBy が空の pending タスクを取得 → #5 (task-3001) から実装開始
- Implement タスクは contract.md の判定後 implement.md に従い generator agent で実装

## Files Changed

- なし (task list のみ更新)
