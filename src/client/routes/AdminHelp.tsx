import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { fetchMe, type Me } from "../api/auth";
import type { ApiError } from "../api/client";
import { Heading } from "../components/ui/Heading";
import { Stack } from "../components/ui/Stack";
import { StatePill } from "../components/ui/StatePill";
import { SumiButton } from "../components/ui/SumiButton";
import { WashiCard } from "../components/ui/WashiCard";
import "./AdminHelp.css";

export type AdminHelpRole = "manager" | "admin";

export type AdminHelpTopic = {
  id: string;
  pageCode: string;
  title: string;
  route: string;
  roles: AdminHelpRole[];
  purpose: string;
  firstAction: string;
  steps: string[];
  checks: string[];
  cautions: string[];
  trouble: string[];
};

export const ADMIN_HELP_TOPICS: AdminHelpTopic[] = [
  {
    id: "dashboard",
    pageCode: "A01",
    title: "ダッシュボード",
    route: "/admin",
    roles: ["manager", "admin"],
    purpose:
      "今日の店舗状況を最初に見る場所です。出勤中の人数、休憩中の人数、未処理の修正申請、今週のシフト状況をまとめて確認します。",
    firstAction: "開いたら、まず右上の店舗切り替えで確認したい店舗を選びます。",
    steps: [
      "「現在勤務中」で、出勤中と休憩中の人数を見る",
      "「未処理の修正申請」が 1 件以上なら、一覧で内容を確認する",
      "「シフト充足率」が低い日は、シフト画面で不足を確認する",
      "よく使う操作から、修正申請やシフトへ進む",
    ],
    checks: [
      "本店と離れを切り替えて見間違えていない",
      "未処理申請を開店中にためすぎていない",
      "今週分のシフトが公開済みになっている",
    ],
    cautions: [
      "人数が実際の現場と違う場合は、打刻漏れの可能性があります。",
      "店舗を「全店舗」にすると、店舗別の細かい確認には向きません。",
    ],
    trouble: [
      "従業員が出勤したのに人数が増えない時は、打刻端末で本人の打刻完了画面が出たか確認します。",
      "申請件数が減らない時は、修正申請画面で未処理タブを開きます。",
    ],
  },
  {
    id: "shifts",
    pageCode: "A02",
    title: "シフト",
    route: "/admin/shifts",
    roles: ["manager", "admin"],
    purpose:
      "週または月の勤務予定を作り、公開する場所です。公開すると従業員側の画面にも表示されます。",
    firstAction: "最初に店舗と対象週を選び、空いている日付マスからシフトを追加します。",
    steps: [
      "店舗を選ぶ",
      "週表示または月表示を選ぶ",
      "従業員と日付の交点を押して、開始時刻と終了時刻を入れる",
      "重複や不足の表示がないか見る",
      "問題なければ「この週を公開する」で従業員に見える状態にする",
    ],
    checks: [
      "対象店舗を間違えていない",
      "公開前の下書きが残ったままになっていない",
      "人員不足日が残っていない",
    ],
    cautions: [
      "公開したシフトは従業員に見えるため、公開前に店舗と週を確認します。",
      "同じ従業員の時間が重なる場合は保存できません。",
    ],
    trouble: [
      "追加ボタンが出ない時は、店舗が選ばれているか確認します。",
      "公開できない時は、下書き件数と対象週を確認します。",
    ],
  },
  {
    id: "corrections",
    pageCode: "A03",
    title: "修正申請",
    route: "/admin/corrections",
    roles: ["manager", "admin"],
    purpose:
      "打刻漏れや時刻間違いの申請を、承認または却下する場所です。承認すると勤怠データに反映されます。",
    firstAction: "まず「未処理」タブを開き、申請者・対象日・申請理由を確認します。",
    steps: [
      "未処理タブを開く",
      "申請者、対象日、申請内容、理由を見る",
      "内容が正しければ承認する",
      "不明点がある場合は却下理由を入れて却下する",
      "承認後、必要ならダッシュボードやエクスポートで反映を確認する",
    ],
    checks: [
      "対象日と時刻が本人の申告と合っている",
      "出勤・退勤・休憩の区分が正しい",
      "却下時は理由が伝わる文章になっている",
    ],
    cautions: [
      "承認した修正は月次エクスポートにも反映されます。",
      "迷う申請はその場で承認せず、本人または店長に確認します。",
    ],
    trouble: [
      "申請が見つからない時は、承認済・却下済タブも確認します。",
      "承認できない時は、すでに処理済みでないか画面を更新して確認します。",
    ],
  },
  {
    id: "employees",
    pageCode: "A04",
    title: "従業員",
    route: "/admin/employees",
    roles: ["admin"],
    purpose:
      "従業員名、所属店舗、権限、入退社情報を管理する場所です。店長や管理者のログイン情報もここで扱います。",
    firstAction: "検索または店舗フィルタで対象者を探し、必要な場合だけ編集します。",
    steps: [
      "店舗や名前で対象者を探す",
      "新しい人は「従業員を追加」から登録する",
      "所属店舗と主店舗を確認する",
      "店長・管理者にはログインIDとパスワードを設定する",
      "退職者は削除ではなく退職処理にする",
    ],
    checks: [
      "名前とふりがなが現場で分かる表記になっている",
      "所属店舗が打刻する店舗と合っている",
      "店長・管理者だけにログインIDがある",
    ],
    cautions: [
      "退職者を消すと過去の勤怠確認が難しくなるため、退職処理で残します。",
      "パスワードは本人以外に見せないように扱います。",
    ],
    trouble: [
      "打刻トップに名前が出ない時は、所属店舗と退職扱いになっていないか確認します。",
      "管理画面に入れない時は、役割が店長または管理者になっているか確認します。",
    ],
  },
  {
    id: "stores",
    pageCode: "A05",
    title: "店舗",
    route: "/admin/stores",
    roles: ["admin"],
    purpose:
      "本店・離れなどの店舗名、営業時間、定休日を管理する場所です。打刻やシフトの店舗選択に関わります。",
    firstAction: "店舗カードを見て、現場で使う表示名と営業時間が正しいか確認します。",
    steps: [
      "店舗一覧で表示名を確認する",
      "営業時間と定休日を見る",
      "変更が必要な店舗で「編集する」を押す",
      "現場で分かりやすい表示名に整える",
      "保存後、ダッシュボードや打刻端末で表示を確認する",
    ],
    checks: [
      "本店・離れの表記が現場の呼び方と合っている",
      "営業時間の開始が終了より前になっている",
      "定休日が実際の営業日と合っている",
    ],
    cautions: [
      "店舗名を変えると、画面上の表示やエクスポートの店舗名にも影響します。",
      "営業中に大きく変える場合は、現場に一声かけてから行います。",
    ],
    trouble: [
      "保存できない時は、営業時間の前後関係を確認します。",
      "表示名が反映されない時は、画面を再読み込みします。",
    ],
  },
  {
    id: "exports",
    pageCode: "A06",
    title: "エクスポート",
    route: "/admin/exports",
    roles: ["admin"],
    purpose: "給与計算や保管用に、勤怠データをExcelまたはCSVで書き出す場所です。",
    firstAction: "通常は「今月をエクスポート」から始めます。締め済み月は期間を先月に変更します。",
    steps: [
      "期間を選ぶ",
      "店舗を本店・離れ・全店舗から選ぶ",
      "通常は xlsx を選ぶ",
      "Excelで開き、氏名・店舗・実働時間・休憩時間を見る",
      "修正申請を承認した後は、同じ期間でもう一度出力する",
    ],
    checks: [
      "給与計算に使う期間になっている",
      "店舗の選択が目的と合っている",
      "承認済みの修正申請が反映されている",
    ],
    cautions: [
      "店長アカウントではエクスポートできません。",
      "締め後に修正が入った場合は、古いファイルを使わず再出力します。",
    ],
    trouble: [
      "Excelが空に見える時は、期間と店舗を確認します。",
      "日本語が崩れる時は、CSVではなく xlsx を使います。",
    ],
  },
  {
    id: "audit",
    pageCode: "A07",
    title: "監査ログ",
    route: "/admin/audit",
    roles: ["admin"],
    purpose:
      "打刻、修正、シフト公開、従業員や店舗の変更履歴を確認する場所です。記録は読み取り専用です。",
    firstAction: "期間と行為者を絞り込むと、必要な履歴を探しやすくなります。",
    steps: [
      "期間を指定する",
      "必要なら行為者を選ぶ",
      "アクションで修正申請承認やシフト公開などに絞る",
      "変更前と変更後を見比べる",
      "確認後はリセットで絞り込みを戻す",
    ],
    checks: [
      "探している日付の範囲に入っている",
      "行為者と対象者を取り違えていない",
      "変更前・変更後の差分を確認した",
    ],
    cautions: [
      "監査ログは削除できません。トラブル時に確認するための記録です。",
      "個人情報を含むため、必要な人だけが見ます。",
    ],
    trouble: [
      "履歴が多い時は、期間とアクションを絞ります。",
      "目的の記録が出ない時は、行為者フィルタを一度すべてに戻します。",
    ],
  },
];

export function getAllowedHelpTopics(role: AdminHelpRole): AdminHelpTopic[] {
  return ADMIN_HELP_TOPICS.filter((topic) => topic.roles.includes(role));
}

export function getHelpTopicById(id: string | undefined): AdminHelpTopic | undefined {
  return ADMIN_HELP_TOPICS.find((topic) => topic.id === id);
}

function roleFromMe(me: Me | undefined): AdminHelpRole {
  return me?.role === "admin" ? "admin" : "manager";
}

function roleLabel(role: AdminHelpRole): string {
  return role === "admin" ? "管理者" : "店長";
}

export function AdminHelpPage() {
  const { topic: topicId } = useParams();
  const navigate = useNavigate();

  const meQuery = useQuery<Me, ApiError>({
    queryKey: ["auth", "me"],
    queryFn: ({ signal }) => fetchMe(signal),
    retry: false,
    staleTime: 30_000,
  });

  if (meQuery.isLoading) {
    return (
      <Stack gap={5} className="wa-help">
        <header className="wa-help__header">
          <Heading level={1} eyebrow="HELP">
            操作ヘルプ
          </Heading>
        </header>
        <WashiCard padding="lg">
          <p className="wa-help__bodyText">ヘルプを読み込んでいます。</p>
        </WashiCard>
      </Stack>
    );
  }

  const role = roleFromMe(meQuery.data);
  const allowedTopics = getAllowedHelpTopics(role);
  const selectedTopic = getHelpTopicById(topicId);
  const canReadSelected = selectedTopic ? selectedTopic.roles.includes(role) : false;

  if (topicId && (!selectedTopic || !canReadSelected)) {
    return (
      <Stack gap={5} className="wa-help">
        <header className="wa-help__header">
          <Heading level={1} eyebrow="HELP">
            ヘルプ
          </Heading>
          <p className="wa-help__lede">このヘルプは、現在の権限では表示できません。</p>
        </header>
        <WashiCard padding="lg">
          <Stack gap={4}>
            <p className="wa-help__bodyText">
              {roleLabel(role)}
              アカウントで使えるヘルプだけを表示しています。必要な場合は管理者に確認してください。
            </p>
            <div>
              <SumiButton variant="secondary" size="sm" onClick={() => navigate(-1)}>
                前の画面へ戻る
              </SumiButton>
              <Link className="wa-help__inlineLink" to="/admin/help">
                ヘルプ一覧へ
              </Link>
            </div>
          </Stack>
        </WashiCard>
      </Stack>
    );
  }

  if (!selectedTopic) {
    return (
      <Stack gap={6} className="wa-help">
        <header className="wa-help__header">
          <div>
            <Heading level={1} eyebrow="HELP">
              操作ヘルプ
            </Heading>
            <p className="wa-help__lede">
              今いる画面で何を見ればよいか、どの順番で操作すればよいかをページごとにまとめています。
            </p>
          </div>
          <StatePill tone="neutral" label={`${roleLabel(role)}向け`} />
        </header>

        <section className="wa-help__overview" aria-label="ヘルプ一覧">
          {allowedTopics.map((topic) => (
            <Link key={topic.id} to={`/admin/help/${topic.id}`} className="wa-help__cardLink">
              <WashiCard padding="lg" className="wa-help__card">
                <span className="wa-help__code">{topic.pageCode}</span>
                <h2 className="wa-help__cardTitle">{topic.title}</h2>
                <p className="wa-help__cardText">{topic.purpose}</p>
                <span className="wa-help__cardAction">このヘルプを開く</span>
              </WashiCard>
            </Link>
          ))}
        </section>
      </Stack>
    );
  }

  return (
    <Stack gap={6} className="wa-help">
      <header className="wa-help__header">
        <div>
          <Heading level={1} eyebrow={`${selectedTopic.pageCode} ／ HELP`}>
            {selectedTopic.title}のヘルプ
          </Heading>
          <p className="wa-help__lede">{selectedTopic.purpose}</p>
        </div>
        <Link className="wa-help__screenLink" to={selectedTopic.route}>
          画面を開く
        </Link>
      </header>

      <WashiCard highlight padding="lg" className="wa-help__first">
        <span className="wa-help__sectionEyebrow">最初にすること</span>
        <p className="wa-help__firstText">{selectedTopic.firstAction}</p>
      </WashiCard>

      <div className="wa-help__columns">
        <HelpSection title="操作の順番" items={selectedTopic.steps} ordered />
        <HelpSection title="確認すること" items={selectedTopic.checks} />
        <HelpSection title="気をつけること" items={selectedTopic.cautions} tone="caution" />
        <HelpSection title="困ったとき" items={selectedTopic.trouble} tone="trouble" />
      </div>

      <nav className="wa-help__pager" aria-label="ヘルプ内移動">
        <Link className="wa-help__inlineLink" to="/admin/help">
          ヘルプ一覧へ
        </Link>
        <Link className="wa-help__inlineLink" to={selectedTopic.route}>
          {selectedTopic.title}画面へ戻る
        </Link>
      </nav>
    </Stack>
  );
}

function HelpSection({
  title,
  items,
  ordered = false,
  tone = "default",
}: {
  title: string;
  items: string[];
  ordered?: boolean;
  tone?: "default" | "caution" | "trouble";
}) {
  const ListTag = ordered ? "ol" : "ul";

  return (
    <WashiCard padding="md" className={`wa-help__section wa-help__section--${tone}`}>
      <h2 className="wa-help__sectionTitle">{title}</h2>
      <ListTag className="wa-help__list">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ListTag>
    </WashiCard>
  );
}
