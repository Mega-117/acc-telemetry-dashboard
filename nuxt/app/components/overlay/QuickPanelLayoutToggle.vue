<script setup lang="ts">
import { Columns2, Rows2 } from '@lucide/vue'

defineProps<{ modelValue: 'vertical' | 'horizontal' }>()
const emit = defineEmits<{ 'update:modelValue': [value: 'vertical' | 'horizontal'] }>()
</script>

<template>
  <!-- Mouse controls: intentionally omit data-overlay-wheel-action. -->
  <div class="quick-panel-layout" role="group" aria-label="Disposizione pannello">
    <button type="button" title="Layout verticale" aria-label="Layout verticale"
      :aria-pressed="modelValue === 'vertical'" @click="emit('update:modelValue', 'vertical')">
      <Rows2 :size="16" aria-hidden="true" />
    </button>
    <button type="button" title="Layout orizzontale" aria-label="Layout orizzontale"
      :aria-pressed="modelValue === 'horizontal'" @click="emit('update:modelValue', 'horizontal')">
      <Columns2 :size="16" aria-hidden="true" />
    </button>
  </div>
</template>

<style scoped>
.quick-panel-layout { display: inline-flex; gap: 2px; padding: 2px; border: 1px solid #ffffff30; }
button { display: grid; place-items: center; width: 30px; height: 28px; padding: 0; border: 0; border-radius: 0; background: transparent; color: #999; cursor: pointer; -webkit-app-region: no-drag; }
button:hover { color: #fff; background: #ffffff0d; }
button[aria-pressed="true"] { color: #fff; background: #ffffff24; box-shadow: inset 0 -2px #ff0024; }
button:focus-visible { outline: 2px solid #fff; outline-offset: -2px; }
</style>
