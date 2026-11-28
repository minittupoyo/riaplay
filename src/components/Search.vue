<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { IconSearch, IconX, IconLoader2 } from "@tabler/icons-vue";
import type { SubsonicClient } from "../api";
import { vEnter } from "../motion";
import { firstShow } from "../firstShow";
import { fmt } from "../format";
import { useResource } from "../reactive";
import { playQueue, current } from "../player";
import AlbumCard from "./AlbumCard.vue";
import SongMenu from "./SongMenu.vue";
import Heart from "./Heart.vue";

type SearchResult = Awaited<ReturnType<SubsonicClient["search"]>>;

const props = defineProps<{ client: SubsonicClient }>();
const query = defineModel<string>("query", { required: true });
const emit = defineEmits<{ album: [id: string]; artist: [id: string] }>();

// 入力が止まってから検索する（デバウンス）
const debounced = ref(query.value.trim());
watch(
  () => query.value.trim(),
  (q, _old, onCleanup) => {
    const t = setTimeout(() => { debounced.value = q; }, 300);
    onCleanup(() => clearTimeout(t));
  },
  { immediate: true },
);
const { data: res, loading, error } = useResource<string, SearchResult | null>(
  () => debounced.value,
  (q) => (q ? props.client.search(q) : null),
);

const heading = "text-xl font-semibold mb-4";
const empty = computed(() => res.value && !res.value.artists.length && !res.value.albums.length && !res.value.songs.length);
</script>

<template>
  <div v-enter="firstShow('search:page') ? { y: 10 } : false">
    <label class="flex items-center gap-2 rounded-xl bg-white/10 px-3 mb-8 max-w-xl focus-within:ring-2 focus-within:ring-accent/70">
      <IconSearch :size="18" class="text-white/40" />
      <input v-model="query" autofocus class="w-full bg-transparent py-2.5 outline-none placeholder:text-white/40" placeholder="アーティスト・アルバム・曲を検索" />
      <button v-if="query" type="button" @click="query = ''"><IconX :size="16" class="text-white/40 hover:text-white" /></button>
    </label>

    <IconLoader2 v-if="loading" class="animate-spin text-white/40" />
    <p v-if="error" class="text-accent">{{ String(error) }}</p>
    <p v-if="empty" class="text-white/40">「{{ debounced }}」に一致する結果はありません</p>

    <div v-if="res" class="space-y-8">
      <section v-if="res.artists.length">
        <h2 :class="heading">アーティスト</h2>
        <div class="flex flex-wrap gap-2">
          <button v-for="a in res.artists" :key="a.id" class="rounded-full bg-white/10 hover:bg-white/15 px-4 py-1.5 text-sm" @click="emit('artist', a.id)">{{ a.name }}</button>
        </div>
      </section>

      <section v-if="res.albums.length">
        <h2 :class="heading">アルバム</h2>
        <div class="card-grid">
          <AlbumCard v-for="a in res.albums" :key="a.id" :client="client" :album="a" @open="emit('album', $event)" />
        </div>
      </section>

      <section v-if="res.songs.length">
        <h2 :class="heading">曲</h2>
        <ul>
          <li
            v-for="(s, i) in res.songs"
            :key="s.id"
            class="group flex items-center gap-4 rounded px-3 py-2 odd:bg-white/[0.04] hover:bg-white/10 cursor-pointer"
            @click="playQueue(client, res.songs, i)"
          >
            <span :class="['flex-1 truncate', current()?.id === s.id ? 'text-accent' : '']">{{ s.title }}</span>
            <span class="hidden @2xl:block w-48 truncate text-sm text-white/40">{{ s.artist }}</span>
            <span class="hidden @3xl:block w-48 truncate text-sm text-white/40">{{ s.album }}</span>
            <span class="text-sm text-white/40 tabular-nums">{{ fmt(s.duration) }}</span>
            <Heart :client="client" kind="song" :item="s" />
            <SongMenu :client="client" :songs="() => [s]" />
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>
