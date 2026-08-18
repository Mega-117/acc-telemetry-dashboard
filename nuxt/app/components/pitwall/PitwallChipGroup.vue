<script setup lang="ts">
// ============================================
// PitwallChipGroup - una scelta a chip.
// L'eco della macchina non sta qui ma nell'intestazione della scheda:
// una riga in meno per scheda, che e' cio' che tiene tutto in un viewport.
// ============================================

defineProps<{
  groupLabel: string
  options: { value: string | null, label: string }[]
  modelValue: string | null
}>()

const emit = defineEmits<{ 'update:modelValue': [value: string | null] }>()
</script>

<template>
  <div
    class="chips"
    role="radiogroup"
    :aria-label="groupLabel"
  >
    <button
      v-for="option in options"
      :key="option.value ?? 'none'"
      type="button"
      role="radio"
      :aria-checked="modelValue === option.value"
      :class="['chip', { 'chip--active': modelValue === option.value }]"
      @click="emit('update:modelValue', option.value)"
    >
      {{ option.label }}
    </button>
  </div>
</template>

<style lang="scss" scoped>
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.chip {
  padding: 8px 12px;
  min-height: 34px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.04);
  color: rgba(255, 255, 255, 0.72);
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
  transition: border-color 0.16s ease, background 0.16s ease, color 0.16s ease;
}

/* Hover e selezione restano neutri: il colore d'accento significa solo
   "diverso da quello che ha la macchina". */
.chip:hover,
.chip:focus-visible {
  border-color: rgba(255, 255, 255, 0.4);
  color: #fff;
}

.chip--active {
  border-color: rgba(255, 255, 255, 0.5);
  background: rgba(255, 255, 255, 0.14);
  color: #fff;
}
</style>
