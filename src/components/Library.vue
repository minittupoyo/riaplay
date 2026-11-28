<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { IconMusic, IconMenu2 } from "@tabler/icons-vue";
import type { Album, Artist, Playlist, SubsonicClient } from "../api";
import AlbumDetail from "./AlbumDetail.vue";
import ArtistDetail from "./ArtistDetail.vue";
import PlaylistDetail from "./PlaylistDetail.vue";
import QueuePanel from "./QueuePanel.vue";
import LyricsPanel from "./LyricsPanel.vue";
import NowPlaying from "./NowPlaying.vue";
import Search from "./Search.vue";
import PlayerBar from "./PlayerBar.vue";
import Favorites from "./Favorites.vue";
import PlaylistList from "./PlaylistList.vue";
import Settings from "./Settings.vue";
import Downloads from "./Downloads.vue";
import AlbumCard from "./AlbumCard.vue";
import Cover from "./Cover.vue";
import CreatePlaylistDialog from "./CreatePlaylistDialog.vue";
import Sidebar from "./Sidebar.vue";
import ResourceStatus from "./ResourceStatus.vue";
import type { Tab, View } from "./libraryTypes";
import { loadFavorites } from "../favorites";
import { current } from "../player";
import { stagger, usePresence, vEnter, vSlideIn } from "../motion";
import { firstShow, resetFirstShow } from "../firstShow";
import { playlistVersion, libraryVersion, reloadLibrary, refreshed, queueOpen, lyricsOpen, bp, nowPlayingOpen } from "../store";
import { useResource } from "../reactive";
import { settings } from "../settings";

/** offline: サーバーに繋がらないまま、ダウンロード済みの曲だけを使う。reconnect で接続をやり直す */
const props = defineProps<{ client: SubsonicClient; offline?: boolean }>();
const emit = defineEmits<{ reconnect: [] }>();

const tab = ref<Tab>(props.offline ? "downloads" : "albums");
const query = ref("");
const stack = ref<View[]>([]);
const view = computed(() => stack.value[stack.value.length - 1]);

// ---- スクロール位置の保存と復元 ----
// 詳細ページへ進むと一覧は破棄されるため、各階層のスクロール位置を覚えておき、「戻る」で復元する
const mainEl = ref<HTMLElement | null>(null);
const scrollStack: number[] = []; // stack と同じ長さ。stack[i] を開く直前の、1 つ下の階層のスクロール位置
let restoreRaf = 0;
/** 戻り先の内容が（再取得などで）十分な高さになるまで、フレームごとに試して復元する */
const restoreScroll = (y: number) => {
  cancelAnimationFrame(restoreRaf);
  let tries = 0;
  const step = () => {
    const el = mainEl.value;
    if (!el) return;
    el.scrollTop = y;
    const enough = el.scrollHeight - el.clientHeight >= y; // これ以上は動けない=高さが足りない
    if ((Math.abs(el.scrollTop - y) < 1 && enough) || ++tries > 90) return;
    restoreRaf = requestAnimationFrame(step);
  };
  restoreRaf = requestAnimationFrame(step);
};
/** 画面を切り替えたあと、描画が済んでから（表示前に）スクロール位置を合わせる */
const scrollAfterRender = (y: number, retry = false) => {
  cancelAnimationFrame(restoreRaf);
  void nextTick(() => {
    if (mainEl.value) mainEl.value.scrollTop = y;
    if (retry) restoreScroll(y); // 再取得が必要なページは、高さが足りるまで再試行する
  });
};

const push = (v: View) => {
  scrollStack.push(mainEl.value?.scrollTop ?? 0);
  stack.value = [...stack.value, v];
  scrollAfterRender(0); // 新しいページは先頭から
};
const pop = () => {
  const y = scrollStack.pop() ?? 0;
  stack.value = stack.value.slice(0, -1);
  scrollAfterRender(y, true);
};
const switchTab = (t: Tab) => {
  scrollStack.length = 0;
  stack.value = [];
  tab.value = t;
  drawer.value = false;
  scrollAfterRender(0);
};
const openPlaylist = (id: string) => {
  const base = scrollStack[0] ?? mainEl.value?.scrollTop ?? 0; // 戻ったら元のページの位置へ
  scrollStack.length = 0;
  scrollStack.push(base);
  stack.value = [{ t: "playlist", id }];
  drawer.value = false;
  scrollAfterRender(0);
};

// 狭い画面ではサイドバーをドロワーとして重ねて表示する
const drawer = ref(false);
const { present: drawerPresent, setEl: drawerRef } = usePresence(
  () => drawer.value,
  { keyframes: [{ opacity: 0 }, { opacity: 1 }], options: { duration: 200 } },
  { keyframes: [{ opacity: 1 }, { opacity: 0 }], options: { duration: 180 } },
);
const narrow = computed(() => bp() === "narrow");
const activePlaylist = computed(() => (view.value?.t === "playlist" ? view.value.id : null));

onMounted(() => {
  resetFirstShow(); // サーバーを切り替えて作り直されたときは、また最初だけアニメーションする
  if (!props.offline) loadFavorites(props.client).catch(() => {});
});
const { data: albums, loading: albumsLoading, error: albumsError } = useResource<number, Album[]>(
  () => (props.offline ? false : libraryVersion()),
  (_, { value }) => refreshed(value, () => props.client.getAlbums(0, 80)),
);
const { data: artists, loading: artistsLoading, error: artistsError } = useResource<readonly [boolean, number], Artist[]>(
  () => (props.offline ? false : ([tab.value === "artists", libraryVersion()] as const)),
  ([on], { value }) => (on ? refreshed(value, () => props.client.getArtists()) : []),
);
const { data: playlists, loading: playlistsLoading } = useResource<readonly [number, number], Playlist[]>(
  () => (props.offline ? false : ([playlistVersion(), libraryVersion()] as const)),
  (_, { value }) => refreshed(value, () => props.client.getPlaylists()),
);
// 再読み込み中（手動・定期のどちらも）。ボタンの回転表示に使う
const reloading = computed(() => albumsLoading.value || artistsLoading.value || playlistsLoading.value);
// 再読み込み時は、お気に入りも取得し直す（初回は onMounted で取得済み）
watch(libraryVersion, () => { if (!props.offline) loadFavorites(props.client).catch(() => {}); });
// 定期実行
watch(
  () => (props.offline ? 0 : settings().libraryRefreshMinutes),
  (m, _old, onCleanup) => {
    if (m <= 0) return;
    const t = setInterval(reloadLibrary, m * 60_000);
    onCleanup(() => clearInterval(t));
  },
  { immediate: true },
);

// キューパネル: 幅を開閉アニメーションしつつ、退場完了までアンマウントしない
const { present: queuePresent, setEl: queueRef } = usePresence(
  queueOpen,
  { keyframes: [{ width: "0px", opacity: 0 }, { width: "20rem", opacity: 1 }], options: { duration: 300 } },
  { keyframes: [{ width: "20rem", opacity: 1 }, { width: "0px", opacity: 0 }], options: { duration: 260 } },
);
const { present: lyricsPresent, setEl: lyricsRef } = usePresence(
  lyricsOpen,
  { keyframes: [{ width: "0px", opacity: 0 }, { width: "20rem", opacity: 1 }], options: { duration: 300 } },
  { keyframes: [{ width: "20rem", opacity: 1 }, { width: "0px", opacity: 0 }], options: { duration: 260 } },
);
// 再生中画面: ウィンドウ全体に重ねる
const { present: npPresent, setEl: npRef } = usePresence(
  nowPlayingOpen,
  { keyframes: [{ opacity: 0, transform: "translateY(32px)" }, { opacity: 1, transform: "none" }], options: { duration: 340 } },
  { keyframes: [{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateY(32px)" }], options: { duration: 260 } },
);

const grid = "card-grid";
</script>

<template>
  <div v-enter="{ y: 0, scale: 0.99, duration: 400 }" class="h-full flex flex-col relative">
    <!-- 狭い画面: 上部バー + ドロワー -->
    <header v-if="narrow" class="h-12 shrink-0 flex items-center gap-3 px-3 border-b border-white/5">
      <button class="p-1.5 -ml-1 rounded-lg text-white/80 hover:bg-white/10" title="メニュー" @click="drawer = true"><IconMenu2 :size="22" /></button>
      <span class="flex items-center gap-2 font-semibold"><IconMusic :size="20" class="text-accent" />riaplay</span>
    </header>
    <div class="flex-1 min-h-0 flex relative">
      <aside v-if="bp() === 'wide'" class="w-60 shrink-0 bg-white/[0.04] border-r border-white/5 p-3 flex flex-col">
        <Sidebar
          :client="client" :compact="false" :offline="offline" :tab="tab" :active-playlist="activePlaylist"
          :playlists="playlists" :playlists-loading="playlistsLoading" :reloading="reloading"
          @tab="switchTab" @playlist="openPlaylist" @reconnect="emit('reconnect')"
        />
      </aside>
      <aside v-else-if="bp() === 'medium'" class="w-16 shrink-0 bg-white/[0.04] border-r border-white/5 p-2 flex flex-col">
        <Sidebar
          :client="client" compact :offline="offline" :tab="tab" :active-playlist="activePlaylist"
          :playlists="playlists" :playlists-loading="playlistsLoading" :reloading="reloading"
          @tab="switchTab" @playlist="openPlaylist" @reconnect="emit('reconnect')"
        />
      </aside>

      <main ref="mainEl" :class="`@container flex-1 min-w-0 overflow-y-scroll px-4 md:px-8 pt-6 md:pt-8 ${current() ? 'pb-32' : 'pb-8'}`">
        <template v-if="view">
          <AlbumDetail v-if="view.t === 'album'" :client="client" :id="view.id" @back="pop" />
          <ArtistDetail v-else-if="view.t === 'artist'" :client="client" :id="view.id" @back="pop" @album="push({ t: 'album', id: $event })" />
          <PlaylistDetail v-else-if="view.t === 'playlist'" :client="client" :id="view.id" @back="pop" />
        </template>
        <template v-else>
          <Search
            v-if="tab === 'search'"
            v-model:query="query"
            :client="client"
            @album="push({ t: 'album', id: $event })"
            @artist="push({ t: 'artist', id: $event })"
          />
          <Settings v-else-if="tab === 'settings'" />
          <Downloads v-else-if="tab === 'downloads'" :client="client" />
          <PlaylistList v-else-if="tab === 'playlists'" :client="client" :playlists="playlists" :loading="playlistsLoading" @open="push({ t: 'playlist', id: $event })" />
          <Favorites v-else-if="tab === 'favorites'" :client="client" @album="push({ t: 'album', id: $event })" @artist="push({ t: 'artist', id: $event })" />
          <template v-else-if="tab === 'albums'">
            <h1 v-enter="firstShow('albums:title') ? { y: 10 } : false" class="text-3xl font-bold mb-6">アルバム</h1>
            <ResourceStatus :loading="albumsLoading" :has-data="albums !== undefined" :error="albumsError" />
            <div :class="grid">
              <AlbumCard
                v-for="(a, i) in albums"
                :key="a.id"
                :i="i"
                :animate="firstShow('albums:cards')"
                :client="client"
                :album="a"
                @open="push({ t: 'album', id: $event })"
              />
            </div>
          </template>
          <template v-else-if="tab === 'artists'">
            <h1 v-enter="firstShow('artists:title') ? { y: 10 } : false" class="text-3xl font-bold mb-6">アーティスト</h1>
            <ResourceStatus :loading="artistsLoading" :has-data="artists !== undefined" :error="artistsError" />
            <div :class="grid">
              <div
                v-for="(a, i) in artists"
                :key="a.id"
                v-enter="firstShow('artists:cards') ? { delay: stagger(i), y: 14 } : false"
                class="cursor-pointer"
                @click="push({ t: 'artist', id: a.id })"
              >
                <Cover :src="client.coverUrl(a.coverArt)" round />
                <div class="mt-2 text-[13px] font-medium truncate text-center" :title="a.name">{{ a.name }}</div>
                <div class="text-[13px] text-white/50 text-center">{{ a.albumCount }} アルバム</div>
              </div>
            </div>
          </template>
        </template>
      </main>

      <QueuePanel v-if="queuePresent" :ref="queueRef" :client="client" :overlay="narrow" />
      <LyricsPanel v-if="lyricsPresent" :ref="lyricsRef" :client="client" :overlay="narrow" />
    </div>
    <PlayerBar :client="client" />
    <NowPlaying v-if="npPresent" :ref="npRef" :client="client" />
    <CreatePlaylistDialog :client="client" @created="(p) => p && openPlaylist(p.id)" />

    <div v-if="narrow && drawerPresent" :ref="drawerRef" class="fixed inset-0 z-40">
      <div class="absolute inset-0 bg-black/50" @click="drawer = false" />
      <aside v-slide-in class="absolute left-0 top-0 bottom-0 w-64 max-w-[85vw] bg-surface border-r border-white/10 shadow-2xl shadow-black/60 p-3 flex flex-col">
        <Sidebar
          :client="client" :compact="false" :offline="offline" :tab="tab" :active-playlist="activePlaylist"
          :playlists="playlists" :playlists-loading="playlistsLoading" :reloading="reloading"
          @tab="switchTab" @playlist="openPlaylist" @reconnect="emit('reconnect')"
        />
      </aside>
    </div>
  </div>
</template>
