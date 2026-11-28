<script setup lang="ts">
import { ref } from "vue";
import { IconServer, IconUser, IconLock, IconLoader2, IconAlertCircle, IconTag, IconShieldLock } from "@tabler/icons-vue";
import type { ServerInput } from "../servers";
import { animate } from "../motion";

/** サーバー接続情報の入力フォーム。onSubmit が例外を投げたらエラー表示してフォームを揺らす */
const props = defineProps<{
  initial?: Partial<ServerInput>;
  /** 編集時: パスワード欄を空にすると既存のパスワードを保つ */
  passwordOptional?: boolean;
  notice?: string;
  submitLabel: string;
  onSubmit: (v: ServerInput) => Promise<void>;
  onCancel?: () => void;
}>();

const name = ref(props.initial?.name ?? "");
const url = ref(props.initial?.url ?? "");
const username = ref(props.initial?.username ?? "");
const password = ref(props.initial?.password ?? "");
const remember = ref(props.initial?.remember ?? true);
const busy = ref(false);
const error = ref("");
const form = ref<HTMLFormElement | null>(null);

const submit = async () => {
  busy.value = true;
  error.value = "";
  try {
    await props.onSubmit({ name: name.value, url: url.value.trim(), username: username.value.trim(), password: password.value, remember: remember.value });
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
    if (form.value) animate(form.value, [0, -10, 10, -6, 6, 0].map((x) => ({ transform: `translateX(${x}px)` })), { duration: 380, fill: "none" });
  } finally {
    busy.value = false;
  }
};

const field = "flex items-center gap-2 rounded-xl bg-white/10 px-3 focus-within:ring-2 focus-within:ring-accent/70";
const input = "w-full bg-transparent py-2.5 outline-none placeholder:text-white/40 select-text";
</script>

<template>
  <form ref="form" class="space-y-4" @submit.prevent="submit">
    <label :class="field">
      <IconTag :size="18" class="text-white/40" />
      <input v-model="name" :class="input" placeholder="表示名（任意）" />
    </label>
    <label :class="field">
      <IconServer :size="18" class="text-white/40" />
      <input v-model="url" :class="input" type="url" required placeholder="https://music.example.com" />
    </label>
    <label :class="field">
      <IconUser :size="18" class="text-white/40" />
      <input v-model="username" :class="input" required placeholder="ユーザー名" autocomplete="username" />
    </label>
    <label :class="field">
      <IconLock :size="18" class="text-white/40" />
      <input
        v-model="password"
        :class="input"
        type="password"
        :required="!passwordOptional"
        :placeholder="passwordOptional ? 'パスワード（変更しない場合は空欄）' : 'パスワード'"
        autocomplete="current-password"
      />
    </label>
    <label class="flex items-start gap-2.5 px-1 cursor-pointer">
      <input v-model="remember" type="checkbox" class="mt-0.5 size-4 accent-[var(--color-accent)]" />
      <span class="text-sm">
        パスワードを保存する
        <span class="flex items-center gap-1 text-xs text-white/40 mt-0.5"><IconShieldLock :size="13" />OS のキーチェーンに暗号化して保存します。外すと起動のたびに入力が必要です</span>
      </span>
    </label>
    <p v-if="notice" class="text-sm text-white/60 px-1">{{ notice }}</p>
    <p v-if="error" class="flex items-center gap-2 text-sm text-accent"><IconAlertCircle :size="16" />{{ error }}</p>
    <div class="flex gap-3 pt-1">
      <button v-if="onCancel" type="button" :disabled="busy" class="flex-1 rounded-xl bg-white/10 hover:bg-white/15 py-2.5 font-medium" @click="onCancel">キャンセル</button>
      <button :disabled="busy" class="flex-1 flex items-center justify-center gap-2 rounded-xl bg-accent hover:brightness-110 disabled:opacity-60 py-2.5 font-medium">
        <IconLoader2 v-if="busy" :size="18" class="animate-spin" />
        {{ submitLabel }}
      </button>
    </div>
  </form>
</template>
