<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { IconInfoCircle } from "@tabler/icons-vue";
import { vEnter } from "../motion";
import { audioInfo, isTranscoded } from "../player";
import { settings } from "../settings";

const channelLabel = (n: number) => (n === 1 ? "モノラル" : n === 2 ? "ステレオ" : `${n} ch`);
const khz = (hz: number) => `${+(hz / 1000).toFixed(1)} kHz`;

/** 再生中ストリームの技術情報。libmpv で再生しているとき（情報が届くとき）だけボタンを出す */
const open = ref(false);
const root = ref<HTMLDivElement | null>(null);
const away = (e: PointerEvent) => { if (!root.value?.contains(e.target as Node)) open.value = false; };
onMounted(() => window.addEventListener("pointerdown", away));
onBeforeUnmount(() => window.removeEventListener("pointerdown", away));

const rows = computed(() => {
  const i = audioInfo();
  if (!i) return [];
  const r: [string, string][] = [];
  if (i.codec) r.push(["コーデック", i.codec.toUpperCase()]);
  if (i.format && i.format !== i.codec) r.push(["コンテナ", i.format]);
  if (i.sampleRate) r.push(["サンプルレート", khz(i.sampleRate)]);
  if (i.channels) r.push(["チャンネル", channelLabel(i.channels)]);
  if (i.bitrate) r.push(["ビットレート", `${Math.round(i.bitrate / 1000)} kbps`]);
  r.push(["配信", isTranscoded() ? `トランスコード（最大 ${settings().maxBitRate} kbps）` : "原音"]);
  return r;
});
</script>

<template>
  <div v-if="settings().showAudioInfo && audioInfo()?.codec" ref="root" class="relative">
    <button :class="['p-2 rounded-full', open ? 'text-accent' : 'text-white/60 hover:text-white']" title="音声の情報" @click="open = !open">
      <IconInfoCircle :size="20" />
    </button>
    <div
      v-if="open"
      v-enter="{ y: 8, duration: 200 }"
      class="absolute bottom-full right-0 mb-4 w-64 rounded-xl bg-neutral-800/90 backdrop-blur-2xl border border-white/10 shadow-2xl shadow-black/50 p-3 text-xs"
    >
      <div class="text-white/50 mb-2">音声の情報</div>
      <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
        <template v-for="[k, v] in rows" :key="k">
          <dt class="text-white/50">{{ k }}</dt>
          <dd class="text-right tabular-nums">{{ v }}</dd>
        </template>
      </dl>
    </div>
  </div>
</template>
