<script setup lang="ts">
// ============================================
// Una casella del Pit MFD, con i tre stati che ha davvero.
//
// Sì accendi, No spegni, — non toccare. La distinzione fra "No" e "—" non e'
// un dettaglio: prima la casella era booleana e vuota significava "non
// toccare", quindi l'ingegnere non aveva **nessun modo** di spegnere una
// riparazione gia' attiva. Cio' che impostava non era riportato fedelmente
// nella macchina, ed e' il difetto che questo controllo chiude.
// ============================================

defineProps<{
  /** Nome della voce, come compare nel Pit MFD del pilota. */
  label: string
  modelValue: boolean | null
  /** Cosa risulta adesso in macchina, se lo sappiamo: mostrato come eco. */
  carValue?: boolean | null
}>()

defineEmits<{ 'update:modelValue': [value: boolean | null] }>()

const OPTIONS: { value: boolean | null, label: string, title: string }[] = [
  { value: null, label: '—', title: 'Non toccare questa voce' },
  { value: true, label: 'Sì', title: 'Accendi' },
  { value: false, label: 'No', title: 'Spegni' },
]
</script>

<template>
  <div class="toggle-field" role="group" :aria-label="label">
    <span class="toggle-field__label">{{ label }}</span>
    <div class="toggle-field__options">
      <button
        v-for="option in OPTIONS"
        :key="String(option.value)"
        type="button"
        class="toggle-field__option"
        :class="{ 'is-selected': modelValue === option.value }"
        :aria-pressed="modelValue === option.value"
        :title="option.title"
        @click="$emit('update:modelValue', option.value)"
      >{{ option.label }}</button>
    </div>
  </div>
</template>

<style scoped>
.toggle-field {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.toggle-field__label {
  font-size: 0.78rem;
  color: var(--pitwall-text-muted, #9aa4b2);
  white-space: nowrap;
}

.toggle-field__options {
  display: inline-flex;
  border: 1px solid var(--pitwall-border, #2a3242);
  border-radius: 0.4rem;
  overflow: hidden;
}

.toggle-field__option {
  min-width: 2rem;
  padding: 0.15rem 0.35rem;
  border: 0;
  background: transparent;
  color: var(--pitwall-text-muted, #9aa4b2);
  font-size: 0.78rem;
  cursor: pointer;
}

.toggle-field__option + .toggle-field__option {
  border-left: 1px solid var(--pitwall-border, #2a3242);
}

.toggle-field__option:hover {
  color: var(--pitwall-text, #e6ebf2);
}

/* Acceso e spento hanno pesi diversi: spegnere una riparazione in gara e' una
   decisione, non un ripiego, e deve vedersi quanto l'accensione. */
.toggle-field__option.is-selected {
  background: var(--pitwall-accent, #7c5cff);
  color: #fff;
  font-weight: 600;
}
</style>
