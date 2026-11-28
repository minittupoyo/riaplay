<script setup lang="ts">
import { onMounted, ref } from "vue";
import { IconPlaylist, IconPlayerPlayFilled } from "@tabler/icons-vue";
import type { Playlist, SubsonicClient } from "../api";
import { playQueue } from "../player";
import { hoverAnim, stagger, vEnter } from "../motion";
import { firstShow } from "../firstShow";
import { openContextMenu } from "../contextMenu";

const props = defineProps<{ client: SubsonicClient; playlist: Playlist; i: number }>();
const emit = defineEmits<{ open: [id: string] }>();

const cover = ref<HTMLDivElement | null>(null);
const btn = ref<HTMLButtonElement | null>(null);
let hover: { in(): void; out(): void }[] = [];
onMounted(() => {
  hover = [
    hoverAnim(cover.value!, [{ transform: "scale(1)" }, { transform: "scale(1.04)" }]),
    hoverAnim(btn.value!, [{ opacity: 0, transform: "translateY(6px) scale(.9)" }, { opacity: 1, transform: "none" }]),
  ];
});
const play = async () => {
  const { songs } = await props.client.getPlaylist(props.playlist.id);
  if (songs.length) playQueue(props.client, songs, 0);
};
const songs = async () => (await props.client.getPlaylist(props.playlist.id)).songs;
const menu = (e: MouseEvent) => openContextMenu({ x: e.clientX, y: e.clientY, client: props.client, songs });
</script>

<template>
  <div
    v-enter="firstShow('playlists:cards') ? { delay: stagger(i), y: 14 } : false"
    class="cursor-pointer"
    @mouseenter="hover.forEach((h) => h.in())"
    @mouseleave="hover.forEach((h) => h.out())"
    @click="emit('open', playlist.id)"
    @contextmenu.prevent.stop="menu"
  >
    <div class="relative">
      <div ref="cover" class="aspect-square rounded-lg bg-white/5 overflow-hidden flex items-center justify-center shadow-lg shadow-black/40">
        <img v-if="playlist.coverArt" :src="client.coverUrl(playlist.coverArt)" loading="lazy" decoding="async" class="w-full h-full object-cover" alt="" />
        <IconPlaylist v-else :size="44" class="text-white/20" />
      </div>
      <button
        ref="btn"
        class="absolute left-2 bottom-2 size-9 rounded-full bg-white/80 backdrop-blur text-black flex items-center justify-center hover:bg-white disabled:hidden"
        :disabled="!playlist.songCount"
        title="再生"
        @click.stop="play"
      >
        <IconPlayerPlayFilled :size="18" />
      </button>
    </div>
    <div class="mt-2 text-[13px] font-medium truncate" :title="playlist.name">{{ playlist.name }}</div>
    <div class="text-[13px] text-white/50">{{ playlist.songCount }} 曲</div>
  </div>
</template>
