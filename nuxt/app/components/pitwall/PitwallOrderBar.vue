<script setup lang="ts">
import { computed } from 'vue'
import type { PitwallField, PitwallOrderStatus, PitwallStopEstimate } from '~/utils/pitwallPresentation'

const props = defineProps<{
  status: PitwallOrderStatus
  chips: { field: PitwallField, label: string, value: string, delta: string }[]
  stop: PitwallStopEstimate
  canSend: boolean
  /**
   * Perche l invio e spento, se lo e.
   *
   * Un bottone grigio senza motivo e il modo piu rapido di far sembrare rotto
   * un collegamento che funziona: in gara l ingegnere deve capire in un colpo
   * d occhio se il problema e suo, del pilota o della macchina.
   */
  blockedReason?: string | null
}>()

const stopLabel = computed(() => {
  const seconds = props.stop.seconds
  if (!Number.isFinite(seconds) || seconds <= 0) return '—'
  const minutes = Math.floor(seconds / 60)
  const rest = seconds - minutes * 60
  return `${String(minutes).padStart(2, '0')}:${rest.toFixed(3).padStart(6, '0')}`
})

const stopBreakdown = computed(() => (props.stop.parts.length
  ? props.stop.parts.map(part => `${part.label}: ${part.seconds.toFixed(1).replace('.', ',')} s`).join(' · ')
  : 'Nessun servizio richiesto'))

const emit = defineEmits<{ send: [] }>()
</script>

<template>
  <footer class="orderbar">
    <h1 class="sr-only">Pitwall</h1>

    <div class="orderbar__estimate" :title="stopBreakdown">
      <span class="orderbar__label">Tempo stop stimato</span>
      <div class="orderbar__time-row">
        <strong>{{ stopLabel }}</strong>
        <span>CALCOLATO</span>
      </div>
    </div>

    <p class="sr-only" aria-live="polite">
      <strong>{{ status.label }}</strong>
      <span v-if="chips.length">{{ chips.length }} modifiche</span>
    </p>

    <div class="orderbar__send">
      <p v-if="!canSend && blockedReason" class="orderbar__blocked" aria-live="polite">{{ blockedReason }}</p>
      <UiBaseButton variant="primary" :disabled="!canSend" @click="emit('send')">
        <span>INVIA ALLA MACCHINA</span>
        <span class="orderbar__arrow" aria-hidden="true">›</span>
      </UiBaseButton>
    </div>
  </footer>
</template>

<style lang="scss" scoped>
.orderbar {
  display: grid;
  grid-template-columns: 178px minmax(250px, 1fr);
  align-items: center;
  gap: 20px;
  padding: 10px 15px;
  border: 1px solid rgba(255, 255, 255, 0.09);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.025);
}

.orderbar__estimate {
  min-width: 0;
}

.orderbar__send {
  display: grid;
  justify-items: end;
  gap: 6px;
  min-width: 0;
}

.orderbar__blocked {
  max-width: 310px;
  margin: 0;
  color: #ffbd55;
  font-size: 11px;
  line-height: 1.4;
}

.orderbar__label {
  display: block;
  margin-bottom: 4px;
  color: #eef2f6;
  font-size: 12px;
  font-weight: 800;
}

.orderbar__time-row {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.orderbar__time-row strong {
  color: #ffd738;
  font-size: 24px;
  font-weight: 550;
  font-variant-numeric: tabular-nums;
  letter-spacing: .02em;
}

.orderbar__time-row span {
  padding: 2px 7px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 5px;
  color: #7d8793;
  font-size: 9px;
  font-weight: 800;
  letter-spacing: .05em;
}

.orderbar :deep(.base-button) {
  width: min(100%, 296px);
  min-height: 46px;
  justify-content: center;
  gap: 22px;
  border: 0;
  border-radius: 8px;
  background: linear-gradient(135deg, #7547e9, #8124f4);
  box-shadow: 0 7px 20px rgba(111, 46, 232, 0.18);
  color: #fff;
  font-size: 12px;
  font-weight: 850;
  letter-spacing: .015em;
}

.orderbar :deep(.base-button:hover:not(:disabled)) {
  filter: brightness(1.08);
}

.orderbar__arrow {
  font-size: 28px;
  font-weight: 300;
  line-height: .5;
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

@media (max-width: 720px) {
  .orderbar {
    grid-template-columns: 1fr;
  }

}
</style>
