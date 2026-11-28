<script setup lang="ts">
import { computed, shallowRef, watch } from "vue";
import { IconServer } from "@tabler/icons-vue";
import { SubsonicClient } from "../api";
import { usePresence, vPop } from "../motion";
import { addServer, getPassword, servers, serverDialog, setActive, setServerDialog, updateServer, type ServerDialogState, type ServerInput } from "../servers";
import LoginForm from "./LoginForm.vue";

/** サーバーの追加・編集ダイアログ。接続確認（ping）に成功したときだけ保存する */
const open = () => serverDialog() !== null;
const close = () => setServerDialog(null);
const { present, setEl } = usePresence(
  open,
  { keyframes: [{ opacity: 0 }, { opacity: 1 }], options: { duration: 180 } },
  { keyframes: [{ opacity: 1 }, { opacity: 0 }], options: { duration: 140 } },
);
// 閉じるアニメーション中も内容を保持する
const state = shallowRef<NonNullable<ServerDialogState>>({ mode: "add" });
watch(serverDialog, (v) => { if (v) state.value = v; }, { immediate: true });
const editing = computed(() => {
  const s = state.value;
  return s.mode === "edit" ? servers().find((x) => x.id === s.id) : undefined;
});
const initial = computed(() => {
  const e = editing.value;
  return e ? { name: e.name, url: e.url, username: e.username, password: "", remember: e.remember } : undefined;
});

const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
watch(open, (o, _old, onCleanup) => {
  if (!o) return;
  window.addEventListener("keydown", onKey);
  onCleanup(() => window.removeEventListener("keydown", onKey));
}, { immediate: true });

const submit = async (v: ServerInput) => {
  const s = state.value;
  // 編集でパスワード欄が空なら、保存済みのパスワードで接続確認する
  const password = v.password || (s.mode === "edit" ? await getPassword(s.id) : null) || "";
  if (!password) throw new Error("パスワードを入力してください");
  await new SubsonicClient({ ...v, password }).ping(); // 失敗すると例外 → フォームにエラー表示
  if (s.mode === "edit") await updateServer(s.id, { ...v, password });
  else setActive((await addServer({ ...v, password })).id); // 追加したらそのサーバーへ切り替える（キーチェーン保存に失敗したら例外）
  close();
};
</script>

<template>
  <div v-if="present" :ref="setEl" class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <div class="absolute inset-0 bg-black/60" @click="close" />
    <div v-pop role="dialog" aria-modal="true" class="relative w-full max-w-sm rounded-2xl bg-neutral-800 border border-white/10 shadow-2xl shadow-black/60 p-6">
      <div class="flex items-center gap-3 mb-5">
        <div class="size-10 rounded-full bg-accent/15 text-accent flex items-center justify-center"><IconServer :size="22" /></div>
        <h2 class="text-lg font-semibold">{{ state.mode === "edit" ? "サーバーを編集" : "サーバーを追加" }}</h2>
      </div>
      <!-- ダイアログを開くたびに作り直されるので、初期値は開いた時点のものになる -->
      <LoginForm
        :initial="initial"
        :password-optional="state.mode === 'edit'"
        :notice="state.mode === 'edit' && !editing?.remember ? 'このサーバーのパスワードは保存されていません。接続するには入力してください。' : undefined"
        :submit-label="state.mode === 'edit' ? '保存' : '追加'"
        :on-submit="submit"
        :on-cancel="close"
      />
    </div>
  </div>
</template>
