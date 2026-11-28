<script setup lang="ts">
import { IconDisc, IconMicrophone2, IconSearch, IconPlaylist, IconPlus, IconHeart, IconSettings, IconRefresh, IconDownload, IconPlugConnected } from "@tabler/icons-vue";
import type { Playlist, SubsonicClient } from "../api";
import { vEnter } from "../motion";
import { reloadLibrary, openCreateDialog } from "../store";
import { openContextMenu } from "../contextMenu";
import { downloadsSupported } from "../downloads";
import ServerSwitcher from "./ServerSwitcher.vue";
import type { Tab } from "./libraryTypes";

/** サイドバーの中身。compact=true はアイコンのみ（中サイズ画面のレール） */
const props = defineProps<{
  client: SubsonicClient;
  compact: boolean;
  offline?: boolean;
  tab: Tab;
  activePlaylist: string | null;
  playlists: Playlist[] | undefined;
  playlistsLoading: boolean;
  reloading: boolean;
}>();
const emit = defineEmits<{ tab: [t: Tab]; playlist: [id: string]; reconnect: [] }>();

const item = (active: boolean, compact = false) =>
  `flex items-center w-full rounded-lg text-left text-[15px] ${compact ? "justify-center py-2" : "gap-3 px-3 py-1.5"} ${active ? "bg-white/10 text-white" : "text-white/80 hover:bg-white/5"}`;
const isTab = (t: Tab) => props.tab === t && !props.activePlaylist;
const icon = (on: boolean) => (on ? "text-accent" : "text-accent/90");

const playlistMenu = (e: MouseEvent, p: Playlist) =>
  openContextMenu({ x: e.clientX, y: e.clientY, client: props.client, songs: async () => (await props.client.getPlaylist(p.id)).songs });
</script>

<template>
  <ServerSwitcher :compact="compact" />
  <button v-if="offline" :class="`${item(false, compact)} mb-3 bg-white/10`" title="オフラインです。押すと接続をやり直します" @click="emit('reconnect')">
    <IconPlugConnected :size="18" class="text-accent" />
    <span v-if="!compact" class="text-white/70">オフライン · 再接続</span>
  </button>
  <template v-else>
    <button :class="`${item(isTab('search'), compact)} mb-4 bg-white/10`" title="検索" @click="emit('tab', 'search')">
      <IconSearch :size="18" class="text-white/50" />
      <span v-if="!compact" class="text-white/50">検索</span>
    </button>
    <div v-if="!compact" class="flex items-center justify-between px-3 pb-1 text-xs font-semibold text-white/40">
      <span>ライブラリ</span>
      <button class="p-0.5 rounded hover:text-white" title="ライブラリを再読み込み" @click="reloadLibrary">
        <IconRefresh :size="15" :class="reloading ? 'animate-spin' : ''" />
      </button>
    </div>
  </template>
  <nav class="space-y-0.5">
    <template v-if="!offline">
      <button :class="item(isTab('albums'), compact)" title="アルバム" @click="emit('tab', 'albums')"><IconDisc :size="20" :class="icon(isTab('albums'))" /><template v-if="!compact">アルバム</template></button>
      <button :class="item(isTab('artists'), compact)" title="アーティスト" @click="emit('tab', 'artists')"><IconMicrophone2 :size="20" :class="icon(isTab('artists'))" /><template v-if="!compact">アーティスト</template></button>
      <button :class="item(isTab('playlists'), compact)" title="プレイリスト" @click="emit('tab', 'playlists')"><IconPlaylist :size="20" :class="icon(isTab('playlists'))" /><template v-if="!compact">プレイリスト</template></button>
      <button :class="item(isTab('favorites'), compact)" title="お気に入り" @click="emit('tab', 'favorites')"><IconHeart :size="20" :class="icon(isTab('favorites'))" /><template v-if="!compact">お気に入り</template></button>
    </template>
    <button v-if="downloadsSupported" :class="item(isTab('downloads'), compact)" title="ダウンロード" @click="emit('tab', 'downloads')"><IconDownload :size="20" :class="icon(isTab('downloads'))" /><template v-if="!compact">ダウンロード</template></button>
    <button v-if="compact && !offline" :class="item(false, true)" title="ライブラリを再読み込み" @click="reloadLibrary"><IconRefresh :size="20" :class="`text-white/50 ${reloading ? 'animate-spin' : ''}`" /></button>
  </nav>

  <div v-if="offline" class="flex-1" />
  <template v-else>
    <div v-if="!compact" class="flex items-center justify-between px-3 pt-5 pb-1 text-xs font-semibold text-white/40">
      <span>マイプレイリスト</span>
      <button class="p-0.5 rounded hover:text-white" title="新規プレイリスト" @click="openCreateDialog()"><IconPlus :size="16" /></button>
    </div>
    <div v-else class="my-3 border-t border-white/10" />
    <div class="flex-1 min-h-0 overflow-y-scroll space-y-0.5">
      <button
        v-for="p in playlists"
        :key="p.id"
        v-enter="{ y: 6, duration: 220 }"
        :class="item(activePlaylist === p.id, compact)"
        :title="p.name"
        @click="emit('playlist', p.id)"
        @contextmenu.prevent.stop="playlistMenu($event, p)"
      >
        <IconPlaylist :size="20" :class="icon(activePlaylist === p.id)" />
        <span v-if="!compact" class="truncate">{{ p.name }}</span>
      </button>
      <div v-if="!compact && !playlistsLoading && !playlists?.length" class="px-3 py-1 text-xs text-white/30">なし</div>
    </div>
  </template>

  <button :class="`${item(isTab('settings'), compact)} mt-2`" title="設定" @click="emit('tab', 'settings')">
    <IconSettings :size="20" :class="icon(isTab('settings'))" />
    <template v-if="!compact">設定</template>
  </button>
</template>
