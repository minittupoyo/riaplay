import { computed } from "vue";
import { signal } from "./reactive";
import type { Song } from "./api";

// 画面幅（ウィンドウ幅）に応じたレイアウト区分: wide ≥1024 / medium ≥768 / narrow <768
export type Breakpoint = "wide" | "medium" | "narrow";
const [winWidth, setWinWidth] = signal(window.innerWidth);
window.addEventListener("resize", () => setWinWidth(window.innerWidth));
const bpMemo = computed<Breakpoint>(() => (winWidth() >= 1024 ? "wide" : winWidth() >= 768 ? "medium" : "narrow"));
export const bp = () => bpMemo.value;

// プレイリスト一覧の再取得トリガー
const [playlistVersion, setPlaylistVersion] = signal(0);
export { playlistVersion };
export const bumpPlaylists = () => setPlaylistVersion((v) => v + 1);

// ライブラリの再読み込み（手動ボタン・定期実行）。値が変わるたびに、一覧などの取得し直しが走る
const [libraryVersion, setLibraryVersion] = signal(0);
export { libraryVersion };
export const reloadLibrary = () => setLibraryVersion((v) => v + 1);

/**
 * 再読み込み用の取得。内容が前回と同じなら前回の値をそのまま返し、画面を作り直さない
 * （カバー画像のちらつきや、スクロール位置のずれを避ける）。
 * 取得し直しに失敗したときは、前回の値を保つ。初回の失敗はそのまま投げる
 */
export async function refreshed<T>(old: T | undefined, fetch: () => Promise<T>): Promise<T> {
  try {
    const next = await fetch();
    return old !== undefined && JSON.stringify(old) === JSON.stringify(next) ? old : next;
  } catch (e) {
    if (old !== undefined) return old;
    throw e;
  }
}

// 右側パネル（キュー / 歌詞）。どちらか一方だけ開く
export const [queueOpen, setQueueOpen] = signal(false);
export const [lyricsOpen, setLyricsOpen] = signal(false);
export const panelOpen = () => queueOpen() || lyricsOpen();
export const toggleQueue = () => { const o = !queueOpen(); setQueueOpen(o); if (o) setLyricsOpen(false); };
export const toggleLyrics = () => { const o = !lyricsOpen(); setLyricsOpen(o); if (o) setQueueOpen(false); };

// ウィンドウいっぱいの再生中画面
export const [nowPlayingOpen, setNowPlayingOpen] = signal(false);

// プレイリスト作成ダイアログ。songs を渡すと、作成と同時にその曲を追加する
export interface CreatePlaylistRequest { songs?: () => Song[] | Promise<Song[]> }
export const [createDialog, setCreateDialog] = signal<CreatePlaylistRequest | null>(null);
export const openCreateDialog = (songs?: CreatePlaylistRequest["songs"]) => setCreateDialog({ songs });
export const closeCreateDialog = () => setCreateDialog(null);
