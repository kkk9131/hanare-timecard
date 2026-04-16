# UI Design

## 画面一覧

| 画面ID | パス               | アクセス      | 役割                            |
| ------ | ------------------ | ------------- | ------------------------------- |
| K01    | /                  | 公開          | 打刻トップ (従業員選択)         |
| K03    | /punch/board       | staff session | 打刻ボタン画面 (出勤/退勤/休憩) |
| K04    | /punch/done        | staff session | 打刻完了表示 → 自動ログアウト   |
| E01    | /me                | staff         | 自分のダッシュボード (今月集計) |
| E02    | /me/history        | staff         | 打刻履歴                        |
| E03    | /me/corrections    | staff         | 修正申請一覧 + 新規申請         |
| E04    | /me/shifts         | staff         | 公開シフト閲覧                  |
| E05    | /me/shift-requests | staff         | 希望提出                        |
| A00    | /admin/login       | 公開          | 管理者ログイン                  |
| A01    | /admin             | manager+      | 店舗ダッシュボード              |
| A02    | /admin/shifts      | manager+      | シフト編成 (週/月ビュー)        |
| A03    | /admin/corrections | manager+      | 修正申請審査                    |
| A04    | /admin/employees   | admin         | 従業員マスタ                    |
| A05    | /admin/stores      | admin         | 店舗マスタ                      |
| A06    | /admin/exports     | admin         | エクスポート画面                |
| A07    | /admin/audit       | admin         | 監査ログ閲覧                    |

## 画面遷移

```
[K01 名前選択] → [K03 打刻ボード] → [K04 完了] → 自動で K01 へ
                        ↓ "履歴を見る"
                    [E01 ダッシュボード] (短時間限定)

[A00 ログイン] → [A01 ダッシュボード] ⇄ [A02..A07]
```

打刻フローは可能な限り 2 タップ以内で完結 (名前選択 → 打刻ボタン)。

## 和モダンスタイルガイド

### カラーパレット (CSS variables, `src/client/styles/tokens.css`)

```css
:root {
  /* 基調 */
  --sumi-900: #0e0c0a; /* 漆黒 (背景) */
  --sumi-800: #1a1612; /* カード背景 */
  --sumi-700: #2a2520; /* ボーダー */
  --kogecha-600: #3d2f24; /* 焦茶 (アクセント面) */

  /* 紙・墨 */
  --washi-50: #f5efe4; /* 和紙白 (主文字) */
  --washi-100: #ebe3d3;
  --washi-300: #c8bda5; /* 副文字 */

  /* 差し色 */
  --shu-500: #b23a2e; /* 朱赤 (主アクション) */
  --shu-400: #c95040;
  --kincha-500: #b8860b; /* 金茶 (強調) */
  --kincha-400: #d4a017;

  /* 状態 */
  --success: #6b8e3d; /* 苔色 */
  --warning: #d4a017;
  --danger: #b23a2e;

  /* タイポ */
  --font-mincho:
    "游明朝", "Yu Mincho", "Noto Serif JP", "Hiragino Mincho ProN", serif;
  --font-gothic:
    "游ゴシック", "Yu Gothic", "Noto Sans JP", "Hiragino Sans", sans-serif;

  /* 寸法 */
  --radius-sm: 4px;
  --radius-md: 8px;
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 16px;
  --space-4: 24px;
  --space-5: 40px;
  --tap-min: 56px; /* 打刻ボタン最小 */
}
```

### タイポグラフィ

| 用途             | フォント       | サイズ  | weight |
| ---------------- | -------------- | ------- | ------ |
| ロゴ「雀庵」     | 明朝 (縦組)    | 32-48px | 400    |
| 画面見出し       | 明朝           | 28px    | 500    |
| セクション見出し | 明朝           | 20px    | 500    |
| 本文             | ゴシック       | 16px    | 400    |
| 補助/メタ        | ゴシック       | 13px    | 400    |
| 大時計表示       | 明朝 (tabular) | 96px    | 300    |

明朝の縦組みは `writing-mode: vertical-rl` を活用し、ロゴ・店舗名・章タイトルで使用。

### コアコンポーネント

`src/client/components/`

- `<WashiCard>`: 和紙テクスチャ風背景 (微細ノイズ SVG) + 焦茶ボーダー
- `<SumiButton variant="primary|ghost|danger">`: 朱の主アクション、墨の地味、朱の警告
- `<BigClock />`: 大時計 (HH:MM:SS, 1 秒更新, tabular-nums)
- `<EmployeeTile name kana onClick>`: K01 用の大型タイル (最小 96×96)
- `<ShojiTransition>`: 横スライド切替 (障子モチーフ)
- `<AndonHover>`: ホバーで微発光 (行灯)
- `<ShiftGrid>`: 縦軸=従業員, 横軸=日付 のドラッグ可能グリッド (dnd-kit)
- `<StatePill icon label tone>`: アイコン + 文字併記 (色だけに頼らない)

### レイアウト原則

- 打刻系画面 (K01, K03-K04): フル幅、左上に縦組みロゴ「雀庵 / はなれ」、中央に大時計と主ボタン。背景は墨黒 + 微細木目 SVG
- 管理画面: 左サイドバー (墨黒) + メイン (焦茶寄り)。サイドバー収納可
- iPad 縦 (768×1024) を主要ターゲットに、min-width 360 まで縮退

### アクセシビリティ

- コントラスト比 WCAG AA 以上 (背景 sumi-900 + washi-50 で 15:1)
- 全ボタン aria-label
- フォーカス可視リング (kincha-400, 2px outline)
- タップ対象 56×56 以上 (打刻系)
- prefers-reduced-motion で ShojiTransition フェードに切替

### マイクロコピー例

- 打刻完了: 「{name}さん、お疲れさまです。{action}を記録しました（{HH:MM}）」
- ロック中: 「しばらくお時間をおいてから、もう一度お試しください」
- 退勤確認: 「本当に退勤しますか？（{HH:MM}）」
- 退職処理: 「{name}さんを退職扱いにします。よろしいですか？」

### アニメーション

- `<ShojiTransition>`: 障子が左右に開く 300ms ease-out
- `<AndonHover>`: box-shadow が 0 → 0 0 24px rgba(212,160,23,0.25) へ 200ms
- 過剰な動きは禁止 (打刻完了は短いフェードのみ)
