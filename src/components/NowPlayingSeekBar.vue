<script setup lang="ts">
import type { Song } from "../api";
import { time, duration, seek } from "../player";
import { fmt } from "../format";
import Slider from "./Slider.vue";

defineProps<{ song: Song }>();
</script>

<template>
  <div class="w-full flex items-center gap-3 text-[13px] text-white/80 tabular-nums">
    <span class="w-10 text-right">{{ fmt(time()) }}</span>
    <Slider class="np-seek flex-1 w-full" :value="time()" :max="duration() || song.duration" @input="seek" />
    <span class="w-10">{{ fmt(duration() || song.duration) }}</span>
  </div>
</template>
