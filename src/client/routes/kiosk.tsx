/**
 * 打刻フロー K01〜K04 のルート集約。
 *
 * 実装本体は task-5003 で 4 ファイルに分離した:
 * - PunchTop.tsx (K01)
 * - PunchBoard.tsx (K03)
 * - PunchDone.tsx (K04)
 *
 * App.tsx は従来通りこのファイルから旧名でインポートできる。
 */
import { PunchBoard } from "./PunchBoard";
import { PunchDone } from "./PunchDone";
import { PunchTop } from "./PunchTop";

export const KioskTopPage = PunchTop;
export const KioskBoardPage = PunchBoard;
export const KioskDonePage = PunchDone;
