<script setup lang="ts">
/** 設定の 1 行: 左に名前と説明、右にコントロール */
defineProps<{ title: string; desc?: string }>();
</script>

<template>
  <div class="flex flex-col @xl:flex-row @xl:items-center justify-between gap-3 @xl:gap-6 px-5 py-4">
    <div class="min-w-0">
      <div class="text-[15px] font-medium">{{ title }}</div>
      <div v-if="desc" class="text-sm text-white/50 mt-0.5">{{ desc }}</div>
    </div>
    <div class="shrink-0"><slot /></div>
  </div>
</template>
