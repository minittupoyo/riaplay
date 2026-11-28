<script setup lang="ts" generic="T extends string | number">
/** 横並びの選択肢（セグメントコントロール） */
defineProps<{ value: T; options: { value: T; label: string }[] }>();
const emit = defineEmits<{ change: [v: T] }>();
</script>

<template>
  <div role="radiogroup" class="inline-flex flex-wrap rounded-xl bg-white/10 p-0.5">
    <button
      v-for="o in options"
      :key="o.value"
      role="radio"
      :aria-checked="value === o.value"
      :class="['rounded-[10px] px-3.5 py-1.5 text-sm font-medium whitespace-nowrap', value === o.value ? 'bg-white/20 text-white shadow' : 'text-white/60 hover:text-white']"
      @click="emit('change', o.value)"
    >
      {{ o.label }}
    </button>
  </div>
</template>
