<script setup lang="ts">
import { computed } from "vue";
import { IconX, IconTrash, IconVolume } from "@tabler/icons-vue";
import type { SubsonicClient } from "../api";
import { current, queue, index, playing, jumpTo, removeFromQueue, clearQueue, moveInQueue } from "../player";
import { setQueueOpen } from "../store";
import { fmt } from "../format";
import { createReorder, uniqueKeys } from "../reorder";

defineProps<{ client: SubsonicClient; overlay?: boolean }>();

const { bind, indicator, setList } = createReorder(moveInQueue);
const keys = computed(() => uniqueKeys(queue()));
</script>

<template>
  <aside
    :class="`w-80 shrink-0 overflow-hidden border-l flex flex-col ${overlay ? 'absolute right-0 top-0 z-30 border-white/10 bg-[#262629] shadow-2xl shadow-black/60' : 'border-white/5 bg-white/[0.04]'}`"
    :style="overlay ? { bottom: current() ? '6.5rem' : '0' } : undefined"
  >
    <div class="w-80 flex-1 min-h-0 flex flex-col">
      <div class="flex items-center justify-between px-4 pt-5 pb-3">
        <h2 class="text-xl font-bold">キュー</h2>
        <div class="flex items-center gap-1">
          <button v-if="queue().length" class="p-1.5 rounded-full text-white/60 hover:text-white hover:bg-white/10" title="キューを空にする" @click="clearQueue"><IconTrash :size="18" /></button>
          <button class="p-1.5 rounded-full text-white/60 hover:text-white hover:bg-white/10" @click="setQueueOpen(false)"><IconX :size="18" /></button>
        </div>
      </div>
      <div class="flex-1 overflow-y-scroll px-2">
        <ul v-if="queue().length" :ref="setList">
          <li
            v-for="(s, i) in queue()"
            :key="keys[i]"
            :class="['group flex items-center gap-3 rounded-lg px-2 py-1.5 cursor-pointer hover:bg-white/10 border-y-2 border-transparent', i === index() ? 'bg-white/10' : '']"
            v-bind="bind(i)"
            :style="indicator(i)"
            @click="jumpTo(i)"
          >
            <div class="relative size-10 shrink-0">
              <img v-if="s.coverArt" :src="client.coverUrl(s.coverArt, 80)" loading="lazy" class="size-10 rounded object-cover" alt="" />
              <div v-else class="size-10 rounded bg-white/10" />
              <div v-if="i === index() && playing()" class="absolute inset-0 rounded bg-black/50 flex items-center justify-center"><IconVolume :size="16" class="text-accent" /></div>
            </div>
            <div class="min-w-0 flex-1">
              <div :class="['text-sm truncate', i === index() ? 'text-accent' : '']">{{ s.title }}</div>
              <div class="text-xs text-white/50 truncate">{{ s.artist }}</div>
            </div>
            <span class="text-xs text-white/40 tabular-nums group-hover:hidden">{{ fmt(s.duration) }}</span>
            <button class="hidden group-hover:block p-1 rounded-full text-white/60 hover:text-white" title="キューから削除" @click.stop="removeFromQueue(i)">
              <IconX :size="16" />
            </button>
          </li>
        </ul>
        <p v-else class="px-3 text-sm text-white/40">キューは空です</p>
      </div>
    </div>
  </aside>
</template>
