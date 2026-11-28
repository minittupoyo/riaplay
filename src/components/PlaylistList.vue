<script setup lang="ts">
import { IconPlaylist, IconPlus, IconLoader2 } from "@tabler/icons-vue";
import type { Playlist, SubsonicClient } from "../api";
import { vEnter } from "../motion";
import { firstShow } from "../firstShow";
import { openCreateDialog } from "../store";
import PlaylistCard from "./PlaylistCard.vue";

defineProps<{ client: SubsonicClient; playlists: Playlist[] | undefined; loading: boolean }>();
const emit = defineEmits<{ open: [id: string] }>();
</script>

<template>
  <div>
    <div v-enter="firstShow('playlists:title') ? { y: 10 } : false" class="flex items-center justify-between gap-4 mb-6">
      <h1 class="text-3xl font-bold">プレイリスト</h1>
      <button class="flex items-center gap-1.5 rounded-lg bg-white/10 hover:bg-white/15 px-4 py-2 text-sm font-medium whitespace-nowrap" @click="openCreateDialog()">
        <IconPlus :size="16" class="text-accent" />新規プレイリスト
      </button>
    </div>
    <div v-if="loading && !playlists" class="flex items-center gap-2 text-white/50"><IconLoader2 :size="18" class="animate-spin" />読み込み中…</div>
    <div v-if="!loading && !playlists?.length" class="flex flex-col items-center gap-3 mt-24 text-white/40">
      <IconPlaylist :size="48" />
      <p>プレイリストはまだありません</p>
    </div>
    <div class="card-grid">
      <PlaylistCard v-for="(p, i) in playlists" :key="p.id" :client="client" :playlist="p" :i="i" @open="emit('open', $event)" />
    </div>
  </div>
</template>
