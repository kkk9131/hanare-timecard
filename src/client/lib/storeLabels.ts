/**
 * 店舗 ID → 表示名のヒューリスティックなマップ。
 *
 * 打刻トップ (K01) は未認証コンテキストで開かれるため、
 * `/api/stores` を直接叩けない。サーバ seed の挿入順 (suzumean→hanare)
 * を踏まえて静的マップで補う。未知 ID は「店舗 N」と表示する。
 */
const FALLBACK_NAMES: Record<number, string> = {
  1: "雀庵 本店",
  2: "雀庵はなれ",
};

export function storeLabel(id: number): string {
  return FALLBACK_NAMES[id] ?? `店舗 ${id}`;
}

export function storeShortLabel(id: number): string {
  const full = storeLabel(id);
  // 「雀庵 本店」→「本店」, 「雀庵はなれ」→「はなれ」
  if (full === "雀庵 本店") return "本店";
  if (full === "雀庵はなれ") return "はなれ";
  return full;
}
