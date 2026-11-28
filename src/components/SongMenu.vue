<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { IconDots } from "@tabler/icons-vue";
import type { Song, SubsonicClient } from "../api";
import { usePresence } from "../motion";
import { openContextMenu } from "../contextMenu";
import SongMenuPanel from "./SongMenuPanel.vue";

/** 曲・アルバム・プレイリストなど、曲の集まりに対する共通メニュー。行・カード（.group）の右クリックでも同じメニューを開く */
const props = defineProps<{
  client: SubsonicClient;
  songs: () => Song[] | Promise<Song[]>;
  removeAction?: { label: string; run: () => void };
  triggerClass?: string;
}>();

const open = ref(false);
const alignLeft = ref(false); // 左に収まらないときは、ボタンの左端に揃えて右へ開く
const openUp = ref(false); // 下に収まらないときは上へ開く
const origin = computed(() =>
  openUp.value ? (alignLeft.value ? "origin-bottom-left" : "origin-bottom-right") : alignLeft.value ? "origin-top-left" : "origin-top-right",
);
const root = ref<HTMLDivElement | null>(null);

const close = () => { open.value = false; };
const { present, setEl } = usePresence(
  () => open.value,
  { keyframes: [{ opacity: 0, transform: "scale(.92)" }, { opacity: 1, transform: "none" }], options: { duration: 160 } },
  { keyframes: [{ opacity: 1, transform: "none" }, { opacity: 0, transform: "scale(.96)" }], options: { duration: 120 } },
);

const onDoc = (e: MouseEvent) => { if (!root.value?.contains(e.target as Node)) close(); };
// 属している行・カードの右クリックで、カーソル位置にメニューを出す
const onCtx = (e: MouseEvent) => {
  e.preventDefault();
  e.stopPropagation(); // 外側の行（入れ子のとき）や、全体の右クリック処理には渡さない
  close();
  openContextMenu({ x: e.clientX, y: e.clientY, client: props.client, songs: props.songs, onRemove: props.removeAction });
};
let host: HTMLElement | null = null;
onMounted(() => {
  document.addEventListener("mousedown", onDoc);
  host = root.value?.closest<HTMLElement>(".group") ?? null;
  host?.addEventListener("contextmenu", onCtx);
});
onBeforeUnmount(() => {
  document.removeEventListener("mousedown", onDoc);
  host?.removeEventListener("contextmenu", onCtx);
});

const toggle = () => {
  const el = root.value!;
  const o = !open.value;
  if (o) {
    const main = el.closest("main")?.getBoundingClientRect();
    const edge = main?.left ?? 0;
    const area = main?.bottom ?? window.innerHeight;
    const r = el.getBoundingClientRect();
    // 下端にはプレイヤーバーが重なる分も見込む。サブメニュー展開時の高さ（約 340px）まで入る余地があるか
    openUp.value = area - 100 - r.bottom < 340 && r.top - (main?.top ?? 0) > 200;
    alignLeft.value = r.right - 240 < edge + 8; // w-60 = 240px
  }
  open.value = o;
};
</script>

<template>
  <div ref="root" class="relative" @click.stop>
    <button
      :class="triggerClass ?? `p-1 rounded-full text-white/60 hover:text-white hover:bg-white/10 group-hover:opacity-100 ${open ? 'opacity-100' : 'opacity-0'}`"
      title="メニュー"
      @click.stop="toggle"
    >
      <IconDots :size="18" />
    </button>
    <div
      v-if="present"
      :ref="setEl"
      :class="`absolute z-30 w-60 ${openUp ? 'bottom-full mb-1' : 'top-full mt-1'} ${alignLeft ? 'left-0' : 'right-0'} ${origin} rounded-xl bg-neutral-800 border border-white/10 shadow-2xl shadow-black/60 p-1 text-white font-normal`"
    >
      <SongMenuPanel :client="client" :songs="songs" :remove-action="removeAction" :close="close" />
    </div>
  </div>
</template>
