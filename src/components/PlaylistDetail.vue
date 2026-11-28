<script setup lang="ts">
import { computed, ref } from "vue";
import { IconChevronLeft, IconPlayerPlayFilled, IconArrowsShuffle, IconLoader2, IconVolume, IconTrash, IconPlaylist, IconPencil } from "@tabler/icons-vue";
import type { SubsonicClient } from "../api";
import { playQueue, current, playing, toggleShuffle, shuffle } from "../player";
import { bumpPlaylists, playlistVersion } from "../store";
import { fmt } from "../format";
import { useResource } from "../reactive";
import { createReorder, uniqueKeys } from "../reorder";
import { vEnter } from "../motion";
import SongMenu from "./SongMenu.vue";
import Heart from "./Heart.vue";

type PlaylistData = Awaited<ReturnType<SubsonicClient["getPlaylist"]>>;

const props = defineProps<{ client: SubsonicClient; id: string }>();
const emit = defineEmits<{ back: [] }>();

const { data, loading, error, refetch, mutate } = useResource<readonly [string, number], PlaylistData>(
  () => [props.id, playlistVersion()] as const,
  ([id]) => props.client.getPlaylist(id),
);
const keys = computed(() => uniqueKeys(data.value?.songs ?? []));
const confirming = ref(false);

const remove = async () => {
  if (!confirming.value) { confirming.value = true; setTimeout(() => { confirming.value = false; }, 3000); return; }
  await props.client.deletePlaylist(props.id);
  bumpPlaylists();
  emit("back");
};
const editing = ref(false);
const rename = async (name: string) => {
  editing.value = false;
  name = name.trim();
  if (!name || name === data.value?.playlist.name) return;
  await props.client.updatePlaylist(props.id, { name });
  bumpPlaylists();
};
const { bind, indicator, setList } = createReorder(async (from, to) => {
  const d = data.value;
  if (!d) return;
  const songs = [...d.songs];
  const [x] = songs.splice(from, 1);
  songs.splice(to, 0, x);
  mutate({ ...d, songs }); // 先に画面へ反映
  try {
    await props.client.setPlaylistSongs(props.id, songs.map((s) => s.id));
  } finally {
    void refetch();
  }
});
const removeSong = async (index: number) => {
  await props.client.updatePlaylist(props.id, { removeIndexes: [index] });
  bumpPlaylists();
  void refetch();
};
const shufflePlay = () => {
  const songs = data.value!.songs;
  if (!shuffle()) toggleShuffle();
  playQueue(props.client, songs, Math.floor(Math.random() * songs.length));
};
</script>

<template>
  <div v-enter="{ y: 10 }">
    <button class="flex items-center gap-0.5 text-accent mb-5 -ml-1" @click="emit('back')">
      <IconChevronLeft :size="20" />戻る
    </button>
    <IconLoader2 v-if="loading && !data" class="animate-spin text-white/50" />
    <p v-if="error" class="text-accent">{{ String(error) }}</p>
    <template v-if="data">
      <div class="flex flex-col @xl:flex-row gap-5 @xl:gap-8 mb-8 @xl:items-end">
        <div class="size-44 @xl:size-60 shrink-0 rounded-xl bg-white/5 shadow-2xl shadow-black/60 overflow-hidden flex items-center justify-center">
          <img v-if="data.playlist.coverArt" :src="client.coverUrl(data.playlist.coverArt, 400)" class="w-full h-full object-cover" alt="" />
          <IconPlaylist v-else :size="64" class="text-white/20" />
        </div>
        <div class="flex flex-col gap-1 min-w-0">
          <div v-if="!editing" class="group/title flex items-center gap-2 min-w-0">
            <h1 class="text-3xl font-bold truncate">{{ data.playlist.name }}</h1>
            <button class="p-1 rounded-full text-white/40 hover:text-white opacity-0 group-hover/title:opacity-100" title="名前を変更" @click="editing = true">
              <IconPencil :size="18" />
            </button>
          </div>
          <input
            v-else
            autofocus
            class="text-3xl font-bold bg-white/10 rounded-lg px-2 py-0.5 outline-none focus:ring-2 focus:ring-accent/70 w-full"
            :value="data.playlist.name"
            @blur="rename(($event.target as HTMLInputElement).value)"
            @keydown.enter="($event.target as HTMLInputElement).blur()"
            @keydown.esc="editing = false"
          />
          <div class="text-sm text-white/50 uppercase tracking-wide">プレイリスト · {{ data.songs.length }} 曲</div>
          <div class="mt-4 flex flex-wrap gap-3">
            <button
              class="flex items-center gap-2 whitespace-nowrap rounded-lg bg-accent hover:brightness-110 px-6 py-2 font-medium disabled:opacity-50"
              :disabled="!data.songs.length"
              @click="playQueue(client, data.songs, 0)"
            >
              <IconPlayerPlayFilled :size="18" />再生
            </button>
            <button
              :class="['flex items-center gap-2 whitespace-nowrap rounded-lg bg-white/10 hover:bg-white/15 px-6 py-2 font-medium disabled:opacity-50', shuffle() ? 'text-accent' : '']"
              :disabled="!data.songs.length"
              @click="shufflePlay"
            >
              <IconArrowsShuffle :size="18" />シャッフル
            </button>
            <button :class="['flex items-center gap-2 rounded-lg px-4 py-2 font-medium', confirming ? 'bg-accent' : 'bg-white/10 hover:bg-white/15 text-white/70']" @click="remove">
              <IconTrash :size="18" />{{ confirming ? "もう一度押して削除" : "削除" }}
            </button>
            <SongMenu :client="client" :songs="() => data!.songs" trigger-class="flex items-center rounded-lg bg-white/10 hover:bg-white/15 px-3 py-2.5 h-full" />
          </div>
        </div>
      </div>
      <ul v-if="data.songs.length" :ref="setList">
        <li
          v-for="(s, i) in data.songs"
          :key="keys[i]"
          class="group flex items-center gap-4 rounded-md px-3 py-2.5 border-y-2 border-transparent odd:bg-white/[0.04] hover:bg-white/10 cursor-pointer"
          v-bind="bind(i)"
          :style="indicator(i)"
          @click="playQueue(client, data.songs, i)"
        >
          <span class="w-6 text-right text-white/40 text-sm tabular-nums">
            <IconVolume v-if="current()?.id === s.id && playing()" :size="16" class="inline text-accent" />
            <template v-else>{{ i + 1 }}</template>
          </span>
          <span :class="['flex-1 min-w-0 truncate', current()?.id === s.id ? 'text-accent' : '']">{{ s.title }}</span>
          <span class="hidden @2xl:block w-40 truncate text-sm text-white/40">{{ s.artist }}</span>
          <span class="text-sm text-white/40 tabular-nums">{{ fmt(s.duration) }}</span>
          <Heart :client="client" kind="song" :item="s" />
          <SongMenu :client="client" :songs="() => [s]" :remove-action="{ label: 'プレイリストから削除', run: () => removeSong(i) }" />
        </li>
      </ul>
      <p v-else class="text-white/40">曲がありません。曲のメニューから追加できます。</p>
    </template>
  </div>
</template>
