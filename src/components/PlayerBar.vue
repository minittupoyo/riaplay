<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { animate, usePresence, vEnter } from "../motion";
import {
  IconPlayerPlayFilled, IconPlayerPauseFilled, IconPlayerSkipBackFilled, IconPlayerSkipForwardFilled,
  IconArrowsShuffle, IconRepeat, IconRepeatOnce, IconVolume, IconVolume2, IconVolume3, IconListNumbers, IconQuote, IconArrowsMaximize,
} from "@tabler/icons-vue";
import type { SubsonicClient } from "../api";
import {
  current, playing, time, lastNavDirection, duration, toggle, next, prev, seek,
  shuffle, repeat, volume, muted, toggleShuffle, cycleRepeat, setVolume, toggleMute,
} from "../player";
import { fmt } from "../format";
import Slider from "./Slider.vue";
import Heart from "./Heart.vue";
import AudioInfo from "./AudioInfo.vue";
import { queueOpen, lyricsOpen, panelOpen, toggleQueue, toggleLyrics, bp, setNowPlayingOpen } from "../store";

defineProps<{ client: SubsonicClient }>();

const ctl = "p-2 rounded-full";
const narrow = computed(() => bp() === "narrow");
// サイドバー幅（wide=15rem / medium=4rem レール / narrow=なし）に合わせて左端を決める
const left = computed(() => (bp() === "wide" ? "left-64" : bp() === "medium" ? "left-20" : "left-4"));
// 右パネルが本文を押し出すのは wide/medium のとき。narrow では本文に重なるのでバーは動かさない
const right = computed(() => (panelOpen() && !narrow.value ? "right-[21rem]" : "right-4"));
const song = computed(() => current());

const footer = ref<HTMLElement | null>(null);
const info = ref<HTMLElement | null>(null);
const playBtn = ref<HTMLElement | null>(null);

// 音量: 音量アイコンにホバーすると、歌詞/キューのアイコンの位置にスライダーを重ねて表示する
const volHover = ref(false);
const cluster = ref<HTMLDivElement | null>(null);
let dragging = false;
const { present: sliderPresent, setEl: sliderRef } = usePresence(
  () => volHover.value,
  { keyframes: [{ opacity: 0, transform: "translateX(10px)" }, { opacity: 1, transform: "none" }], options: { duration: 180 } },
  { keyframes: [{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateX(10px)" }], options: { duration: 140 } },
);
const startDrag = () => {
  dragging = true;
  const end = () => {
    dragging = false;
    window.removeEventListener("pointerup", end);
    if (!cluster.value?.matches(":hover")) volHover.value = false; // ドラッグ中に外へ出ていたら、離したときに閉じる
  };
  window.addEventListener("pointerup", end);
};
const onLeave = () => { if (!dragging) volHover.value = false; };
const onWheel = (e: WheelEvent) => { if (volHover.value) setVolume(volume() - Math.sign(e.deltaY) * 0.05); };

// 曲が変わったら曲名・アーティスト名をふわっと切り替える（ジャケットは動かさない）
// 「次へ」なら右から、「前へ」なら左から入ってくる。それ以外（曲を選んだとき）は下からふわっと
watch(() => current()?.id, () => {
  if (!info.value) return;
  const dir = lastNavDirection();
  const from = dir === "next" ? "translateX(28px)" : dir === "prev" ? "translateX(-28px)" : "translateY(6px)";
  animate(info.value, [{ opacity: 0.2, transform: from }, { opacity: 1, transform: "none" }], { duration: dir ? 380 : 320, easing: "cubic-bezier(0.22, 1, 0.36, 1)" });
}, { flush: "post" });
// 再生/一時停止でボタンをポンと弾ませる
watch(playing, () => {
  if (playBtn.value) animate(playBtn.value, [{ transform: "scale(.8)" }, { transform: "scale(1.08)", offset: 0.6 }, { transform: "scale(1)" }], { duration: 260, fill: "none" });
}, { flush: "post" });
// キューパネルの開閉に合わせて右端をなめらかに動かす
watch(panelOpen, (open) => {
  if (footer.value && !narrow.value) animate(footer.value, [{ right: open ? "1rem" : "21rem" }, { right: open ? "21rem" : "1rem" }], { duration: open ? 300 : 260, fill: "none" });
}, { flush: "post" });
const toggled = (on: boolean) => (on ? "text-accent" : "text-white/50 hover:text-white");
</script>

<template>
  <footer
    v-if="song"
    ref="footer"
    v-enter="{ y: 28, duration: 420 }"
    :class="`absolute ${left} ${right} bottom-4 h-[76px] rounded-2xl bg-neutral-800/70 backdrop-blur-2xl border border-white/10 shadow-2xl shadow-black/50 grid items-center px-4 ${narrow ? 'grid-cols-[minmax(0,1fr)_auto_auto] gap-2' : 'grid-cols-[1fr_minmax(0,1.4fr)_1fr] gap-4'}`"
  >
    <div class="flex items-center gap-3 min-w-0">
      <img v-if="song.coverArt" :src="client.coverUrl(song.coverArt, 100)" class="size-12 rounded-md object-cover shadow cursor-pointer" alt="" title="再生中画面を開く" @click="setNowPlayingOpen(true)" />
      <div v-else class="size-12 rounded-md bg-white/10" />
      <div ref="info" class="min-w-0">
        <div class="text-sm font-medium truncate">{{ song.title }}</div>
        <div class="text-xs text-white/50 truncate">{{ song.artist }}</div>
      </div>
      <Heart :client="client" kind="song" :item="song" always />
    </div>

    <div class="flex flex-col items-center gap-0.5">
      <div class="flex items-center gap-1">
        <button :class="`${ctl} ${toggled(shuffle())} ${narrow ? 'hidden' : ''}`" title="シャッフル" @click="toggleShuffle"><IconArrowsShuffle :size="17" /></button>
        <button :class="ctl" @click="prev"><IconPlayerSkipBackFilled :size="20" /></button>
        <button ref="playBtn" :class="`${ctl} hover:bg-white/10`" @click="toggle">
          <IconPlayerPauseFilled v-if="playing()" :size="26" />
          <IconPlayerPlayFilled v-else :size="26" />
        </button>
        <button :class="ctl" @click="next"><IconPlayerSkipForwardFilled :size="20" /></button>
        <button :class="`${ctl} ${toggled(repeat() !== 'off')} ${narrow ? 'hidden' : ''}`" title="リピート" @click="cycleRepeat">
          <IconRepeatOnce v-if="repeat() === 'one'" :size="17" />
          <IconRepeat v-else :size="17" />
        </button>
      </div>
      <div :class="narrow ? 'absolute left-5 right-5 bottom-1.5' : 'flex items-center gap-2 w-full text-[11px] text-white/50 tabular-nums'">
        <span v-if="!narrow" class="w-9 text-right">{{ fmt(time()) }}</span>
        <Slider class="flex-1 w-full" :value="time()" :max="duration() || song.duration" @input="seek" />
        <span v-if="!narrow" class="w-9">{{ fmt(duration() || song.duration) }}</span>
      </div>
    </div>

    <div
      ref="cluster"
      class="relative flex items-center justify-end gap-1"
      @mouseleave="onLeave"
      @wheel="onWheel"
    >
      <div :class="`flex items-center gap-1 transition-opacity duration-200 ${volHover ? 'opacity-0 pointer-events-none' : ''}`">
        <AudioInfo />
        <button :class="`p-2 rounded-full text-white/60 hover:text-white ${narrow ? 'hidden' : ''}`" title="再生中画面" @click="setNowPlayingOpen(true)">
          <IconArrowsMaximize :size="20" />
        </button>
        <button :class="`p-2 rounded-full ${lyricsOpen() ? 'text-accent' : 'text-white/60 hover:text-white'}`" title="歌詞" @click="toggleLyrics">
          <IconQuote :size="20" />
        </button>
        <button :class="`p-2 rounded-full ${queueOpen() ? 'text-accent' : 'text-white/60 hover:text-white'}`" title="キュー" @click="toggleQueue">
          <IconListNumbers :size="20" />
        </button>
      </div>
      <div v-if="sliderPresent" :ref="sliderRef" class="absolute right-10 top-1/2 -translate-y-1/2 w-44 h-9 flex items-center rounded-full bg-white/10 px-4" @pointerdown="startDrag">
        <Slider class="w-full" :max="1" :step="0.01" :value="muted() ? 0 : volume()" @input="setVolume" />
      </div>
      <button :class="`p-2 text-white/60 hover:text-white ${narrow ? 'hidden' : ''}`" title="ミュート" @mouseenter="volHover = true" @click="toggleMute">
        <IconVolume3 v-if="muted() || volume() <= 0" :size="20" />
        <IconVolume v-else-if="volume() > 0.5" :size="20" />
        <IconVolume2 v-else :size="20" />
      </button>
    </div>
  </footer>
</template>
