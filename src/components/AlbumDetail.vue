<script setup lang="ts">
import { computed } from "vue";
import { IconChevronLeft, IconPlayerPlayFilled, IconArrowsShuffle, IconLoader2, IconVolume, IconDisc } from "@tabler/icons-vue";
import type { Song, SubsonicClient } from "../api";
import { vEnter } from "../motion";
import { fmt } from "../format";
import { libraryVersion, refreshed } from "../store";
import { useResource } from "../reactive";
import { playQueue, current, playing, toggleShuffle, shuffle } from "../player";
import SongMenu from "./SongMenu.vue";
import Heart from "./Heart.vue";

type AlbumData = Awaited<ReturnType<SubsonicClient["getAlbum"]>>;

const props = defineProps<{ client: SubsonicClient; id: string }>();
const emit = defineEmits<{ back: [] }>();

const { data, loading, error } = useResource<readonly [string, number], AlbumData>(
  () => [props.id, libraryVersion()] as const,
  ([id], { value }) => refreshed(value, () => props.client.getAlbum(id)),
);

/** 複数ディスクのアルバムはディスクごとに見出しを付けて分ける（1枚だけなら見出しなし）。i は全体の再生順での位置 */
function discs(songs: Song[], titles: Record<number, string>) {
  const groups: { disc: number; label: string; items: { s: Song; i: number }[] }[] = [];
  songs.forEach((s, i) => {
    const disc = s.discNumber ?? 1;
    let g = groups[groups.length - 1];
    if (!g || g.disc !== disc) groups.push((g = { disc, label: "", items: [] }));
    g.items.push({ s, i });
  });
  if (groups.length > 1) for (const g of groups) g.label = titles[g.disc] ? `Disc ${g.disc} · ${titles[g.disc]}` : `Disc ${g.disc}`;
  return groups;
}
const groups = computed(() => (data.value ? discs(data.value.songs, data.value.discTitles) : []));

const shufflePlay = (songs: Song[]) => {
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
        <img :src="client.coverUrl(data.album.coverArt, 400)" class="size-44 @xl:size-60 rounded-xl object-cover bg-white/5 shadow-2xl shadow-black/60" alt="" />
        <div class="flex flex-col gap-1 min-w-0">
          <h1 class="text-3xl font-bold">{{ data.album.name }}</h1>
          <div class="text-xl text-accent truncate">{{ data.album.artist }}</div>
          <div class="text-sm text-white/50 uppercase tracking-wide">
            {{ data.album.year ? `${data.album.year} · ` : "" }}{{ data.songs.length }} 曲
          </div>
          <div class="mt-4 flex flex-wrap gap-3">
            <button class="flex items-center gap-2 whitespace-nowrap rounded-lg bg-accent hover:brightness-110 px-6 py-2 font-medium" @click="playQueue(client, data.songs, 0)">
              <IconPlayerPlayFilled :size="18" />再生
            </button>
            <button :class="['flex items-center gap-2 whitespace-nowrap rounded-lg bg-white/10 hover:bg-white/15 px-6 py-2 font-medium', shuffle() ? 'text-accent' : '']" @click="shufflePlay(data.songs)">
              <IconArrowsShuffle :size="18" />シャッフル
            </button>
            <SongMenu :client="client" :songs="() => data!.songs" trigger-class="flex items-center rounded-lg bg-white/10 hover:bg-white/15 px-3 py-2.5 h-full" />
            <Heart :client="client" kind="album" :item="data.album" always btn-class="flex items-center rounded-lg bg-white/10 hover:bg-white/15 px-3 py-2.5" />
          </div>
        </div>
      </div>
      <section v-for="g in groups" :key="g.disc" class="mb-6">
        <div v-if="g.label" class="flex items-center gap-2 px-3 pb-2 mb-1 border-b border-white/10 text-sm font-semibold text-white/60">
          <IconDisc :size="16" />{{ g.label }}
          <span class="ml-auto font-normal text-white/40 tabular-nums">{{ g.items.length }} 曲 · {{ fmt(g.items.reduce((n, x) => n + x.s.duration, 0)) }}</span>
        </div>
        <ul>
          <li
            v-for="{ s, i } in g.items"
            :key="i"
            class="group flex items-center gap-4 rounded-md px-3 py-2.5 odd:bg-white/[0.04] hover:bg-white/10 cursor-pointer"
            @click="playQueue(client, data.songs, i)"
          >
            <span class="w-6 text-right text-white/40 text-sm tabular-nums">
              <IconVolume v-if="current()?.id === s.id && playing()" :size="16" class="inline text-accent" />
              <template v-else>{{ s.track ?? i + 1 }}</template>
            </span>
            <div class="flex-1 min-w-0">
              <div :class="['truncate', current()?.id === s.id ? 'text-accent' : '']">{{ s.title }}</div>
              <div v-if="s.artist && s.artist !== data.album.artist" class="truncate text-xs text-white/50">{{ s.artist }}</div>
            </div>
            <span class="text-sm text-white/40 tabular-nums">{{ fmt(s.duration) }}</span>
            <Heart :client="client" kind="song" :item="s" />
            <SongMenu :client="client" :songs="() => [s]" />
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>
