<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import {
  IconChevronDown, IconPlayerPlayFilled, IconPlayerPauseFilled, IconPlayerSkipBackFilled, IconPlayerSkipForwardFilled,
  IconArrowsShuffle, IconRepeat, IconRepeatOnce, IconVolume, IconVolume2, IconVolume3, IconQuote, IconListNumbers,
  IconHeart, IconHeartFilled, IconX,
} from "@tabler/icons-vue";
import type { SubsonicClient } from "../api";
import {
  current, playing, toggle, next, prev,
  shuffle, repeat, volume, muted, toggleShuffle, cycleRepeat, setVolume, toggleMute,
} from "../player";
import { isFav, toggleFav } from "../favorites";
import { settings } from "../settings";
import { bp, setNowPlayingOpen } from "../store";
import Slider from "./Slider.vue";
import LyricsPanel from "./LyricsPanel.vue";
import NowPlayingQueue from "./NowPlayingQueue.vue";
import NowPlayingBackground from "./NowPlayingBackground.vue";
import NowPlayingSeekBar from "./NowPlayingSeekBar.vue";
import NowPlayingTitles from "./NowPlayingTitles.vue";

const canHover = typeof matchMedia === "function" && matchMedia("(hover: hover)").matches;

/** ウィンドウいっぱいの再生中画面。ジャケットにホバーすると操作が重なって出る。右側（狭い画面では切り替え）に歌詞かキューを出す */
defineProps<{ client: SubsonicClient }>();

type Pane = "lyrics" | "queue";
const pane = ref<Pane | null>(settings().lyricsEnabled ? "lyrics" : null);
const togglePane = (p: Pane) => { pane.value = pane.value === p ? null : p; };
const pinned = ref(false); // ホバーできない端末では、ジャケットのタップで操作を出し入れする
// 歌詞/キューの切り替えバー: ポインターが動いたときだけ出し、止まって少し経つと隠す（バーの上にいる間は出したまま）
const showSwitch = ref(false);
let hideTimer: ReturnType<typeof setTimeout> | undefined;
let overSwitch = false;
const wake = () => {
  showSwitch.value = true;
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => { if (!overSwitch) showSwitch.value = false; }, 2500);
};
const enterSwitch = () => { overSwitch = true; wake(); };
const leaveSwitch = () => { overSwitch = false; wake(); };
const narrow = computed(() => bp() === "narrow");
const close = () => setNowPlayingOpen(false);

const song = computed(() => current());

const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
onMounted(() => window.addEventListener("keydown", onKey));
onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKey);
  clearTimeout(hideTimer);
});
// 再生が無くなった（キューを空にした・サーバーを切り替えた）ら閉じる
watch(song, (s) => { if (!s) close(); }, { immediate: true });

const onCoverClick = (e: MouseEvent) => {
  if (!canHover && !(e.target as HTMLElement).closest("button, [data-keep]")) pinned.value = !pinned.value;
};

const round = "rounded-full text-white/90 hover:bg-white/20 active:scale-95 transition";
const on = (b: boolean) => (b ? "text-white" : "text-white/55");
</script>

<template>
  <section v-if="song" class="absolute inset-0 z-50 overflow-hidden flex flex-col select-none text-white bg-[#18181b]" @pointermove="wake" @pointerdown="wake">
    <NowPlayingBackground :src="client.coverUrl(song.coverArt, 64)" />

    <button class="absolute left-3 top-3 z-10 p-2 rounded-full text-white/50 hover:text-white hover:bg-white/15" title="閉じる (Esc)" @click="close">
      <IconChevronDown :size="26" />
    </button>

    <div :class="`relative flex-1 min-h-0 flex items-center justify-center gap-[clamp(2rem,5vw,6rem)] px-[clamp(1.5rem,5vw,5rem)] py-8 ${narrow ? 'flex-col' : ''}`">
      <!-- 狭い画面で歌詞・キューを出すときは、ジャケットの代わりにそれを出す -->
      <div v-if="!(narrow && pane)" :class="`flex flex-col items-center justify-center gap-4 min-h-0 ${pane && !narrow ? 'flex-[4] min-w-0' : 'w-full max-w-xl'}`">
        <div
          class="np-cover group relative aspect-square rounded-xl overflow-hidden bg-white/10 shadow-2xl shadow-black/50"
          style="width: min(100%, calc(100vh - 17rem))"
          :data-pinned="String(pinned)"
          @click="onCoverClick"
        >
          <img v-if="song.coverArt" :src="client.coverUrl(song.coverArt, 900)" class="size-full object-cover" alt="" />

          <!-- ホバー時に重ねる操作 -->
          <div class="np-controls absolute inset-0 bg-gradient-to-b from-black/45 via-black/25 to-black/55">
            <div class="absolute left-1/2 top-4 -translate-x-1/2 flex items-center gap-1 rounded-full bg-black/35 backdrop-blur-md px-2 py-1.5">
              <button :class="`p-2 ${round}`" title="閉じる" @click="close"><IconX :size="20" /></button>
            </div>

            <button
              class="absolute left-1/2 top-[40%] -translate-x-1/2 -translate-y-1/2 p-4 rounded-full hover:scale-105 active:scale-95 transition text-white drop-shadow-lg"
              :title="isFav('song', song.id) ? 'お気に入りから外す' : 'お気に入りに追加'"
              @click="toggleFav(client, 'song', song)"
            >
              <IconHeartFilled v-if="isFav('song', song.id)" :size="120" class="text-accent" />
              <IconHeart v-else :size="120" stroke="1.6" />
            </button>

            <div class="absolute inset-x-0 bottom-5 flex items-center justify-center gap-3">
              <button :class="`p-3 ${round} ${on(shuffle())}`" title="シャッフル" @click="toggleShuffle"><IconArrowsShuffle :size="22" /></button>
              <button :class="`p-3 ${round}`" @click="prev"><IconPlayerSkipBackFilled :size="30" /></button>
              <button :class="`p-3 ${round}`" @click="toggle">
                <IconPlayerPauseFilled v-if="playing()" :size="44" />
                <IconPlayerPlayFilled v-else :size="44" />
              </button>
              <button :class="`p-3 ${round}`" @click="next"><IconPlayerSkipForwardFilled :size="30" /></button>
              <button :class="`p-3 ${round} ${on(repeat() !== 'off')}`" title="リピート" @click="cycleRepeat">
                <IconRepeatOnce v-if="repeat() === 'one'" :size="22" />
                <IconRepeat v-else :size="22" />
              </button>
            </div>

            <!-- 音量（縦） -->
            <div class="absolute right-3 top-1/2 -translate-y-1/2 flex flex-col items-center gap-2 rounded-full bg-black/30 backdrop-blur-md py-3 px-1.5" data-keep>
              <div class="relative w-5 h-28">
                <div class="absolute left-1/2 top-1/2 w-28 -translate-x-1/2 -translate-y-1/2 -rotate-90">
                  <Slider class="w-full" :max="1" :step="0.01" :value="muted() ? 0 : volume()" @input="setVolume" />
                </div>
              </div>
              <button class="p-1 text-white/80 hover:text-white" title="ミュート" @click="toggleMute">
                <IconVolume3 v-if="muted() || volume() <= 0" :size="18" />
                <IconVolume v-else-if="volume() > 0.5" :size="18" />
                <IconVolume2 v-else :size="18" />
              </button>
            </div>
          </div>
        </div>

        <NowPlayingSeekBar :song="song" />
        <NowPlayingTitles :song="song" />
      </div>

      <div v-if="pane" :class="`min-h-0 min-w-0 flex flex-col ${narrow ? 'flex-1 w-full' : 'flex-[6] h-full'}`">
        <NowPlayingTitles v-if="narrow" :song="song" compact />
        <div v-if="pane === 'lyrics'" class="np-lyrics flex-1 min-h-0 flex flex-col"><LyricsPanel :client="client" embedded /></div>
        <NowPlayingQueue v-else :client="client" />
        <!-- ジャケットが無いときの最小限の操作 -->
        <div v-if="narrow" class="flex flex-col gap-2 pt-2">
          <NowPlayingSeekBar :song="song" />
          <div class="flex items-center justify-center gap-4">
            <button :class="`p-2 ${round}`" @click="prev"><IconPlayerSkipBackFilled :size="26" /></button>
            <button :class="`p-2 ${round}`" @click="toggle">
              <IconPlayerPauseFilled v-if="playing()" :size="36" />
              <IconPlayerPlayFilled v-else :size="36" />
            </button>
            <button :class="`p-2 ${round}`" @click="next"><IconPlayerSkipForwardFilled :size="26" /></button>
          </div>
        </div>
      </div>
    </div>

    <!-- 右下: 歌詞 / キューの切り替え -->
    <div
      :class="`absolute right-4 bottom-4 z-10 flex items-center gap-1 rounded-full bg-black/30 backdrop-blur-md p-1.5 transition-opacity duration-300 ${showSwitch ? 'opacity-100' : 'opacity-0 pointer-events-none'}`"
      @pointerenter="enterSwitch"
      @pointerleave="leaveSwitch"
    >
      <button :class="`p-2 rounded-full ${pane === 'lyrics' ? 'bg-white/25 text-white' : 'text-white/70 hover:text-white hover:bg-white/15'}`" title="歌詞" @click="togglePane('lyrics')"><IconQuote :size="20" /></button>
      <button :class="`p-2 rounded-full ${pane === 'queue' ? 'bg-white/25 text-white' : 'text-white/70 hover:text-white hover:bg-white/15'}`" title="キュー" @click="togglePane('queue')"><IconListNumbers :size="20" /></button>
    </div>
  </section>
</template>
