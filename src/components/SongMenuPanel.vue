<script setup lang="ts">
import { onMounted, ref, shallowRef } from "vue";
import { IconDownload, IconPlayerPlayFilled, IconPlayerTrackNext, IconListDetails, IconPlaylistAdd, IconChevronRight, IconTrash, IconPlus } from "@tabler/icons-vue";
import type { Playlist, Song, SubsonicClient } from "../api";
import { enqueue, playNext, playQueue } from "../player";
import { bumpPlaylists, openCreateDialog } from "../store";
import { downloadsSupported, enqueueDownloads } from "../downloads";
import { toast } from "../toast";

/** メニューの中身（「…」ボタンのメニューと右クリックメニューで共通） */
const props = defineProps<{
  client: SubsonicClient;
  songs: () => Song[] | Promise<Song[]>;
  removeAction?: { label: string; run: () => void };
  close: () => void;
  play?: boolean;
}>();

const sub = ref(false);
const pls = shallowRef<Playlist[]>([]);
onMounted(async () => { pls.value = await props.client.getPlaylists().catch(() => []); });

const act = (fn: (songs: Song[]) => void | Promise<void>) => {
  Promise.resolve(props.songs()).then(fn).finally(props.close);
};
const download = (songs: Song[]) => {
  const r = enqueueDownloads(props.client, songs);
  toast(r.added ? `${r.added} 曲のダウンロードを始めました` : "すべてダウンロード済みです");
};
const addTo = (id: string) => act(async (songs) => {
  await props.client.updatePlaylist(id, { add: songs.map((s) => s.id) });
  bumpPlaylists();
});
const createWith = () => { props.close(); openCreateDialog(props.songs); };
const item = "flex items-center gap-2.5 w-full rounded-md px-3 py-1.5 text-left text-sm hover:bg-white/10";
</script>

<template>
  <button v-if="play" :class="item" @click.stop="act((s) => { if (s.length) playQueue(client, s, 0); })">
    <IconPlayerPlayFilled :size="16" class="text-accent" />再生
  </button>
  <button :class="item" @click.stop="act((s) => playNext(client, s))">
    <IconPlayerTrackNext :size="16" class="text-accent" />次に再生
  </button>
  <button :class="item" @click.stop="act((s) => enqueue(client, s))">
    <IconListDetails :size="16" class="text-accent" />キューに追加
  </button>
  <button v-if="downloadsSupported" :class="item" @click.stop="act(download)">
    <IconDownload :size="16" class="text-accent" />ダウンロード
  </button>
  <button :class="item" @click.stop="sub = !sub">
    <IconPlaylistAdd :size="16" class="text-accent" />プレイリストに追加
    <IconChevronRight :size="14" class="ml-auto text-white/40" />
  </button>
  <div v-if="sub" class="border-t border-white/10 mt-1 pt-1">
    <button :class="`${item} pl-6 text-accent`" @click.stop="createWith">
      <IconPlus :size="14" />新規プレイリスト…
    </button>
    <div class="max-h-44 overflow-y-auto">
      <button v-for="p in pls" :key="p.id" :class="`${item} pl-6`" @click.stop="addTo(p.id)">
        <span class="truncate">{{ p.name }}</span>
      </button>
    </div>
  </div>
  <button v-if="removeAction" :class="`${item} border-t border-white/10 mt-1 rounded-t-none text-accent`" @click.stop="act(removeAction.run)">
    <IconTrash :size="16" />{{ removeAction.label }}
  </button>
</template>
