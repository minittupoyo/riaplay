import { createEffect, createResource, createSignal, on, onCleanup, onMount, For, Show, Switch, Match } from "solid-js";
import { IconDisc, IconMicrophone2, IconMusic, IconLoader2, IconSearch, IconPlaylist, IconPlus, IconHeart, IconMenu2, IconSettings, IconRefresh } from "@tabler/icons-solidjs";
import type { Album, Artist, Playlist, SubsonicClient } from "../api";
import AlbumDetail from "./AlbumDetail";
import ArtistDetail from "./ArtistDetail";
import PlaylistDetail from "./PlaylistDetail";
import QueuePanel from "./QueuePanel";
import LyricsPanel from "./LyricsPanel";
import NowPlaying from "./NowPlaying";
import Search from "./Search";
import PlayerBar from "./PlayerBar";
import Favorites from "./Favorites";
import PlaylistList from "./PlaylistList";
import Settings from "./Settings";
import { loadFavorites } from "../favorites";
import AlbumCard, { Cover } from "./AlbumCard";
import { current } from "../player";
import { animate, createPresence, enter, stagger } from "../motion";
import { firstShow, resetFirstShow } from "../firstShow";
import { playlistVersion, libraryVersion, reloadLibrary, refreshed, queueOpen, lyricsOpen, bp, openCreateDialog, nowPlayingOpen } from "../store";
import { settings } from "../settings";
import { openContextMenu } from "../contextMenu";
import CreatePlaylistDialog from "./CreatePlaylistDialog";
import ServerSwitcher from "./ServerSwitcher";

type Tab = "albums" | "artists" | "favorites" | "playlists" | "search" | "settings";
type View = { t: "album" | "artist" | "playlist"; id: string };

export default function Library(props: { client: SubsonicClient }) {
  const [tab, setTab] = createSignal<Tab>("albums");
  const [query, setQuery] = createSignal("");
  const [stack, setStack] = createSignal<View[]>([]);
  const view = () => stack()[stack().length - 1];

  // ---- スクロール位置の保存と復元 ----
  // 詳細ページへ進むと一覧は破棄されるため、各階層のスクロール位置を覚えておき、「戻る」で復元する
  let mainEl!: HTMLElement;
  const scrollStack: number[] = []; // stack と同じ長さ。stack[i] を開く直前の、1 つ下の階層のスクロール位置
  let restoreRaf = 0;
  /** 戻り先の内容が（再取得などで）十分な高さになるまで、フレームごとに試して復元する */
  const restoreScroll = (y: number) => {
    cancelAnimationFrame(restoreRaf);
    let tries = 0;
    const step = () => {
      mainEl.scrollTop = y;
      const enough = mainEl.scrollHeight - mainEl.clientHeight >= y; // これ以上は動けない=高さが足りない
      if ((Math.abs(mainEl.scrollTop - y) < 1 && enough) || ++tries > 90) return;
      restoreRaf = requestAnimationFrame(step);
    };
    restoreRaf = requestAnimationFrame(step);
  };

  const push = (v: View) => {
    scrollStack.push(mainEl.scrollTop);
    setStack((s) => [...s, v]);
    cancelAnimationFrame(restoreRaf);
    mainEl.scrollTop = 0; // 新しいページは先頭から
  };
  const pop = () => {
    const y = scrollStack.pop() ?? 0;
    setStack((s) => s.slice(0, -1));
    mainEl.scrollTop = y; // 戻り先がキャッシュ済みなら、描画前にこの時点で位置が合う（先頭が一瞬見えるのを防ぐ）
    restoreScroll(y); // 再取得が必要なページは、高さが足りるまで再試行する
  };
  const switchTab = (t: Tab) => {
    scrollStack.length = 0;
    setStack([]);
    setTab(t);
    setDrawer(false);
    cancelAnimationFrame(restoreRaf);
    mainEl.scrollTop = 0;
  };
  const openPlaylist = (id: string) => {
    const base = scrollStack[0] ?? mainEl.scrollTop; // 戻ったら元のページの位置へ
    scrollStack.length = 0;
    scrollStack.push(base);
    setStack([{ t: "playlist", id }]);
    setDrawer(false);
    cancelAnimationFrame(restoreRaf);
    mainEl.scrollTop = 0;
  };

  // 狭い画面ではサイドバーをドロワーとして重ねて表示する
  const [drawer, setDrawer] = createSignal(false);
  const [drawerPresent, drawerRef] = createPresence(
    drawer,
    { keyframes: [{ opacity: 0 }, { opacity: 1 }], options: { duration: 200 } },
    { keyframes: [{ opacity: 1 }, { opacity: 0 }], options: { duration: 180 } },
  );
  const narrow = () => bp() === "narrow";
  const activePlaylist = () => (view()?.t === "playlist" ? view()!.id : null);

  onMount(() => {
    resetFirstShow(); // サーバーを切り替えて作り直されたときは、また最初だけアニメーションする
    loadFavorites(props.client).catch(() => {});
  });
  const [albums] = createResource<Album[], number>(libraryVersion, (_, { value }) => refreshed(value, () => props.client.getAlbums(0, 80)));
  const [artists] = createResource<Artist[], readonly [boolean, number]>(
    () => [tab() === "artists", libraryVersion()] as const,
    ([on], { value }) => (on ? refreshed(value, () => props.client.getArtists()) : []),
  );
  const [playlists] = createResource<Playlist[], readonly [number, number]>(
    () => [playlistVersion(), libraryVersion()] as const,
    (_, { value }) => refreshed(value, () => props.client.getPlaylists()),
  );
  // 再読み込み中（手動・定期のどちらも）。ボタンの回転表示に使う
  const reloading = () => albums.loading || artists.loading || playlists.loading;
  // 再読み込み時は、お気に入りも取得し直す（初回は onMount で取得済み）
  createEffect(on(libraryVersion, () => loadFavorites(props.client).catch(() => {}), { defer: true }));
  // 定期実行
  createEffect(() => {
    const m = settings().libraryRefreshMinutes;
    if (m <= 0) return;
    const t = setInterval(reloadLibrary, m * 60_000);
    onCleanup(() => clearInterval(t));
  });

  // キューパネル: 幅を開閉アニメーションしつつ、退場完了までアンマウントしない
  const [queuePresent, queueRef] = createPresence(
    queueOpen,
    { keyframes: [{ width: "0px", opacity: 0 }, { width: "20rem", opacity: 1 }], options: { duration: 300 } },
    { keyframes: [{ width: "20rem", opacity: 1 }, { width: "0px", opacity: 0 }], options: { duration: 260 } },
  );

  const [lyricsPresent, lyricsRef] = createPresence(
    lyricsOpen,
    { keyframes: [{ width: "0px", opacity: 0 }, { width: "20rem", opacity: 1 }], options: { duration: 300 } },
    { keyframes: [{ width: "20rem", opacity: 1 }, { width: "0px", opacity: 0 }], options: { duration: 260 } },
  );

  // 再生中画面: ウィンドウ全体に重ねる
  const [npPresent, npRef] = createPresence(
    nowPlayingOpen,
    { keyframes: [{ opacity: 0, transform: "translateY(32px)" }, { opacity: 1, transform: "none" }], options: { duration: 340 } },
    { keyframes: [{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateY(32px)" }], options: { duration: 260 } },
  );

  const item = (active: boolean, compact = false) =>
    `flex items-center w-full rounded-lg text-left text-[15px] ${compact ? "justify-center py-2" : "gap-3 px-3 py-1.5"} ${active ? "bg-white/10 text-white" : "text-white/80 hover:bg-white/5"}`;
  const isTab = (t: Tab) => tab() === t && !activePlaylist();
  const icon = (on: boolean) => (on ? "text-accent" : "text-accent/90");
  const grid = "card-grid";

  /** サイドバーの中身。compact=true はアイコンのみ（中サイズ画面のレール） */
  const sidebar = (compact: boolean) => (
    <>
      <ServerSwitcher compact={compact} />
      <button class={`${item(isTab("search"), compact)} mb-4 bg-white/10`} title="検索" onClick={() => switchTab("search")}>
        <IconSearch size={18} class="text-white/50" />
        <Show when={!compact}><span class="text-white/50">検索</span></Show>
      </button>
      <Show when={!compact}>
        <div class="flex items-center justify-between px-3 pb-1 text-xs font-semibold text-white/40">
          <span>ライブラリ</span>
          <button class="p-0.5 rounded hover:text-white" title="ライブラリを再読み込み" onClick={reloadLibrary}>
            <IconRefresh size={15} class={reloading() ? "animate-spin" : ""} />
          </button>
        </div>
      </Show>
      <nav class="space-y-0.5">
        <button class={item(isTab("albums"), compact)} title="アルバム" onClick={() => switchTab("albums")}><IconDisc size={20} class={icon(isTab("albums"))} /><Show when={!compact}>アルバム</Show></button>
        <button class={item(isTab("artists"), compact)} title="アーティスト" onClick={() => switchTab("artists")}><IconMicrophone2 size={20} class={icon(isTab("artists"))} /><Show when={!compact}>アーティスト</Show></button>
        <button class={item(isTab("playlists"), compact)} title="プレイリスト" onClick={() => switchTab("playlists")}><IconPlaylist size={20} class={icon(isTab("playlists"))} /><Show when={!compact}>プレイリスト</Show></button>
        <button class={item(isTab("favorites"), compact)} title="お気に入り" onClick={() => switchTab("favorites")}><IconHeart size={20} class={icon(isTab("favorites"))} /><Show when={!compact}>お気に入り</Show></button>
        <Show when={compact}>
          <button class={item(false, true)} title="ライブラリを再読み込み" onClick={reloadLibrary}><IconRefresh size={20} class={`text-white/50 ${reloading() ? "animate-spin" : ""}`} /></button>
        </Show>
      </nav>

      <Show
        when={!compact}
        fallback={<div class="my-3 border-t border-white/10" />}
      >
        <div class="flex items-center justify-between px-3 pt-5 pb-1 text-xs font-semibold text-white/40">
          <span>マイプレイリスト</span>
          <button class="p-0.5 rounded hover:text-white" title="新規プレイリスト" onClick={() => openCreateDialog()}><IconPlus size={16} /></button>
        </div>
      </Show>
      <div class="flex-1 min-h-0 overflow-y-scroll space-y-0.5">
        <For each={playlists()}>
          {(p) => (
            <button ref={(e) => enter(e, { y: 6, duration: 220 })} class={item(activePlaylist() === p.id, compact)} title={p.name} onClick={() => openPlaylist(p.id)}
              onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); openContextMenu({ x: e.clientX, y: e.clientY, client: props.client, songs: async () => (await props.client.getPlaylist(p.id)).songs }); }}>
              <IconPlaylist size={20} class={icon(activePlaylist() === p.id)} />
              <Show when={!compact}><span class="truncate">{p.name}</span></Show>
            </button>
          )}
        </For>
        <Show when={!compact && !playlists.loading && !playlists()?.length}>
          <div class="px-3 py-1 text-xs text-white/30">なし</div>
        </Show>
      </div>

      <button class={`${item(isTab("settings"), compact)} mt-2`} title="設定" onClick={() => switchTab("settings")}>
        <IconSettings size={20} class={icon(isTab("settings"))} />
        <Show when={!compact}>設定</Show>
      </button>
    </>
  );

  return (
    <div ref={(e) => enter(e, { y: 0, scale: 0.99, duration: 400 })} class="h-full flex flex-col relative">
      {/* 狭い画面: 上部バー + ドロワー */}
      <Show when={narrow()}>
        <header class="h-12 shrink-0 flex items-center gap-3 px-3 border-b border-white/5">
          <button class="p-1.5 -ml-1 rounded-lg text-white/80 hover:bg-white/10" title="メニュー" onClick={() => setDrawer(true)}><IconMenu2 size={22} /></button>
          <span class="flex items-center gap-2 font-semibold"><IconMusic size={20} class="text-accent" />riaplay</span>
        </header>
      </Show>
      <div class="flex-1 min-h-0 flex relative">
        <Switch>
          <Match when={bp() === "wide"}>
            <aside class="w-60 shrink-0 bg-white/[0.04] border-r border-white/5 p-3 flex flex-col">{sidebar(false)}</aside>
          </Match>
          <Match when={bp() === "medium"}>
            <aside class="w-16 shrink-0 bg-white/[0.04] border-r border-white/5 p-2 flex flex-col">{sidebar(true)}</aside>
          </Match>
        </Switch>

        <main ref={mainEl} class={`@container flex-1 min-w-0 overflow-y-scroll px-4 md:px-8 pt-6 md:pt-8 ${current() ? "pb-32" : "pb-8"}`}>
          <Show
            when={view()}
            fallback={
              <Switch>
                <Match when={tab() === "search"}>
                  <Search client={props.client} query={query()} setQuery={setQuery}
                    onAlbum={(id) => push({ t: "album", id })} onArtist={(id) => push({ t: "artist", id })} />
                </Match>
                <Match when={tab() === "settings"}>
                  <Settings />
                </Match>
                <Match when={tab() === "playlists"}>
                  <PlaylistList client={props.client} playlists={playlists()} loading={playlists.loading}
                    onOpen={(id) => push({ t: "playlist", id })} />
                </Match>
                <Match when={tab() === "favorites"}>
                  <Favorites client={props.client} onAlbum={(id) => push({ t: "album", id })} onArtist={(id) => push({ t: "artist", id })} />
                </Match>
                <Match when={tab() === "albums"}>
                  <h1 class="text-3xl font-bold mb-6" ref={(e) => { if (firstShow("albums:title")) enter(e, { y: 10 }); }}>アルバム</h1>
                  <Status res={albums} />
                  <div class={grid}>
                    <For each={albums()}>
                      {(a, i) => {
                        const anim = firstShow("albums:cards");
                        return <AlbumCard i={i()} animate={anim} client={props.client} album={a} onOpen={(id) => push({ t: "album", id })} />;
                      }}
                    </For>
                  </div>
                </Match>
                <Match when={tab() === "artists"}>
                  <h1 class="text-3xl font-bold mb-6" ref={(e) => { if (firstShow("artists:title")) enter(e, { y: 10 }); }}>アーティスト</h1>
                  <Status res={artists} />
                  <div class={grid}>
                    <For each={artists()}>
                      {(a, i) => (
                        <div ref={(e) => { if (firstShow("artists:cards")) enter(e, { delay: stagger(i()), y: 14 }); }} class="cursor-pointer" onClick={() => push({ t: "artist", id: a.id })}>
                          <Cover src={props.client.coverUrl(a.coverArt)} round />
                          <div class="mt-2 text-[13px] font-medium truncate text-center" title={a.name}>{a.name}</div>
                          <div class="text-[13px] text-white/50 text-center">{a.albumCount} アルバム</div>
                        </div>
                      )}
                    </For>
                  </div>
                </Match>
              </Switch>
            }
          >
            {(v) => (
              <Switch>
                <Match when={v().t === "album"}>
                  <AlbumDetail client={props.client} id={v().id} onBack={pop} />
                </Match>
                <Match when={v().t === "artist"}>
                  <ArtistDetail client={props.client} id={v().id} onBack={pop} onAlbum={(id) => push({ t: "album", id })} />
                </Match>
                <Match when={v().t === "playlist"}>
                  <PlaylistDetail client={props.client} id={v().id} onBack={pop} />
                </Match>
              </Switch>
            )}
          </Show>
        </main>

        <Show when={queuePresent()}><QueuePanel ref={queueRef} client={props.client} overlay={narrow()} /></Show>
        <Show when={lyricsPresent()}><LyricsPanel ref={lyricsRef} overlay={narrow()} /></Show>
      </div>
      <PlayerBar client={props.client} />
      <Show when={npPresent()}><NowPlaying ref={npRef} client={props.client} /></Show>
      <CreatePlaylistDialog client={props.client} onCreated={(p) => p && openPlaylist(p.id)} />

      <Show when={narrow() && drawerPresent()}>
        <div ref={drawerRef} class="fixed inset-0 z-40">
          <div class="absolute inset-0 bg-black/50" onClick={() => setDrawer(false)} />
          <aside
            ref={(e) => queueMicrotask(() => animate(e, [{ transform: "translateX(-100%)" }, { transform: "none" }], { duration: 280 }))}
            class="absolute left-0 top-0 bottom-0 w-64 max-w-[85vw] bg-surface border-r border-white/10 shadow-2xl shadow-black/60 p-3 flex flex-col"
          >
            {sidebar(false)}
          </aside>
        </div>
      </Show>
    </div>
  );
}

function Status(props: { res: { loading: boolean; error?: unknown } & (() => unknown) }) {
  return (
    <>
      <Show when={props.res.loading && props.res() === undefined}>
        <div class="flex items-center gap-2 text-white/50"><IconLoader2 size={18} class="animate-spin" />読み込み中…</div>
      </Show>
      <Show when={props.res.error}>
        <p class="text-accent">読み込みに失敗しました: {String(props.res.error)}</p>
      </Show>
    </>
  );
}
