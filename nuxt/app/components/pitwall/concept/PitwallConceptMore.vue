<script setup lang="ts">
// "Mostra le altre N" / "Mostra meno" (PIP-369).
//
// Sta in un posto solo perche' lo usano tutti e quattro gli elenchi, e perche'
// il conteggio nel testo e' la parte che conta: un bottone che dice solo
// "Mostra altre" non fa capire se dietro ce ne sono due o quarantadue.
import { computed } from "vue";
import { useI18n } from "~/i18n";

const props = defineProps<{
  hidden: number
  expanded: boolean
  /** Plurale e singolare, gia' tradotti: "gare"/"gara", "persone"/"persona". */
  noun?: string
  nounOne?: string
}>();
const { t } = useI18n();
const nounMany = computed(() => props.noun ?? t("pitwallConcept.more.rows"));
const nounSingle = computed(() => props.nounOne ?? t("pitwallConcept.more.row"));

defineEmits<{ toggle: [] }>();
</script>

<template>
  <button
    v-if="hidden > 0 || expanded"
    type="button"
    class="pwc-more"
    @click="$emit('toggle')"
  >
    <template v-if="expanded">{{ t('pitwallConcept.more.less') }}</template>
    <template v-else-if="hidden === 1">{{ t('pitwallConcept.more.one', { noun: nounSingle }) }}</template>
    <template v-else>{{ t('pitwallConcept.more.many', { count: hidden, noun: nounMany }) }}</template>
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
