<script setup lang="ts">
import { computed } from "vue";
import { IconAlertCircle, IconDownload, IconPencil, IconPlus, IconRefresh, IconTrash } from "@tabler/icons-vue";
import { hasDownloads } from "../downloads";
import { hostOf, removeServer, servers, setActive, setServerDialog, type Server } from "../servers";

/** 接続できなかったとき: 再試行・編集・別のサーバーへ切り替え・削除 */
const props = defineProps<{ server: Server | null; message: string }>();
const emit = defineEmits<{ retry: []; offline: [] }>();

const others = computed(() => servers().filter((s) => s.id !== props.server?.id));
const btn = "flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium";
</script>

<template>
  <main class="h-full flex items-center justify-center p-6 select-text">
    <div class="w-full max-w-sm">
      <div class="flex items-center gap-3 mb-2">
        <IconAlertCircle :size="28" class="text-accent shrink-0" />
        <h1 class="text-xl font-bold">接続できませんでした</h1>
      </div>
      <p v-if="server" class="text-sm text-white/50 mb-1">{{ server.name }}（{{ server.username }}@{{ hostOf(server.url) }}）</p>
      <p class="text-sm text-accent mb-6 break-words">{{ message }}</p>
      <div class="flex flex-wrap gap-3">
        <button :class="`${btn} bg-accent hover:brightness-110`" @click="emit('retry')"><IconRefresh :size="16" />再試行</button>
        <button v-if="server && hasDownloads(server.id)" :class="`${btn} bg-white/10 hover:bg-white/15`" @click="emit('offline')"><IconDownload :size="16" />ダウンロードした曲を使う</button>
        <template v-if="server">
          <button :class="`${btn} bg-white/10 hover:bg-white/15`" @click="setServerDialog({ mode: 'edit', id: server.id })"><IconPencil :size="16" />編集</button>
          <button :class="`${btn} bg-white/10 hover:bg-white/15 text-white/70`" @click="removeServer(server.id)"><IconTrash :size="16" />削除</button>
        </template>
      </div>
      <div v-if="others.length" class="mt-8">
        <p class="text-xs font-semibold text-white/40 mb-2">別のサーバーに切り替え</p>
        <button v-for="s in others" :key="s.id" class="flex items-center w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-white/10" @click="setActive(s.id)">
          <span class="min-w-0"><span class="block truncate">{{ s.name }}</span><span class="block truncate text-[11px] text-white/40">{{ s.username }}@{{ hostOf(s.url) }}</span></span>
        </button>
      </div>
      <button class="mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-accent hover:bg-white/10" @click="setServerDialog({ mode: 'add' })">
        <IconPlus :size="16" />サーバーを追加…
      </button>
    </div>
  </main>
</template>
