<script setup lang="ts">
import { ref, watch } from 'vue'

// PIP-641: the error of one field, right under it. The line opens smoothly only when there is an error (no space
// kept empty for it) and keeps its text while it closes.
const props = defineProps<{ id: string, message?: string }>()
const shown = ref(props.message ?? '')
watch(() => props.message, (message) => { if (message) shown.value = message })
</script>

<template>
  <div class="field-error" :class="{ 'is-open': !!message }">
    <div><small :id="id" :aria-hidden="!message">{{ shown }}</small></div>
  </div>
</template>

<style scoped>
.field-error { display: grid; grid-template-rows: 0fr; opacity: 0; transition: grid-template-rows 200ms ease, opacity 200ms ease; }
.field-error.is-open { grid-template-rows: 1fr; opacity: 1; }
.field-error > div { overflow: hidden; }
small { display: block; padding-top: 6px; color: #ff7a8e; font: 500 12px/1.35 'Inter', sans-serif; }
@media (prefers-reduced-motion: reduce) { .field-error { transition: none; } }
</style>
