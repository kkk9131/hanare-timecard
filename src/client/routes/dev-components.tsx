import {
  AndonHover,
  AppShell,
  BigClock,
  EmployeeTile,
  ShojiTransition,
  StatePill,
  SumiButton,
  WashiCard,
} from "../components/ui";

/**
 * /dev/components プレビューページ。
 * 共通コンポーネント 9 種をまとめて確認するための dev 専用ページ。
 * import.meta.env.DEV ガード下でのみ登録される。
 */
export function DevComponentsPage() {
  return (
    <AppShell storeName="dev preview" verticalLogo>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 32,
          padding: 24,
        }}
      >
        <WashiCard title="WashiCard" eyebrow="01" highlight>
          <p>和紙風カード。金茶の上辺ハイライト付き。</p>
        </WashiCard>

        <WashiCard title="SumiButton" eyebrow="02">
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <SumiButton variant="primary">主アクション</SumiButton>
            <SumiButton variant="ghost">地味</SumiButton>
            <SumiButton variant="danger">警告</SumiButton>
          </div>
        </WashiCard>

        <WashiCard title="BigClock" eyebrow="03">
          <BigClock />
        </WashiCard>

        <WashiCard title="EmployeeTile" eyebrow="04">
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            <EmployeeTile name="山田 太郎" kana="やまだ たろう" state="idle" />
            <EmployeeTile name="佐藤 花子" kana="さとう はなこ" state="on-shift" />
            <EmployeeTile name="鈴木 次郎" kana="すずき じろう" state="on-break" />
          </div>
        </WashiCard>

        <WashiCard title="ShojiTransition" eyebrow="05">
          <ShojiTransition transitionKey="demo">
            <p>障子が開くような切替アニメーション。</p>
          </ShojiTransition>
        </WashiCard>

        <WashiCard title="AndonHover" eyebrow="06">
          <div style={{ display: "flex", gap: 16 }}>
            <AndonHover tone="kincha">
              <div style={{ padding: 16 }}>kincha 行灯</div>
            </AndonHover>
            <AndonHover tone="shu">
              <div style={{ padding: 16 }}>shu 行灯</div>
            </AndonHover>
          </div>
        </WashiCard>

        <WashiCard title="StatePill" eyebrow="07">
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <StatePill label="未出勤" tone="neutral" />
            <StatePill label="勤務中" tone="success" />
            <StatePill label="休憩中" tone="warning" />
            <StatePill label="エラー" tone="danger" />
            <StatePill label="情報" tone="info" />
          </div>
        </WashiCard>

        <WashiCard title="AppShell" eyebrow="08">
          <p>このページ全体が AppShell でラップされています。</p>
        </WashiCard>
      </div>
    </AppShell>
  );
}
