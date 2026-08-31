<script setup lang="ts">
// Stato MFD reale della macchina assistita. I campi osservabili arrivano
// dalla presenza del pilota; quelli che ACC non consente di rileggere sono
// dichiarati come ultimo ordine o non disponibili, mai spacciati per LIVE.

import { computed } from 'vue'
import type { PitwallSession } from '~/services/pitwall/pitwallLink'
import {
  resolveDriverName,
  type PitwallDriver,
  type PitwallPlan,
  type PitwallStopEstimate,
} from '~/utils/pitwallPresentation'

const props = defineProps<{
  session: PitwallSession | null
  fresh: boolean
  ageSeconds: number | null
  displayPlan: PitwallPlan
  drivers: PitwallDriver[]
  stop: PitwallStopEstimate
}>()

type MfdSource = 'live' | 'stale' | 'order' | 'unavailable'

interface MfdRow {
  label: string
  value: string
  source: MfdSource
}

const strategy = computed(() => props.session?.strategy ?? null)
const observedSource = computed<MfdSource>(() => props.fresh ? 'live' : 'stale')

function psi(value: number | undefined): string {
  return value == null ? '—' : `${value.toFixed(1).replace('.', ',')} PSI`
}

function yesNo(value: boolean): string {
  return value ? 'Sì' : 'No'
}

function stopClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '—'
  const minutes = Math.floor(seconds / 60)
  const rest = seconds - minutes * 60
  return `${String(minutes).padStart(2, '0')}:${rest.toFixed(3).padStart(6, '0')}`
}

const selectedDriver = computed(() => {
  const current = props.session?.crew?.find(member => member.current)
  return current?.name ?? resolveDriverName(props.displayPlan.driverId, props.drivers)
})

const rows = computed<MfdRow[]>(() => {
  const snapshot = strategy.value
  const source = snapshot ? observedSource.value : 'unavailable'
  return [
    { label: 'Preset strategia', value: 'Spento', source: 'unavailable' },
    { label: 'Carburante in uscita', value: snapshot?.fuelToAdd == null ? '—' : `${snapshot.fuelToAdd} L`, source },
    { label: 'Cambio gomme', value: yesNo(props.displayPlan.changeTyres), source: 'order' },
    { label: 'Set pneumatici', value: snapshot?.tyreSet == null ? '—' : String(snapshot.tyreSet), source },
    { label: 'Mescola', value: snapshot?.compound === 'wet' ? 'Wet' : snapshot?.compound === 'dry' ? 'Dry' : '—', source },
    { label: 'Pressione FL', value: psi(snapshot?.pressures?.FL), source },
    { label: 'Pressione FR', value: psi(snapshot?.pressures?.FR), source },
    { label: 'Pressione RL', value: psi(snapshot?.pressures?.RL), source },
    { label: 'Pressione RR', value: psi(snapshot?.pressures?.RR), source },
    { label: 'Sostituisci freni', value: 'No', source: 'unavailable' },
    { label: 'Pilota selezionato', value: selectedDriver.value, source: props.session?.crew?.length ? observedSource.value : 'order' },
    { label: 'Sospensioni', value: yesNo(props.displayPlan.repairSuspension), source: 'order' },
    { label: 'Carrozzeria', value: yesNo(props.displayPlan.repairBodywork), source: 'order' },
  ]
})

const sourceLabel: Record<MfdSource, string> = {
  live: 'LIVE',
  stale: 'DATI VECCHI',
  order: 'ULTIMO ORDINE',
  unavailable: 'N/D',
}
</script>

<template>
  <section class="mfd" aria-labelledby="pitwall-mfd-title">
    <header class="mfd__head">
      <div>
        <h2 id="pitwall-mfd-title">MFD IN MACCHINA</h2>
        <p v-if="session" class="mfd__context">
          <span v-if="session.car">{{ session.car }}</span>
          <span v-if="session.track">{{ session.track }}</span>
          <span>{{ ageSeconds == null ? 'mai aggiornato' : `aggiornato ${ageSeconds}s fa` }}</span>
        </p>
      </div>
      <span v-if="session" class="mfd__freshness" :class="fresh ? 'is-live' : 'is-stale'">
        {{ fresh ? 'LIVE' : 'DATI VECCHI' }}
      </span>
    </header>

    <p v-if="!session" class="mfd__empty">
      Seleziona un pilota per leggere la strategia impostata nel suo Pit MFD.
    </p>

    <div class="mfd__rows">
      <div v-for="row in rows" :key="row.label" class="mfd__row">
        <span class="mfd__label">{{ row.label }}</span>
        <strong class="mfd__value">{{ row.value }}</strong>
        <span class="mfd__source" :class="`mfd__source--${row.source}`">
          {{ sourceLabel[row.source] }}
        </span>
      </div>
      <div class="mfd__row mfd__row--stop">
        <span class="mfd__label">Tempo stop stimato</span>
        <strong class="mfd__value mfd__value--time">{{ stopClock(stop.seconds) }}</strong>
        <span class="mfd__source mfd__source--calculated">CALCOLATO</span>
      </div>
    </div>

    <footer class="mfd__order">
      <slot name="order" />
    </footer>
  </section>
</template>

<style lang="scss" scoped>
/* Superficie navy distinta dal pannello di comando, come nel mockup. */
.mfd {
  min-width: 0;
  overflow: hidden;
  border: 1px solid rgba(91, 133, 177, 0.28);
  border-radius: 10px;
  background: #0b1a2a;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.025);
}

.mfd__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 17px 20px 12px;
}

.mfd__head h2 {
  margin: 0;
  color: #f6f8fb;
  font-size: 16px;
  font-weight: 850;
  letter-spacing: 0.015em;
}

.mfd__context {
  display: flex;
  flex-wrap: wrap;
  gap: 5px 12px;
  margin: 5px 0 0;
  color: #74869a;
  font-size: 11px;
}

.mfd__freshness {
  flex: none;
  padding: 3px 7px;
  border: 1px solid currentColor;
  border-radius: 5px;
  font-size: 9px;
  font-weight: 850;
  letter-spacing: 0.06em;
}

.mfd__freshness.is-live { color: #64d46f; }
.mfd__freshness.is-stale { color: #ffbd55; }

.mfd__empty {
  margin: 0 20px 10px;
  color: #8797a8;
  font-size: 12px;
}

.mfd__rows {
  margin: 0 14px 14px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.085);
  border-radius: 8px;
  background: rgba(3, 11, 19, 0.28);
}

.mfd__row {
  display: grid;
  grid-template-columns: minmax(170px, 1fr) minmax(120px, .72fr) 104px;
  align-items: center;
  gap: 12px;
  min-height: 41px;
  padding: 7px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.075);
}

.mfd__row:last-child { border-bottom: 0; }

.mfd__label {
  color: #d7dee6;
  font-size: 12px;
}

.mfd__value {
  overflow: hidden;
  color: #fff;
  font-size: 12px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mfd__source {
  justify-self: end;
  padding: 3px 6px;
  border: 1px solid currentColor;
  border-radius: 5px;
  font-size: 9px;
  font-weight: 850;
  letter-spacing: 0.04em;
  white-space: nowrap;
}

.mfd__source--live { color: #5fd36c; }
.mfd__source--stale { color: #ffbd55; }
.mfd__source--order { color: #35a9f2; }
.mfd__source--unavailable { color: #687787; }
.mfd__source--calculated { color: #788695; }

.mfd__row--stop {
  min-height: 52px;
  margin-top: 2px;
}

.mfd__value--time {
  color: #ffd738;
  font-size: 17px;
  font-weight: 500;
  letter-spacing: .04em;
}

.mfd__order {
  margin: 0 14px 14px;
}

@media (max-width: 760px) {
  .mfd__row {
    grid-template-columns: minmax(120px, 1fr) minmax(92px, .72fr);
  }

  .mfd__source { display: none; }
}
</style>
