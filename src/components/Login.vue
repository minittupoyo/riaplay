<script setup lang="ts">
import { IconMusic } from "@tabler/icons-vue";
import type { ServerInput } from "../servers";
import { vEnter } from "../motion";
import LoginForm from "./LoginForm.vue";

/** 登録済みのサーバーが 1 つもないときだけ表示する、初回の接続画面 */
defineProps<{ onSubmit: (v: ServerInput) => Promise<void> }>();
</script>

<template>
  <main class="h-full flex items-center justify-center p-6">
    <div v-enter="{ y: 16, scale: 0.97, duration: 450 }" class="w-full max-w-sm">
      <div class="mb-8 text-center">
        <div class="mx-auto mb-4 size-16 rounded-2xl bg-gradient-to-b from-accent to-[#c4152d] flex items-center justify-center shadow-xl shadow-accent/30"><IconMusic :size="34" /></div>
        <h1 class="text-2xl font-bold">Navidromeに接続</h1>
      </div>
      <LoginForm submit-label="接続" :on-submit="onSubmit" />
    </div>
  </main>
</template>
