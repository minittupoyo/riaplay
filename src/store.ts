import { createMemo, createRoot, createSignal } from "solid-js";
import type { Song } from "./api";

// 画面幅（ウィンドウ幅）に応じたレイアウト区分: wide ≥1024 / medium ≥768 / narrow <768
export type Breakpoint = "wide" | "medium" | "narrow";
const [winWidth, setWinWidth] = createSignal(window.innerWidth);
window.addEventListener("resize", () => setWinWidth(window.innerWidth));
export const bp = createRoot(() => createMemo<Breakpoint>(() => (winWidth() >= 1024 ? "wide" : winWidth() >= 768 ? "medium" : "narrow")));

// プレイリスト一覧の再取得トリガー
const [playlistVersion, setPlaylistVersion] = createSignal(0);
export { playlistVersion };
export const bumpPlaylists = () => setPlaylistVersion((v) => v + 1);

// 右側パネル（キュー / 歌詞）。どちらか一方だけ開く
export const [queueOpen, setQueueOpen] = createSignal(false);
export const [lyricsOpen, setLyricsOpen] = createSignal(false);
export const panelOpen = createRoot(() => createMemo(() => queueOpen() || lyricsOpen()));
export const toggleQueue = () => { const o = !queueOpen(); setQueueOpen(o); if (o) setLyricsOpen(false); };
export const toggleLyrics = () => { const o = !lyricsOpen(); setLyricsOpen(o); if (o) setQueueOpen(false); };

// プレイリスト作成ダイアログ。songs を渡すと、作成と同時にその曲を追加する
export interface CreatePlaylistRequest { songs?: () => Song[] | Promise<Song[]> }
export const [createDialog, setCreateDialog] = createSignal<CreatePlaylistRequest | null>(null);
export const openCreateDialog = (songs?: CreatePlaylistRequest["songs"]) => setCreateDialog({ songs });
export const closeCreateDialog = () => setCreateDialog(null);
