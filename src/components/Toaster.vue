<script setup lang="ts">
import { IconAlertCircle, IconCheck } from "@tabler/icons-vue";
import { dismissToast, toasts } from "../toast";
import { vEnter } from "../motion";
</script>

<template>
  <!-- 再生中画面（z-50）より前面に、プレイヤーバーの上へ出す -->
  <div class="fixed inset-x-0 bottom-28 z-[100] flex flex-col items-center gap-2 pointer-events-none px-4">
    <div
      v-for="t in toasts()"
      :key="t.id"
      v-enter="{ y: 12, duration: 240 }"
      :role="t.kind === 'error' ? 'alert' : 'status'"
      :class="['pointer-events-auto flex items-center gap-2 max-w-md rounded-full bg-neutral-800/90 backdrop-blur-xl border border-white/10 shadow-2xl shadow-black/50 pl-3 pr-4 py-2 text-sm transition-all duration-200', t.leaving ? 'opacity-0 translate-y-2' : '']"
      @click="dismissToast(t.id)"
    >
      <IconAlertCircle v-if="t.kind === 'error'" :size="18" class="text-accent shrink-0" />
      <IconCheck v-else :size="18" class="text-white/70 shrink-0" />
      <span class="min-w-0">{{ t.message }}</span>
    </div>
  </div>
</template>
