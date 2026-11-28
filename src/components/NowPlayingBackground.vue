<script setup lang="ts">
/** ジャケットの色を大きくぼかして敷いた背景。同じ画像を数枚、角度と位置を変えて重ね、ゆっくり動かす */
defineProps<{ src?: string }>();
</script>

<template>
  <div class="np-bg" aria-hidden="true">
    <template v-if="src">
      <img :src="src" class="np-bg-a" alt="" />
      <img :src="src" class="np-bg-b" alt="" />
      <img :src="src" class="np-bg-c" alt="" />
    </template>
    <div class="absolute inset-0 bg-black/10" />
  </div>
</template>
