<script setup lang="ts">
// "Mostra le altre N" / "Mostra meno" (PIP-369).
//
// Sta in un posto solo perche' lo usano tutti e quattro gli elenchi, e perche'
// il conteggio nel testo e' la parte che conta: un bottone che dice solo
// "Mostra altre" non fa capire se dietro ce ne sono due o quarantadue.
withDefaults(
  defineProps<{
    hidden: number
    expanded: boolean
    /** Plurale e singolare: "gare"/"gara", "persone"/"persona". */
    noun?: string
    nounOne?: string
  }>(),
  { noun: "righe", nounOne: "riga" },
);

defineEmits<{ toggle: [] }>();
</script>

<template>
  <button
    v-if="hidden > 0 || expanded"
    type="button"
    class="pwc-more"
    @click="$emit('toggle')"
  >
    <template v-if="expanded">Mostra meno</template>
    <template v-else-if="hidden === 1">Mostra ancora 1 {{ nounOne }}</template>
    <template v-else>Mostra le altre {{ hidden }} {{ noun }}</template>
  </button>
</template>

<style lang="scss">
@use "@/assets/scss/variables" as *;

.pwc-more {
  justify-self: start;
  margin-top: 10px;
  padding: 8px 0;
  border: 0;
  background: none;
  color: $text-secondary;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}
.pwc-more:hover { color: $racing-orange; }
</style>
