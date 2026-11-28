<script setup lang="ts">
import { computed, ref, watch, watchEffect } from "vue";
import { IconX, IconLoader2, IconMicrophone2Off } from "@tabler/icons-vue";
import { current, currentTime, seek } from "../player";
import { LyricsAnimator, type LyricLine } from "../lyricsAnimator";
import { setLyricsOpen } from "../store";
import { fetchLyrics, type Lyrics } from "../lyrics";
import { settings } from "../settings";
import { useResource } from "../reactive";
import type { Song, SubsonicClient } from "../api";

const INTRO_MIN = 4; // 最初の行までこの秒数以上あれば、冒頭に間奏を表示する

interface ViewLine { time: number; end: number; text: string }

/** 同期歌詞を表示用に整える: 冒頭の間奏を補い、末尾の空行（終了マーカー）は表示しない */
function toView(synced: { time: number; text: string }[] | null | undefined): ViewLine[] | null {
  if (!synced) return null;
  let last = synced.length - 1;
  while (last >= 0 && !synced[last].text) last--; // 末尾の空行は間奏として出さない
  if (last < 0) return [];
  const body = synced.slice(0, last + 1);
  const tailEnd = synced[last + 1]?.time; // 終了マーカーがあれば、最後の行の終了時刻に使う
  const out = body.map((l, i) => ({ time: l.time, text: l.text, end: i < last ? body[i + 1].time : (tailEnd ?? l.time + 5) }));
  if (out[0].text && out[0].time >= INTRO_MIN) out.unshift({ time: 0, text: "", end: out[0].time });
  return out;
}

/** embedded: 再生中画面の中に置く。幅は親に任せ、見出しと閉じるボタンは出さない */
const props = defineProps<{ client: SubsonicClient; overlay?: boolean; embedded?: boolean }>();

const { data: lyrics, loading, error } = useResource<Song, Lyrics | null>(
  () => (settings().lyricsEnabled ? current() : undefined), // 設定でオフなら外部へ問い合わせない
  (s) => fetchLyrics(s, props.client),
);
const errorMessage = computed(() => (error.value instanceof Error ? error.value.message : String(error.value)));

const view = computed(() => toView(lyrics.value?.synced));

// 同期歌詞のアニメーション（再生位置・スクロール・ぼかし・発光）は LyricsAnimator が担当
const scroller = ref<HTMLDivElement | null>(null);
let animator: LyricsAnimator | undefined;
watchEffect((onCleanup) => {
  const v = view.value;
  const sc = scroller.value;
  if (!v?.length || !sc) return;
  let dead = false;
  // 要素は DOM から直接集める（曲切り替え直後の古い参照を避ける）。描画が揃うまで待つ
  const build = () => {
    if (dead) return;
    const els = Array.from(sc.querySelectorAll<HTMLElement>("li.lyric-line"));
    if (els.length !== v.length || !els[0].isConnected || v.some((l, i) => l.text && !els[i].textContent?.includes(l.text.trim()))) return void requestAnimationFrame(build);
    const lines: LyricLine[] = v.map((l, i) => ({
      li: els[i],
      start: l.time,
      end: l.end,
      interlude: !l.text,
      dots: Array.from(els[i].querySelectorAll<HTMLElement>(".lyric-dots i")),
      group: els[i].querySelector<HTMLElement>(".lyric-dots"),
    }));
    animator = new LyricsAnimator(sc, lines, currentTime);
    animator.applyBlurs();
  };
  queueMicrotask(build);
  onCleanup(() => { dead = true; animator?.destroy(); animator = undefined; });
}, { flush: "post" });
watch(() => settings().lyricsBlur, () => animator?.applyBlurs()); // ぼかし設定の変更を即反映
// 曲が変わったら先頭へ戻す
watch(() => current()?.id, () => scroller.value?.scrollTo({ top: 0 }));

const credit = "text-[11px] text-white/25";
const msg = "text-white/40 text-sm";
</script>

<template>
  <aside
    :class="embedded ? 'flex-1 min-w-0 min-h-0 overflow-hidden flex flex-col' : `w-80 shrink-0 overflow-hidden border-l flex flex-col ${overlay ? 'absolute right-0 top-0 z-30 border-white/10 bg-[#262629] shadow-2xl shadow-black/60' : 'border-white/5 bg-white/[0.04]'}`"
    :style="!embedded && overlay ? { bottom: current() ? '6.5rem' : '0' } : undefined"
  >
    <div :class="`${embedded ? 'w-full' : 'w-80'} flex-1 min-h-0 flex flex-col`">
      <div v-if="!embedded" class="flex items-center justify-between px-4 pt-5 pb-3">
        <h2 class="text-xl font-bold">歌詞</h2>
        <button class="p-1.5 rounded-full text-white/60 hover:text-white hover:bg-white/10" @click="setLyricsOpen(false)"><IconX :size="18" /></button>
      </div>
      <div v-else class="pt-4" />
      <div ref="scroller" :class="`flex-1 overflow-y-scroll px-4 ${embedded ? '' : 'fade-y-sm'}`">
        <p v-if="!current()" :class="msg">曲を再生すると歌詞が表示されます</p>
        <p v-else-if="!settings().lyricsEnabled" :class="msg">歌詞の取得がオフになっています。設定の「歌詞」から有効にできます。</p>
        <template v-else>
          <div v-if="loading" class="flex items-center gap-2 text-white/50 text-sm"><IconLoader2 :size="16" class="animate-spin" />取得中…</div>
          <p v-if="error" class="text-accent text-sm">取得に失敗しました: {{ errorMessage }}</p>
          <template v-if="!loading && !error">
            <div v-if="!lyrics" class="flex flex-col items-center gap-2 mt-16 text-white/40"><IconMicrophone2Off :size="32" /><p class="text-sm">歌詞が見つかりません</p></div>
            <ul v-else-if="lyrics.synced" :key="current()?.id" class="pt-2">
              <li
                v-for="(line, i) in view ?? []"
                :key="i"
                :class="['lyric-line', line.text ? '' : 'interlude']"
                @click="seek(line.time)"
              >
                <span v-if="line.text" class="lyric-text">{{ line.text }}</span>
                <div v-else class="lyric-collapse">
                  <span class="lyric-dots"><i /><i /><i /></span>
                </div>
              </li>
              <li :class="`${credit} pt-6 pb-[35vh]`">歌詞提供: {{ lyrics.source }}</li>
            </ul>
            <template v-else-if="lyrics.plain">
              <p class="whitespace-pre-wrap text-[15px] leading-8 text-white/80">{{ lyrics.plain }}</p>
              <p :class="`${credit} pt-4 pb-8`">歌詞提供: {{ lyrics.source }}</p>
            </template>
            <p v-else :class="msg">{{ lyrics.instrumental ? "インストゥルメンタル" : "歌詞がありません" }}</p>
          </template>
        </template>
      </div>
    </div>
  </aside>
</template>
