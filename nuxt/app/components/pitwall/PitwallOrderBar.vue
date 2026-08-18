<script setup lang="ts">
// ============================================
// PitwallOrderBar - la riga di comando della pitwall.
// Stato dell'ordine, elenco di cio' che sto cambiando, e l'unica azione
// primaria della pagina. Non riassume l'ordine intero: quello e' gia'
// tutto a schermo nelle schede sotto.
// ============================================

import { computed } from 'vue'
import PitwallSyncStrip from '~/components/pitwall/PitwallSyncStrip.vue'
import { formatStopDuration, type PitwallField, type PitwallOrderStatus, type PitwallStopEstimate } from '~/utils/pitwallPresentation'

const props = defineProps<{
  status: PitwallOrderStatus
  chips: { field: PitwallField, label: string, value: string, delta: string }[]
  stop: PitwallStopEstimate
  canSend: boolean
}>()

const stopLabel = computed(() => formatStopDuration(props.stop.seconds))

/** Il dettaglio delle voci sta nel title: serve solo a chi chiede "perche' tanto?". */
const stopBreakdown = computed(() => (props.stop.parts.length
  ? props.stop.parts.map(part => `${part.label}: ${part.seconds.toFixed(1).replace('.', ',')} s`).join(' · ')
  : 'Nessun servizio richiesto'))

const emit = defineEmits<{ send: [] }>()
</script>

<template>
  <header class="orderbar">
    <!--
      Nessun titolo visibile: la navbar ha gia' PITWALL attivo e sottolineato
      a pochi pixel da qui. Resta solo per chi naviga con screen reader.
    -->
    <h1 class="sr-only">
      Pitwall
    </h1>

    <PitwallSyncStrip :status="status" />

    <ul class="changes">
      <li
        v-for="chip in chips"
        :key="chip.field"
        class="changes__item"
      >
        <span>{{ chip.label }}</span>
        <strong>{{ chip.value }}</strong>
        <em v-if="chip.delta">{{ chip.delta }}</em>
      </li>
    </ul>

    <p
      v-if="stop.seconds > 0"
      class="stop"
      :title="stopBreakdown"
    >
      <span>Sosta</span>
      <strong>{{ stopLabel }}</strong>
    </p>

    <UiBaseButton
      variant="primary"
      :disabled="!canSend"
      @click="emit('send')"
    >
      Invia alla macchina
    </UiBaseButton>
  </header>
</template>

<style lang="scss" scoped>
.orderbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  background: linear-gradient(145deg, rgba(26, 26, 36, 0.98), rgba(12, 12, 18, 0.98));
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

/* Solo le voci che cambiano: il resto e' gia' visibile nelle schede. */
.changes {
  display: flex;
  flex: 1;
  flex-wrap: wrap;
  gap: 6px;
  margin: 0;
  padding: 0;
  min-width: 0;
  list-style: none;
}

.changes__item {
  display: flex;
  align-items: baseline;
  gap: 5px;
  padding: 5px 9px;
  border: 1px solid rgba(var(--accent-rgb), 0.35);
  border-radius: 8px;
  background: rgba(var(--accent-rgb), 0.1);
  white-space: nowrap;
}

.changes__item span {
  color: rgba(255, 255, 255, 0.5);
  font-size: 9px;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.changes__item strong {
  color: #fff;
  font-size: 13px;
  font-weight: 800;
}

.changes__item em {
  color: var(--accent);
  font-size: 11px;
  font-style: normal;
  font-weight: 900;
}

/* Quanto resta fermo il pilota: il numero che l'ingegnere dice alla radio. */
.stop {
  display: flex;
  flex: none;
  align-items: baseline;
  gap: 6px;
  margin: 0;
  padding: 5px 10px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  white-space: nowrap;
}

.stop span {
  color: rgba(255, 255, 255, 0.5);
  font-size: 9px;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.stop strong {
  color: #fff;
  font-size: 15px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}

</style>
