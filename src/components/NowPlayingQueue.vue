<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { IconX, IconTrash, IconVolume } from "@tabler/icons-vue";
import type { SubsonicClient } from "../api";
import { queue, index, playing, jumpTo, removeFromQueue, clearQueue, moveInQueue } from "../player";
import { fmt } from "../format";
import { createReorder, uniqueKeys } from "../reorder";

/** 再生中画面専用のキュー。サイドパネルより大きく、曲が変わると現在の曲が見える位置までスクロールする */
defineProps<{ client: SubsonicClient }>();

const { bind, indicator, list, setList } = createReorder(moveInQueue);
const keys = computed(() => uniqueKeys(queue()));
const scroller = ref<HTMLDivElement | null>(null);

const reveal = (smooth: boolean) => {
  const sc = scroller.value;
  const el = list.value?.children[index()] as HTMLElement | undefined;
  if (!sc || !el) return;
  const sr = sc.getBoundingClientRect(), er = el.getBoundingClientRect();
  sc.scrollTo({ top: sc.scrollTop + (er.top - sr.top) - sc.clientHeight / 3, behavior: smooth ? "smooth" : "auto" });
};
// 曲が変わったときはなめらかに、一覧が現れた直後は一気に、現在の曲へ合わせる
watch(() => queue().length && index(), () => nextTick(() => reveal(true)));
watch(list, (el) => { if (el) void nextTick(() => reveal(false)); });
</script>

<template>
  <div class="flex-1 min-h-0 flex flex-col">
    <div class="flex items-center justify-between px-3 pb-3">
      <h2 class="text-2xl font-bold">キュー</h2>
      <button v-if="queue().length" class="p-2 rounded-full text-white/60 hover:text-white hover:bg-white/10" title="キューを空にする" @click="clearQueue"><IconTrash :size="20" /></button>
    </div>
    <div ref="scroller" class="fade-y flex-1 min-h-0 overflow-y-scroll px-1">
      <ul v-if="queue().length" :ref="setList">
        <li
          v-for="(s, i) in queue()"
          :key="keys[i]"
          :class="['group flex items-center gap-4 rounded-xl px-3 py-2 cursor-pointer hover:bg-white/10 border-y-2 border-transparent', i === index() ? 'bg-white/25' : '']"
          v-bind="bind(i)"
          :style="indicator(i)"
          @click="jumpTo(i)"
        >
          <div class="relative size-14 shrink-0">
            <img v-if="s.coverArt" :src="client.coverUrl(s.coverArt, 120)" loading="lazy" class="size-14 rounded-lg object-cover" alt="" />
            <div v-else class="size-14 rounded-lg bg-white/10" />
            <div v-if="i === index() && playing()" class="absolute inset-0 rounded-lg bg-black/50 flex items-center justify-center"><IconVolume :size="20" class="text-white" /></div>
          </div>
          <div class="min-w-0 flex-1">
            <div :class="['text-lg truncate', i === index() ? 'font-extrabold text-white' : 'font-medium text-white/80']">{{ s.title }}</div>
            <div class="text-sm text-white/55 truncate">{{ s.artist }}</div>
          </div>
          <span class="text-sm text-white/40 tabular-nums group-hover:hidden">{{ fmt(s.duration) }}</span>
          <button class="hidden group-hover:block p-1.5 rounded-full text-white/60 hover:text-white" title="キューから削除" @click.stop="removeFromQueue(i)">
            <IconX :size="18" />
          </button>
        </li>
      </ul>
      <p v-else class="px-3 text-white/40">キューは空です</p>
      <div class="h-[30vh]" />
    </div>
  </div>
</template>
