<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{ value: number; max: number; step?: number }>();
const emit = defineEmits<{ input: [v: number] }>();
const pct = computed(() => (props.max > 0 ? Math.min(100, (props.value / props.max) * 100) : 0));
</script>

<template>
  <input
    type="range"
    min="0"
    :max="max"
    :step="step ?? 1"
    :value="value"
    class="slider"
    :style="{ '--p': `${pct}%` }"
    @input="emit('input', +($event.target as HTMLInputElement).value)"
  />
</template>
