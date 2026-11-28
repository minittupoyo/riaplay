<script setup lang="ts">
import { computed } from "vue";
import { IconHeart, IconVolume } from "@tabler/icons-vue";
import type { SubsonicClient } from "../api";
import { favSongs, favAlbums, favArtists } from "../favorites";
import { playQueue, current, playing } from "../player";
import { stagger, vEnter } from "../motion";
import { firstShow } from "../firstShow";
import { fmt } from "../format";
import AlbumCard from "./AlbumCard.vue";
import Cover from "./Cover.vue";
import Heart from "./Heart.vue";
import SongMenu from "./SongMenu.vue";

defineProps<{ client: SubsonicClient }>();
const emit = defineEmits<{ album: [id: string]; artist: [id: string] }>();

const empty = computed(() => !favSongs().length && !favAlbums().length && !favArtists().length);
const h2 = "text-xl font-semibold mb-4";
</script>

<template>
  <div v-enter="firstShow('favorites:page') ? { y: 10 } : false">
    <h1 class="text-3xl font-bold mb-6">お気に入り</h1>
    <div v-if="empty" class="flex flex-col items-center gap-3 mt-24 text-white/40">
      <IconHeart :size="48" />
      <p>お気に入りはまだありません。曲やアルバムのハートを押して追加できます。</p>
    </div>
    <div class="space-y-10">
      <section v-if="favArtists().length">
        <h2 :class="h2">アーティスト</h2>
        <div class="card-grid">
          <div
            v-for="(a, i) in favArtists()"
            :key="a.id"
            v-enter="firstShow('favorites:artists') ? { delay: stagger(i), y: 14 } : false"
            class="group cursor-pointer relative"
            @click="emit('artist', a.id)"
          >
            <Cover :src="client.coverUrl(a.coverArt)" round />
            <div class="mt-2 text-[13px] font-medium truncate text-center">{{ a.name }}</div>
            <div class="absolute top-1 right-3"><Heart :client="client" kind="artist" :item="a" btn-class="p-1.5 rounded-full bg-black/50" /></div>
          </div>
        </div>
      </section>
      <section v-if="favAlbums().length">
        <h2 :class="h2">アルバム</h2>
        <div class="card-grid">
          <AlbumCard
            v-for="(a, i) in favAlbums()"
            :key="a.id"
            :i="i"
            :animate="firstShow('favorites:albums')"
            :client="client"
            :album="a"
            @open="emit('album', $event)"
          />
        </div>
      </section>
      <section v-if="favSongs().length">
        <h2 :class="h2">曲</h2>
        <ul>
          <li
            v-for="(s, i) in favSongs()"
            :key="s.id"
            class="group flex items-center gap-4 rounded-md px-3 py-2.5 odd:bg-white/[0.04] hover:bg-white/10 cursor-pointer"
            @click="playQueue(client, favSongs(), i)"
          >
            <span class="w-6 text-right text-white/40 text-sm tabular-nums">
              <IconVolume v-if="current()?.id === s.id && playing()" :size="16" class="inline text-accent" />
              <template v-else>{{ i + 1 }}</template>
            </span>
            <span :class="['flex-1 min-w-0 truncate', current()?.id === s.id ? 'text-accent' : '']">{{ s.title }}</span>
            <span class="hidden @2xl:block w-40 truncate text-sm text-white/40">{{ s.artist }}</span>
            <Heart :client="client" kind="song" :item="s" />
            <span class="text-sm text-white/40 tabular-nums">{{ fmt(s.duration) }}</span>
            <SongMenu :client="client" :songs="() => [s]" />
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>
