<script setup lang="ts">
import { computed, ref, watch, watchEffect } from "vue";
import { IconX, IconMicrophone2Off, IconLanguage } from "@tabler/icons-vue";
import { current, currentTime, seek } from "../player";
import { LyricsAnimator, type LyricLine } from "../lyricsAnimator";
import { setLyricsOpen } from "../store";
import { fetchLyrics, type Lyrics } from "../lyrics";
import { settings, updateSettings } from "../settings";
import { romanize } from "../romanize";
import { useResource } from "../reactive";
import type { Song, SubsonicClient } from "../api";

const SKELETON = ["72%", "55%", "84%", "40%", "66%", "78%", "50%", "70%"]; // 取得中に出す仮の行の幅
const INTRO_MIN = 4; // 最初の行までこの秒数以上あれば、冒頭に間奏を表示する

interface ViewLine { time: number; end: number; text: string; sub?: string }

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

// ローマ字表示: 原文の行 → 変換後。変換が済むまでは原文のまま出す
const romaji = ref<Record<string, string>>({});
watch([lyrics, () => settings().lyricsRomaji], async ([l, on], _, onCleanup) => {
  romaji.value = {};
  if (!l || !on) return;
  let stale = false;
  onCleanup(() => { stale = true; });
  const src = [...new Set([...(l.synced ?? []).map((x) => x.text), ...(l.plain?.split("\n") ?? [])].filter(Boolean))];
  try {
    const out = await romanize(src);
    if (!stale) romaji.value = Object.fromEntries(src.map((s, i) => [s, out[i]]));
  } catch (e) {
    console.error("romanize failed", e);
  }
}, { immediate: true });
// 原文と同じ（日本語を含まない）行にはローマ字を添えない
const romajiOf = (t: string) => { const r = romaji.value[t]; return r && r !== t ? r : undefined; };

// アニメーターは原文だけに依存させ、ローマ字の切り替えでは作り直さない（作り直しを待たずに再計算できるように）
const baseView = computed(() => toView(lyrics.value?.synced));
const view = computed(() => baseView.value?.map((l) => ({ ...l, sub: romajiOf(l.text) })));
const plainLines = computed(() => lyrics.value?.plain?.split("\n").map((text) => ({ text, sub: romajiOf(text) })) ?? []);
const above = computed(() => settings().lyricsRomajiPosition === "above");

// 同期歌詞のアニメーション（再生位置・スクロール・ぼかし・発光）は LyricsAnimator が担当
const scroller = ref<HTMLDivElement | null>(null);
let animator: LyricsAnimator | undefined;
watchEffect((onCleanup) => {
  const v = baseView.value;
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
watch(() => settings().lyricsBlur, () => animator?.applyBlurs());
// ローマ字の表示・位置を変えると行の高さが変わるので、DOM の更新直後にスクロール位置を取り直す
watch([romaji, () => settings().lyricsRomaji, () => settings().lyricsRomajiPosition], () => animator?.relayout(), { flush: "post" }); // ぼかし設定の変更を即反映
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
        <div class="flex items-center gap-1">
        <button
          :class="`p-1.5 rounded-full ${settings().lyricsRomaji ? 'text-accent bg-white/10' : 'text-white/60 hover:text-white hover:bg-white/10'}`"
          title="ローマ字で表示"
          :aria-pressed="settings().lyricsRomaji"
          @click="updateSettings({ lyricsRomaji: !settings().lyricsRomaji })"
        ><IconLanguage :size="18" /></button>
        <button class="p-1.5 rounded-full text-white/60 hover:text-white hover:bg-white/10" @click="setLyricsOpen(false)"><IconX :size="18" /></button>
        </div>
      </div>
      <div v-else class="flex justify-end px-4 pt-3 pb-1">
        <button
          :class="`p-1.5 rounded-full ${settings().lyricsRomaji ? 'text-accent bg-white/10' : 'text-white/60 hover:text-white hover:bg-white/10'}`"
          title="ローマ字で表示"
          :aria-pressed="settings().lyricsRomaji"
          @click="updateSettings({ lyricsRomaji: !settings().lyricsRomaji })"
        ><IconLanguage :size="18" /></button>
      </div>
      <div ref="scroller" :class="`flex-1 overflow-y-scroll px-4 ${embedded ? '' : 'fade-y-sm'}`">
        <p v-if="!current()" :class="msg">曲を再生すると歌詞が表示されます</p>
        <p v-else-if="!settings().lyricsEnabled" :class="msg">歌詞の取得がオフになっています。設定の「歌詞」から有効にできます。</p>
        <template v-else>
          <div v-if="loading" class="pt-2" role="status" aria-label="歌詞を取得中">
            <div v-for="(w, i) in SKELETON" :key="i" class="lyric-skel"><span class="lyric-skel-bar" :style="{ width: w, animationDelay: `${i * 90}ms` }" /></div>
          </div>
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
                <template v-if="line.text">
                  <span v-if="line.sub && above" class="lyric-text lyric-sub">{{ line.sub }}</span>
                  <span class="lyric-text">{{ line.text }}</span>
                  <span v-if="line.sub && !above" class="lyric-text lyric-sub">{{ line.sub }}</span>
                </template>
                <div v-else class="lyric-collapse">
                  <span class="lyric-dots"><i /><i /><i /></span>
                </div>
              </li>
              <li :class="`${credit} pt-6 pb-[35vh]`">歌詞提供: {{ lyrics.source }}</li>
            </ul>
            <template v-else-if="lyrics.plain">
              <div class="text-[15px] leading-8 text-white/80">
                <p v-for="(l, i) in plainLines" :key="i" class="whitespace-pre-wrap min-h-8">
                  <span v-if="l.sub && above" class="block text-white/50 text-[13px] leading-6">{{ l.sub }}</span>{{ l.text }}<span v-if="l.sub && !above" class="block text-white/50 text-[13px] leading-6">{{ l.sub }}</span>
                </p>
              </div>
              <p :class="`${credit} pt-4 pb-8`">歌詞提供: {{ lyrics.source }}</p>
            </template>
            <p v-else :class="msg">{{ lyrics.instrumental ? "インストゥルメンタル" : "歌詞がありません" }}</p>
          </template>
        </template>
      </div>
    </div>
  </aside>
</template>
