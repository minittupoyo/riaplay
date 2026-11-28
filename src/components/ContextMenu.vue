<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { closeContextMenu, contextMenu } from "../contextMenu";
import { animate } from "../motion";
import SongMenuPanel from "./SongMenuPanel.vue";

const W = 240; // w-60
const MARGIN = 8;

const el = ref<HTMLDivElement | null>(null);

// 右端に収まらないときは左へ、下半分で開いたときは上へ伸ばす（プレイリスト一覧の展開で高さが変わるため）
const view = computed(() => {
  const m = contextMenu();
  if (!m) return null;
  const left = Math.max(MARGIN, Math.min(m.x, window.innerWidth - W - MARGIN));
  const down = m.y < window.innerHeight / 2;
  const style = { left: `${left}px`, ...(down ? { top: `${m.y}px` } : { bottom: `${window.innerHeight - m.y}px` }) };
  return { m, down, style };
});

// 開くたび（位置が変わるたび）に登場アニメーション
watch(contextMenu, () => {
  if (el.value) animate(el.value, [{ opacity: 0, transform: "scale(.94)" }, { opacity: 1, transform: "none" }], { duration: 130 });
}, { flush: "post" });

// 入力欄などテキストを扱う場所では標準メニューを残し、それ以外では標準メニューを出さない
const onCtx = (e: MouseEvent) => {
  // 行・カードの右クリックは、それぞれがメニューを開く（ここへ届く前に処理済み）。ここへ届くのはそれ以外
  const t = e.target as HTMLElement | null;
  if (t?.closest("input, textarea, [contenteditable=''], [contenteditable='true'], .select-text")) return closeContextMenu();
  e.preventDefault();
  closeContextMenu();
};
const onDown = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest("[data-context-menu]")) closeContextMenu(); };
const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeContextMenu(); };
// ホイールで画面をスクロールしたら、位置がずれるので閉じる（歌詞などの自動スクロールでは閉じない）
const onWheel = (e: WheelEvent) => { if (!(e.target as HTMLElement).closest("[data-context-menu]")) closeContextMenu(); };

onMounted(() => {
  document.addEventListener("contextmenu", onCtx);
  document.addEventListener("mousedown", onDown);
  document.addEventListener("keydown", onKey);
  window.addEventListener("resize", closeContextMenu);
  window.addEventListener("blur", closeContextMenu);
  document.addEventListener("wheel", onWheel, { passive: true });
});
onBeforeUnmount(() => {
  document.removeEventListener("contextmenu", onCtx);
  document.removeEventListener("mousedown", onDown);
  document.removeEventListener("keydown", onKey);
  window.removeEventListener("resize", closeContextMenu);
  window.removeEventListener("blur", closeContextMenu);
  document.removeEventListener("wheel", onWheel);
});
</script>

<template>
  <div
    v-if="view"
    ref="el"
    data-context-menu
    :class="`fixed z-[90] w-60 rounded-xl bg-neutral-800/95 backdrop-blur-xl border border-white/10 shadow-2xl shadow-black/60 p-1 text-white font-normal ${view.down ? 'origin-top-left' : 'origin-bottom-left'}`"
    :style="view.style"
    @contextmenu.prevent
  >
    <SongMenuPanel :client="view.m.client" :songs="view.m.songs" :remove-action="view.m.onRemove" :close="closeContextMenu" play />
  </div>
</template>
