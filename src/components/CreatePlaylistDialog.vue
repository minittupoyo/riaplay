<script setup lang="ts">
import { nextTick, ref, watch } from "vue";
import { IconLoader2, IconPlaylistAdd, IconAlertCircle } from "@tabler/icons-vue";
import type { Playlist, SubsonicClient } from "../api";
import { usePresence, vPop } from "../motion";
import { bumpPlaylists, closeCreateDialog, createDialog } from "../store";

/** プレイリスト作成ダイアログ（アプリ全体で 1 つ。openCreateDialog() で開く） */
const props = defineProps<{ client: SubsonicClient }>();
const emit = defineEmits<{ created: [p: Playlist | null] }>();

const name = ref("");
const busy = ref(false);
const error = ref("");
const open = () => createDialog() !== null;

const { present, setEl } = usePresence(
  open,
  { keyframes: [{ opacity: 0 }, { opacity: 1 }], options: { duration: 180 } },
  { keyframes: [{ opacity: 1 }, { opacity: 0 }], options: { duration: 140 } },
);

const input = ref<HTMLInputElement | null>(null);
// 開くたびに状態を初期化して入力欄にフォーカス
watch(open, (o) => {
  if (!o) return;
  name.value = ""; error.value = ""; busy.value = false;
  void nextTick(() => input.value?.focus());
});
// Esc で閉じる
const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy.value) closeCreateDialog(); };
watch(open, (o, _old, onCleanup) => {
  if (!o) return;
  window.addEventListener("keydown", onKey);
  onCleanup(() => window.removeEventListener("keydown", onKey));
}, { immediate: true });

const submit = async () => {
  const n = name.value.trim();
  if (!n || busy.value) return;
  busy.value = true;
  error.value = "";
  try {
    const songs = (await createDialog()?.songs?.()) ?? [];
    const p = await props.client.createPlaylist(n, songs.map((s) => s.id));
    bumpPlaylists();
    closeCreateDialog();
    emit("created", p);
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
    busy.value = false;
  }
};
</script>

<template>
  <div v-if="present" :ref="setEl" class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <div class="absolute inset-0 bg-black/60" @click="!busy && closeCreateDialog()" />
    <form
      v-pop
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-playlist-title"
      class="relative w-full max-w-sm rounded-2xl bg-neutral-800 border border-white/10 shadow-2xl shadow-black/60 p-6"
      @submit.prevent="submit"
    >
      <div class="flex items-center gap-3 mb-5">
        <div class="size-10 rounded-full bg-accent/15 text-accent flex items-center justify-center"><IconPlaylistAdd :size="22" /></div>
        <h2 id="create-playlist-title" class="text-lg font-semibold">新規プレイリスト</h2>
      </div>
      <p v-if="createDialog()?.songs" class="mb-3 text-sm text-white/50">選択した曲をこのプレイリストに追加します。</p>
      <input
        ref="input"
        v-model="name"
        class="w-full rounded-xl bg-white/10 px-4 py-2.5 outline-none placeholder:text-white/40 focus:ring-2 focus:ring-accent/70 select-text"
        placeholder="プレイリスト名"
        maxlength="100"
      />
      <p v-if="error" class="mt-3 flex items-center gap-2 text-sm text-accent"><IconAlertCircle :size="16" />{{ error }}</p>
      <div class="mt-6 flex justify-end gap-3">
        <button type="button" class="rounded-lg bg-white/10 hover:bg-white/15 px-5 py-2 text-sm font-medium" :disabled="busy" @click="closeCreateDialog">キャンセル</button>
        <button type="submit" class="flex items-center gap-2 rounded-lg bg-accent hover:brightness-110 px-5 py-2 text-sm font-medium disabled:opacity-50" :disabled="!name.trim() || busy">
          <IconLoader2 v-if="busy" :size="16" class="animate-spin" />作成
        </button>
      </div>
    </form>
  </div>
</template>
