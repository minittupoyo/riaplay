<script setup lang="ts">
import type { Song } from "../api";

defineProps<{ song: Song; compact?: boolean }>();
</script>

<template>
  <div class="w-full min-w-0 text-center">
    <div :class="['font-extrabold truncate', compact ? 'text-xl' : 'text-[clamp(1.5rem,2.6vw,2.4rem)] leading-tight']">{{ song.title }}</div>
    <div :class="['text-white/70 truncate', compact ? 'text-sm' : 'text-[clamp(1rem,1.5vw,1.4rem)]']">{{ song.artist }}</div>
  </div>
</template>
