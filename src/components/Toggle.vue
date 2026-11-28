<script setup lang="ts">
/** オン/オフのスイッチ */
defineProps<{ value: boolean; label?: string }>();
const emit = defineEmits<{ change: [v: boolean] }>();
</script>

<template>
  <button
    role="switch"
    :aria-checked="value"
    :aria-label="label"
    :class="['relative w-11 h-6 rounded-full transition-colors', value ? 'bg-accent' : 'bg-white/20']"
    @click="emit('change', !value)"
  >
    <span :class="['absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform', value ? 'translate-x-5' : '']" />
  </button>
</template>
