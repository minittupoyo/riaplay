<script setup lang="ts">
import { onMounted, ref } from "vue";
import { IconPlayerPlayFilled } from "@tabler/icons-vue";
import type { Album, SubsonicClient } from "../api";
import { hoverAnim, stagger, vEnter } from "../motion";
import { playQueue } from "../player";
import Cover from "./Cover.vue";
import SongMenu from "./SongMenu.vue";
import Heart from "./Heart.vue";

const props = withDefaults(
  defineProps<{ client: SubsonicClient; album: Album; showArtist?: boolean; i?: number; animate?: boolean }>(),
  { showArtist: true, animate: true },
);
const emit = defineEmits<{ open: [id: string] }>();

const cover = ref<InstanceType<typeof Cover> | null>(null);
const btn = ref<HTMLButtonElement | null>(null);
let hover: { in(): void; out(): void }[] = [];
onMounted(() => {
  hover = [
    hoverAnim(cover.value!.$el, [{ transform: "scale(1)" }, { transform: "scale(1.04)" }]),
    hoverAnim(btn.value!, [{ opacity: 0, transform: "translateY(6px) scale(.9)" }, { opacity: 1, transform: "none" }]),
  ];
});
const play = async () => {
  const { songs } = await props.client.getAlbum(props.album.id);
  playQueue(props.client, songs, 0);
};
</script>

<template>
  <div
    v-enter="animate ? { delay: stagger(i ?? 0), y: 14 } : false"
    class="group cursor-pointer"
    @mouseenter="hover.forEach((h) => h.in())"
    @mouseleave="hover.forEach((h) => h.out())"
    @click="emit('open', album.id)"
  >
    <div class="relative">
      <Cover ref="cover" :src="client.coverUrl(album.coverArt)" />
      <button
        ref="btn"
        class="absolute left-2 bottom-2 size-9 rounded-full bg-white/80 backdrop-blur text-black flex items-center justify-center hover:bg-white"
        title="再生"
        @click.stop="play"
      >
        <IconPlayerPlayFilled :size="18" />
      </button>
      <div class="absolute left-2 top-2">
        <Heart :client="client" kind="album" :item="album" :size="16" btn-class="p-1.5 rounded-full bg-black/50 backdrop-blur" />
      </div>
      <div class="absolute right-2 top-2">
        <SongMenu
          :client="client"
          :songs="async () => (await client.getAlbum(album.id)).songs"
          trigger-class="p-1 rounded-full bg-black/50 backdrop-blur text-white opacity-0 group-hover:opacity-100 hover:bg-black/70"
        />
      </div>
    </div>
    <div class="mt-2 text-[13px] font-medium truncate" :title="album.name">{{ album.name }}</div>
    <div class="text-[13px] text-white/50 truncate">{{ showArtist ? album.artist : album.year }}</div>
  </div>
</template>
