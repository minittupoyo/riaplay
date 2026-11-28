<script setup lang="ts">
import { computed, ref } from "vue";
import { IconChevronDown, IconDownload, IconPlayerPlayFilled, IconTrash, IconX } from "@tabler/icons-vue";
import type { SubsonicClient } from "../api";
import { cancelAllDownloads, cancelDownload, downloadedFor, jobs, removeDownloads, type DownloadedSong } from "../downloads";
import { playQueue } from "../player";
import { vEnter } from "../motion";
import { toast } from "../toast";
import { fmt } from "../format";
import Cover from "./Cover.vue";

const fmtSize = (n: number) => (n >= 1e9 ? `${(n / 1e9).toFixed(1)} GB` : n >= 1e6 ? `${Math.round(n / 1e6)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`);

interface Group { key: string; album: string; artist: string; coverArt?: string; items: DownloadedSong[] }

/** ダウンロード済みの曲の一覧と、進行中のダウンロード。アルバムごとにまとめ、再生・削除ができる */
const props = defineProps<{ client: SubsonicClient }>();

const list = computed(() => downloadedFor(props.client.serverId));
const groups = computed(() => {
  const m = new Map<string, Group>();
  for (const e of list.value) {
    // ジャケット ID は曲ごとに違うので、キーに使わない
    const key = e.song.albumId ?? `${e.song.album}\u0000${e.song.artist}`;
    let g = m.get(key);
    if (!g) m.set(key, (g = { key, album: e.song.album, artist: e.song.artist, coverArt: e.song.coverArt, items: [] }));
    g.items.push(e);
  }
  return [...m.values()];
});
const total = computed(() => list.value.reduce((n, e) => n + e.size, 0));
const openKey = ref<string | null>(null);
const confirming = ref<string | null>(null); // 2 回押して削除する対象
const confirm = (id: string, run: () => void) => {
  if (confirming.value !== id) { confirming.value = id; setTimeout(() => { if (confirming.value === id) confirming.value = null; }, 3000); return; }
  confirming.value = null;
  run();
};
const remove = async (items: DownloadedSong[]) => { await removeDownloads(items); toast(`${items.length} 曲のダウンロードを削除しました`); };
const mine = computed(() => jobs().filter((j) => j.serverId === props.client.serverId));

const btn = "p-2 rounded-full text-white/60 hover:text-white hover:bg-white/10";
</script>

<template>
  <div v-enter="{ y: 10 }">
    <div class="flex items-end justify-between gap-4 mb-6">
      <div>
        <h1 class="text-3xl font-bold">ダウンロード</h1>
        <p class="text-sm text-white/50 mt-1">{{ list.length }} 曲 · {{ fmtSize(total) }}</p>
      </div>
      <button
        v-if="list.length"
        :class="['rounded-lg px-4 py-2 text-sm', confirming === 'all' ? 'bg-accent' : 'bg-white/10 hover:bg-white/15']"
        @click="confirm('all', () => remove(list))"
      >
        {{ confirming === "all" ? "もう一度押すと削除" : "すべて削除" }}
      </button>
    </div>

    <section v-if="mine.length" class="mb-8">
      <div class="flex items-center justify-between mb-2">
        <h2 class="text-xl font-semibold">ダウンロード中</h2>
        <button class="text-sm text-white/60 hover:text-white" @click="cancelAllDownloads">すべて中止</button>
      </div>
      <ul class="rounded-xl bg-white/[0.04] divide-y divide-white/5">
        <li v-for="j in mine" :key="j.key" class="flex items-center gap-3 px-4 py-2.5">
          <div class="min-w-0 flex-1">
            <div class="text-sm truncate">{{ j.song.title }}</div>
            <div class="mt-1.5 h-1 rounded-full bg-white/10 overflow-hidden">
              <div class="h-full bg-white/80 transition-[width] duration-150" :style="{ width: j.total > 0 ? `${Math.min(100, (j.received / j.total) * 100)}%` : '0%' }" />
            </div>
          </div>
          <span class="w-16 text-right text-xs text-white/50 tabular-nums">
            {{ j.status === "queued" ? "待機中" : j.total > 0 ? `${Math.floor((j.received / j.total) * 100)}%` : "…" }}
          </span>
          <button class="p-1 rounded-full text-white/50 hover:text-white" title="中止" @click="cancelDownload(j.key)"><IconX :size="16" /></button>
        </li>
      </ul>
    </section>

    <ul v-if="groups.length" class="space-y-2">
      <li v-for="g in groups" :key="g.key" class="rounded-xl bg-white/[0.04]">
        <div class="flex items-center gap-4 p-3">
          <div class="w-16 shrink-0"><Cover :src="client.coverUrl(g.coverArt, 120)" /></div>
          <button class="min-w-0 flex-1 text-left" @click="openKey = openKey === g.key ? null : g.key">
            <div class="font-medium truncate">{{ g.album }}</div>
            <div class="text-sm text-white/50 truncate">{{ g.artist }}</div>
            <div class="text-xs text-white/40 mt-0.5">{{ g.items.length }} 曲 · {{ fmtSize(g.items.reduce((n, e) => n + e.size, 0)) }}</div>
          </button>
          <button :class="btn" title="再生" @click="playQueue(client, g.items.map((e) => e.song), 0)"><IconPlayerPlayFilled :size="20" /></button>
          <button
            :class="[btn, confirming === g.key ? 'text-accent' : '']"
            :title="confirming === g.key ? 'もう一度押すとこのアルバムを削除' : 'このアルバムを削除'"
            @click="confirm(g.key, () => remove(g.items))"
          >
            <IconTrash :size="18" />
          </button>
          <button :class="[btn, 'transition-transform', openKey === g.key ? 'rotate-180' : '']" title="曲を表示" @click="openKey = openKey === g.key ? null : g.key">
            <IconChevronDown :size="18" />
          </button>
        </div>
        <ul v-if="openKey === g.key" class="border-t border-white/5 px-2 py-1">
          <li
            v-for="(e, i) in g.items"
            :key="e.key"
            class="group flex items-center gap-3 rounded-md px-3 py-2 hover:bg-white/10 cursor-pointer"
            @click="playQueue(client, g.items.map((x) => x.song), i)"
          >
            <span class="w-6 text-right text-sm text-white/40 tabular-nums">{{ e.song.track ?? i + 1 }}</span>
            <span class="min-w-0 flex-1 truncate">{{ e.song.title }}</span>
            <span class="text-xs text-white/40 tabular-nums">{{ fmtSize(e.size) }}</span>
            <span class="w-10 text-right text-sm text-white/40 tabular-nums">{{ fmt(e.song.duration) }}</span>
            <button class="p-1 rounded-full text-white/40 hover:text-white" title="削除" @click.stop="remove([e])">
              <IconTrash :size="16" />
            </button>
          </li>
        </ul>
      </li>
    </ul>
    <div v-else-if="!mine.length" class="flex flex-col items-center gap-3 mt-24 text-white/40 text-center">
      <IconDownload :size="48" />
      <p>ダウンロードした曲はまだありません。<br />曲やアルバムの「…」メニュー、または右クリックから「ダウンロード」を選ぶと、ここに追加されます。</p>
    </div>
  </div>
</template>
