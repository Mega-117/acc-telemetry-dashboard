<script setup lang="ts">
import { computed } from 'vue'
import type { SectorHudState, SectorHudEntry } from '~/composables/useLiveStatePoller'
import type { InfoTargetOutcome } from '~/utils/infoPresentation'
import {
  normalizeSectorDeltaReference,
  resolveSectorDeltaPresentation,
  sectorDeltaReferenceToken,
  type SectorDeltaReference,
} from '~/utils/sectorDeltaPresentation'

const props = withDefaults(defineProps<{
  sectorHud: SectorHudState | null
  // Mostra anche i tempi dei settori del giro di riferimento/precedente (PIP-175).
  showReference?: boolean
  // Mostra anche il best settore persistente del contesto corrente (PIP-181).
  showBest?: boolean
  // Mostra il tempo giro hero soltanto nel layout Compatto.
  showCurrentLap?: boolean
  // Per il settore in corso mostra il tempo parziale "live" invece di "--" (PIP-175).
  liveRunning?: boolean
  // Cambia solo il riferimento usato da delta e colore (PIP-275).
  deltaReference?: SectorDeltaReference
  // Cambia soltanto la presentazione; stato e calcoli restano condivisi (PIP-276).
  variant?: 'classic' | 'compact'
  // Campione live dell'overlay Info, usato solo per i numeri ancora in corso.
  liveCurrentLapTimeMs?: number | null
  // Validita' corrente canonica e latched fino al rollover.
  liveLapValid?: boolean | null
  // Valore hero gia' risolto dalla presentazione (include l'hold del giro concluso).
  compactDisplayLap?: {
    timeMs: number | null
  }
  // Esito congelato sullo stesso snapshot del giro trattenuto per 7 secondi.
  targetOutcome?: InfoTargetOutcome
}>(), {
  showCurrentLap: true,
  liveLapValid: null,
  targetOutcome: 'neutral',
})

const idleSectors: SectorHudEntry[] = ([1, 2, 3] as const).map((index) => ({
  index,
  state: 'pending',
  currentMs: null,
  referenceMs: null,
  bestMs: null,
  deltaMs: null,
  bestReferenceMs: null,
  color: 'grey',
}))

const hasSectorData = computed(() => (props.sectorHud?.sectors?.length ?? 0) === 3)
const selectedReference = computed(() => normalizeSectorDeltaReference(props.deltaReference))
const visibleSectors = computed(() => {
  const sectors = hasSectorData.value ? props.sectorHud!.sectors : idleSectors
  return sectors.map((sector) => ({
    ...sector,
    ...resolveSectorDeltaPresentation(sector, selectedReference.value),
  }))
})
const comparisonToken = computed(() => sectorDeltaReferenceToken(selectedReference.value))
const compactLiveLapTimeMs = computed(() => (
  props.liveCurrentLapTimeMs !== undefined
    ? props.liveCurrentLapTimeMs
    : props.sectorHud?.currentLapTimeMs ?? null
))
const compactDisplayLapTimeMs = computed(() => (
  props.compactDisplayLap
    ? props.compactDisplayLap.timeMs
    : compactLiveLapTimeMs.value
))
const compactCurrentLapValid = computed(() => {
  if (props.liveLapValid !== undefined && props.liveLapValid !== null) {
    return props.liveLapValid
  }
  return props.sectorHud?.lapValid ?? null
})
const compactLapTime = computed(() => {
  return compactDisplayLapTimeMs.value === null
    ? '--:--.---'
    : formatLapTime(compactDisplayLapTimeMs.value)
})
const compactTitle = computed(() => (
  `SECTORS · VS · ${comparisonToken.value}`
))

function formatTime(ms: number | null): string {
  if (ms === null) return '--'
  return `${(ms / 1000).toFixed(3)}`
}

function formatDelta(ms: number | null): string {
  if (ms === null) return '--'
  if (Math.abs(ms) <= 0) return '+0.000'
  const sign = ms < 0 ? '-' : '+'
  return `${sign}${(Math.abs(ms) / 1000).toFixed(3)}`
}

function formatLapTime(ms: number): string {
  const safeMs = Math.max(0, Math.round(ms))
  const minutes = Math.floor(safeMs / 60_000)
  const seconds = Math.floor((safeMs % 60_000) / 1000)
  const milliseconds = safeMs % 1000
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}`
}

// Tempo parziale "live" del settore in corso = tempo giro corrente meno i
// settori gia' completati (aggiornato al ritmo del poller).
function liveElapsedMs(): number | null {
  const hud = props.sectorHud
  const lapTimeMs = compactLiveLapTimeMs.value
  if (!hud || lapTimeMs === null) return null
  const completed = hud.sectors
    .filter((s) => s.state === 'complete')
    .reduce((acc, s) => acc + (s.currentMs ?? 0), 0)
  const elapsed = lapTimeMs - completed
  return elapsed > 0 ? elapsed : null
}

function valueText(sector: SectorHudEntry): string {
  if (props.sectorHud?.awaitingFlyingLap) return '--'
  if (sector.state === 'pending') return '--'
  if (sector.state === 'running') {
    if (props.liveRunning) {
      const live = liveElapsedMs()
      if (live !== null) return formatTime(live)
    }
    if (sector.currentMs !== null) return formatTime(sector.currentMs)
    return '--'
  }
  return sector.currentMs !== null ? formatTime(sector.currentMs) : '--'
}

function deltaText(sector: SectorHudEntry): string {
  if (props.sectorHud?.awaitingFlyingLap) return 'wait'
  if (sector.state === 'complete') return sector.deltaMs === null ? 'wait' : formatDelta(sector.deltaMs)
  return sector.state === 'running' ? 'live' : 'wait'
}

function ariaLabel(sector: SectorHudEntry): string {
  const base = `Settore ${sector.index}`
  if (!hasSectorData.value) return `${base} in attesa dati`
  if (sector.state === 'pending') return `${base} non ancora iniziato`
  if (sector.state === 'running') return `${base} in corso`
  const best = props.showBest && sector.bestMs !== null ? `, best ${formatTime(sector.bestMs)} secondi` : ''
  return `${base} ${formatTime(sector.currentMs)} secondi, delta ${formatDelta(sector.deltaMs)}${best}`
}
</script>

<template>
  <section
    class="sector-delta-hud"
    :class="{
      'sector-delta-hud--last-lap': sectorHud?.mode === 'last_lap',
      'sector-delta-hud--idle': !hasSectorData,
      'sector-delta-hud--compact': variant === 'compact',
    }"
    aria-label="Delta settori"
  >
    <template v-if="variant === 'compact'">
      <div class="sector-compact__header">
        <div class="sector-compact__title">
          <span>{{ compactTitle }}</span>
        </div>
        <strong
          v-if="showCurrentLap !== false"
          class="sector-compact__lap"
          :class="{
            'sector-compact__lap--invalid': compactCurrentLapValid === false,
            'sector-compact__lap--unknown': compactCurrentLapValid === null,
            'sector-compact__lap--target-inside': targetOutcome === 'inside',
            'sector-compact__lap--target-outside': targetOutcome === 'outside',
          }"
        >{{ compactLapTime }}</strong>
        <small
          v-if="showCurrentLap !== false"
          class="sector-compact__lap-label"
        >CURRENT LAP</small>
      </div>
      <div class="sector-compact__rows">
        <div
          v-for="sector in visibleSectors"
          :key="sector.index"
          class="sector-compact__row"
          :class="[
            `sector-delta--${sector.color}`,
            `sector-compact__row--${sector.state}`,
          ]"
          :aria-label="ariaLabel(sector)"
        >
          <span class="sector-compact__label">S{{ sector.index }}</span>
          <strong class="sector-compact__time">
            <span
              :class="{ 'sector-compact__time-value--long': valueText(sector).length > 6 }"
            >{{ valueText(sector) }}</span>
          </strong>
          <small
            class="sector-compact__delta"
            :class="{ 'sector-delta__delta--placeholder': sector.state !== 'complete' || sector.deltaMs === null }"
          >{{ deltaText(sector) }}</small>
        </div>
      </div>
    </template>
    <template v-else>
      <div class="sector-delta-hud__header sector-delta-hud__header--classic">
        <span class="sector-delta-hud__title">SETTORI</span>
        <em class="sector-delta-hud__comparison">VS {{ comparisonToken }}</em>
      </div>
      <div class="sector-delta-hud__grid">
        <div
          v-for="sector in visibleSectors"
          :key="sector.index"
          class="sector-delta"
          :class="[
            `sector-delta--${sector.color}`,
            `sector-delta--${sector.state}`,
          ]"
          :aria-label="ariaLabel(sector)"
        >
          <span class="sector-delta__label">S{{ sector.index }}</span>
          <strong
            class="sector-delta__value"
            :class="{ 'sector-delta__value--placeholder': valueText(sector) === '--' }"
          >{{ valueText(sector) }}</strong>
          <small
            v-if="showReference"
            class="sector-delta__ref"
          >prec {{ sector.referenceMs !== null ? formatTime(sector.referenceMs) : '--' }}</small>
          <small
            v-if="showBest"
            class="sector-delta__best"
          >best {{ sector.bestMs !== null ? formatTime(sector.bestMs) : '--' }}</small>
          <small
            class="sector-delta__delta"
            :class="{ 'sector-delta__delta--placeholder': sector.state !== 'complete' || sector.deltaMs === null }"
          >{{ deltaText(sector) }}</small>
        </div>
      </div>
    </template>
  </section>
</template>

<style scoped>
.sector-delta-hud--compact {
  display: flex;
  flex-direction: column;
  gap: 0;
  padding: 0;
  border: 0;
  background: transparent;
  box-sizing: border-box;
  min-height: 0;
  overflow: hidden;
}

.sector-compact__header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  grid-template-rows: auto auto auto;
  column-gap: calc(6px * var(--hud-scale, 1));
  flex: 0 0 auto;
  min-height: 0;
}

.sector-compact__title {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: calc(5px * var(--hud-scale, 1));
}

.sector-compact__title::before,
.sector-compact__title::after {
  content: '';
  width: 100%;
  height: 1px;
  background: rgba(255, 255, 255, 0.42);
}

.sector-compact__title > span {
  color: #c7c9cc;
  font-size: calc(9px * var(--hud-scale, 1));
  font-weight: 950;
  letter-spacing: 0.02em;
  line-height: 1;
}

.sector-compact__lap {
  grid-column: 1 / -1;
  justify-self: center;
  color: #facc15;
  margin-top: calc(16px * var(--hud-scale, 1));
  font-size: calc(48px * var(--hud-scale, 1));
  font-variant-numeric: tabular-nums;
  font-weight: 950;
  letter-spacing: -0.035em;
  line-height: 0.88;
}

.sector-compact__lap--invalid {
  color: #dc1010;
}

.sector-compact__lap--unknown {
  color: #6f7277;
}

.sector-compact__lap--target-inside,
.sector-compact__lap--target-outside {
  border-radius: calc(8px * var(--hud-scale, 1));
  outline: max(1px, calc(2px * var(--hud-scale, 1))) solid;
  outline-offset: calc(4px * var(--hud-scale, 1));
}

.sector-compact__lap--target-inside {
  outline-color: #18d53b;
  box-shadow: 0 0 calc(13px * var(--hud-scale, 1)) rgba(24, 213, 59, .42);
}

.sector-compact__lap--target-outside {
  outline-color: #dc1010;
  box-shadow: 0 0 calc(13px * var(--hud-scale, 1)) rgba(220, 16, 16, .42);
}

.sector-compact__lap-label {
  grid-column: 2;
  justify-self: end;
  margin-top: calc(2px * var(--hud-scale, 1));
  color: #6f7277;
  font-size: calc(10px * var(--hud-scale, 1));
  font-weight: 900;
  line-height: 1;
}

.sector-compact__rows {
  display: grid;
  flex: 1;
  margin-top: calc(5px * var(--hud-scale, 1));
  grid-template-rows: repeat(3, minmax(0, 1fr));
  min-height: 0;
  overflow: hidden;
}

.sector-compact__row {
  display: grid;
  grid-template-columns: calc(39px * var(--hud-scale, 1)) minmax(0, 1fr) max-content;
  align-items: center;
  gap: calc(8px * var(--hud-scale, 1));
  box-sizing: border-box;
  min-height: 0;
  padding: 0;
  overflow: hidden;
  border: 0;
  background: transparent;
}

.sector-compact__label {
  color: #292c31;
  font-size: calc(20px * var(--hud-scale, 1));
  font-weight: 950;
  letter-spacing: 0.02em;
}

.sector-compact__row .sector-compact__time,
.sector-compact__row .sector-compact__time > span {
  overflow: hidden;
  color: #292c31;
  font-size: calc(38px * var(--hud-scale, 1));
  font-variant-numeric: tabular-nums;
  font-weight: 950;
  letter-spacing: -0.04em;
  line-height: 1;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sector-compact__row .sector-compact__time > .sector-compact__time-value--long {
  font-size: calc(30px * var(--hud-scale, 1));
  letter-spacing: -0.05em;
}

.sector-compact__delta {
  justify-self: end;
  overflow: visible;
  font-size: calc(22px * var(--hud-scale, 1));
  font-variant-numeric: tabular-nums;
  font-weight: 950;
  line-height: 1;
  text-transform: uppercase;
}

.sector-compact__row--running {
  background: transparent;
}

.sector-compact__row--running .sector-compact__label,
.sector-compact__row--running .sector-compact__time,
.sector-compact__row--running .sector-compact__time > span {
  color: #e8e4df;
}

</style>
