<script setup lang="ts">
import { IconLoader2 } from "@tabler/icons-vue";

/** 一覧の取得状態: 初回の読み込み中表示と、失敗時のエラー表示 */
defineProps<{ loading: boolean; hasData: boolean; error?: unknown }>();
</script>

<template>
  <div v-if="loading && !hasData" class="flex items-center gap-2 text-white/50"><IconLoader2 :size="18" class="animate-spin" />読み込み中…</div>
  <p v-if="error" class="text-accent">読み込みに失敗しました: {{ String(error) }}</p>
</template>
