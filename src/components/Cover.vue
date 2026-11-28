<script setup lang="ts">
import { IconDisc } from "@tabler/icons-vue";

defineProps<{ src?: string; round?: boolean }>();
</script>

<template>
  <div :class="['aspect-square bg-white/5 overflow-hidden flex items-center justify-center shadow-lg shadow-black/40', round ? 'rounded-full' : 'rounded-lg']">
    <img v-if="src" :src="src" loading="lazy" decoding="async" class="w-full h-full object-cover" alt="" />
    <IconDisc v-else :size="40" class="text-white/20" />
  </div>
</template>
