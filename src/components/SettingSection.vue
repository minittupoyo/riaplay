<script setup lang="ts">
/** 設定のまとまり（見出し + 角丸のカード） */
defineProps<{ title: string }>();
</script>

<template>
  <section>
    <h2 class="px-1 mb-2 text-sm font-semibold text-white/50">{{ title }}</h2>
    <div class="rounded-2xl bg-white/[0.04] divide-y divide-white/5"><slot /></div>
  </section>
</template>
