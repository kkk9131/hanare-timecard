# Excel/CSV Export

## ライブラリ選定

- **xlsx**: `exceljs` (純 JS、Excel 2016+ 互換、列幅・スタイル調整可、日本語対応良好)
- **csv**: 自前実装 (UTF-8 BOM `\uFEFF` + CRLF + ダブルクォートエスケープ)。依存追加なし

`node-xlsx` や `xlsx` (SheetJS) は機能が薄い or ライセンス考慮があるため不採用。

## ファイル名

- xlsx: `hanare-{store_code|all}-{YYYY-MM}.xlsx`
- csv : `hanare-{store_code|all}-{YYYY-MM}.csv`

## xlsx レイアウト

シート 1 枚 `勤怠サマリ`。

| 列  | ヘッダ      | 幅(目安) | 形式       | 例           |
| --- | ----------- | -------- | ---------- | ------------ |
| A   | 店舗        | 12       | text       | 雀庵         |
| B   | 従業員ID    | 8        | number     | 12           |
| C   | 氏名        | 16       | text       | 山田 太郎    |
| D   | 日付        | 12       | YYYY/MM/DD | 2026/04/05   |
| E   | 曜日        | 5        | text       | 日           |
| F   | 出勤        | 8        | HH:MM      | 10:00        |
| G   | 退勤        | 8        | HH:MM      | 19:30        |
| H   | 休憩(分)    | 8        | number     | 60           |
| I   | 実働(分)    | 8        | number     | 510          |
| J   | 実働(時:分) | 9        | text       | 8:30         |
| K   | 残業(分)    | 8        | number     | 30           |
| L   | 深夜(分)    | 8        | number     | 0            |
| M   | 修正フラグ  | 8        | text       | (空) or 修正 |
| N   | 備考        | 24       | text       |              |

### スタイル

- ヘッダ行 (1 行目): 太字, 中央寄せ, 背景 `FFEFE4D8` (薄い和紙), 罫線 thin
- 1 行目を `worksheet.views = [{ state:'frozen', ySplit:1 }]` で固定
- 列幅は各列の `width` を上記目安で設定 (autoFit は exceljs に正式対応なし → 手動指定)
- フォント: 全体 `游ゴシック` 11pt
- 数値列は `numFmt = '0'`、時刻列は `numFmt = 'hh:mm'`
- 行は従業員別 → 日付昇順
- 集計行: 従業員ブロックの末尾に「{氏名} 合計」行 (太字, 上に薄罫線)
- ファイル末尾: 「全体合計」行

### サマリシート (オプション、後フェーズで追加可)

初期実装ではシート 1 枚のみ。

## CSV レイアウト

xlsx の同等列を CSV 化。

```
店舗,従業員ID,氏名,日付,曜日,出勤,退勤,休憩(分),実働(分),実働(時分),残業(分),深夜(分),修正フラグ,備考\r\n
雀庵,12,山田 太郎,2026/04/05,日,10:00,19:30,60,510,8:30,30,0,,\r\n
```

- 先頭に BOM (`\uFEFF`)
- 改行 `\r\n`
- フィールド内に `,` `"` 改行が含まれる場合 `"..."` 囲み + `"` を `""` にエスケープ
- 数値もそのまま (Excel が解釈)

## サーバ実装方針 (`src/server/services/export.ts`)

```ts
async function buildExport(opts: { from: string; to: string; storeId?: number }) {
  const rows = await aggregationService.workDayRows(opts);
  return { rows };
}

async function buildXlsx(rows): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('勤怠サマリ');
  ws.columns = [...]; // 上記定義
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  for (const r of rows) ws.addRow(r);
  // 集計行追加・スタイル適用
  return Buffer.from(await wb.xlsx.writeBuffer());
}

function buildCsv(rows): string {
  const header = [...].join(',');
  const body = rows.map(toCsvLine).join('\r\n');
  return '\uFEFF' + header + '\r\n' + body + '\r\n';
}
```

## 受け入れ基準との対応

- 「Excel for Mac/Windows で開いて文字化けしない」→ ExcelJS の xlsx は UTF-8 内部、Office 既定で開ける
- 「CSV ダブルクリックで日本語崩れない」→ BOM + CRLF で Excel 既定インポータが UTF-8 認識
- 「集計値が手計算と 1 分未満で一致」→ `lib/time.ts` で分単位丸めを統一 (切り捨てではなく丸めなし、分単位整数で扱う)
- 「1 クリックで当月分」→ `/admin/exports` 画面に「今月をエクスポート」ボタンを最上部に配置
