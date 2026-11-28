<script setup lang="ts">
import { IconChevronLeft, IconLoader2 } from "@tabler/icons-vue";
import type { SubsonicClient } from "../api";
import { vEnter } from "../motion";
import { libraryVersion, refreshed } from "../store";
import { useResource } from "../reactive";
import AlbumCard from "./AlbumCard.vue";
import Heart from "./Heart.vue";

type ArtistData = Awaited<ReturnType<SubsonicClient["getArtist"]>>;

const props = defineProps<{ client: SubsonicClient; id: string }>();
const emit = defineEmits<{ back: []; album: [id: string] }>();

const { data, loading, error } = useResource<readonly [string, number], ArtistData>(
  () => [props.id, libraryVersion()] as const,
  ([id], { value }) => refreshed(value, () => props.client.getArtist(id)),
);
</script>

<template>
  <div v-enter="{ y: 10 }">
    <button class="flex items-center gap-0.5 text-accent mb-5 -ml-1" @click="emit('back')">
      <IconChevronLeft :size="20" />戻る
    </button>
    <IconLoader2 v-if="loading && !data" class="animate-spin text-white/50" />
    <p v-if="error" class="text-accent">{{ String(error) }}</p>
    <template v-if="data">
      <div class="flex items-center gap-3 mb-8">
        <h1 class="text-4xl font-bold">{{ data.artist.name }}</h1>
        <Heart :client="client" kind="artist" :item="data.artist" always :size="24" />
      </div>
      <h2 class="text-xl font-semibold mb-4">アルバム</h2>
      <div class="card-grid">
        <AlbumCard v-for="a in data.albums" :key="a.id" :client="client" :album="a" :show-artist="false" @open="emit('album', $event)" />
      </div>
    </template>
  </div>
</template>
