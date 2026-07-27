<script setup lang="ts">
import { computed } from 'vue'
import type { SectorHudState, SectorHudEntry } from '~/composables/useLiveStatePoller'
import {
  normalizeSectorDeltaReference,
  resolveSectorDeltaPresentation,
  type SectorDeltaReference,
} from '~/utils/sectorDeltaPresentation'

const props = defineProps<{
  sectorHud: SectorHudState | null
  // Mostra anche i tempi dei settori del giro di riferimento/precedente (PIP-175).
  showReference?: boolean
  // Mostra anche il best settore persistente del contesto corrente (PIP-181).
  showBest?: boolean
  // Per il settore in corso mostra il tempo parziale "live" invece di "--" (PIP-175).
  liveRunning?: boolean
  // Cambia solo il riferimento usato da delta e colore (PIP-275).
  deltaReference?: SectorDeltaReference
  // Cambia soltanto la presentazione; stato e calcoli restano condivisi (PIP-276).
  variant?: 'classic' | 'compact'
  // Campione live dell'overlay Info, usato solo per i numeri ancora in corso.
  liveCurrentLapTimeMs?: number | null
  // Validita' associata allo stesso campione live dell'overlay Info.
  liveLapValid?: boolean | null
}>()

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
const modeLabel = computed(() => props.sectorHud?.mode === 'last_lap' ? 'Ultimo giro' : 'Settori')
const statusLabel = computed(() => props.sectorHud?.awaitingFlyingLap ? 'attesa giro lanciato' : null)
const referenceLabel = computed(() => selectedReference.value === 'bestSector' ? 'ref best' : null)
const compactCurrentLapTimeMs = computed(() => (
  props.liveCurrentLapTimeMs !== undefined
    ? props.liveCurrentLapTimeMs
    : props.sectorHud?.currentLapTimeMs ?? null
))
const compactLapValid = computed(() => (
  props.liveLapValid !== undefined && props.liveLapValid !== null
    ? props.liveLapValid
    : props.sectorHud?.lapValid ?? true
))
const compactLapTime = computed(() => {
  return compactCurrentLapTimeMs.value === null
    ? '--:--.---'
    : formatLapTime(compactCurrentLapTimeMs.value)
})

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
  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}`
}

// Tempo parziale "live" del settore in corso = tempo giro corrente meno i
// settori gia' completati (aggiornato al ritmo del poller).
function liveElapsedMs(): number | null {
  const hud = props.sectorHud
  const lapTimeMs = compactCurrentLapTimeMs.value
  if (!hud || lapTimeMs === null) return null
  const completed = hud.sectors
    .filter((s) => s.state === 'complete')
    .reduce((acc, s) => acc + (s.currentMs ?? 0), 0)
  const elapsed = lapTimeMs - completed
  return elapsed > 0 ? elapsed : null
}

// Il testo segue ogni campione; la chiave limita il feedback visivo a 4 Hz,
// evitando che il push 20 Hz riavvii l'animazione prima che possa essere vista.
function animationKey(ms: number | null): string {
  return ms === null ? 'wait' : String(Math.floor(ms / 250))
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

function sectorAnimationKey(sector: SectorHudEntry): string {
  if (sector.state !== 'running') return `stable-${sector.index}`
  const live = props.liveRunning ? liveElapsedMs() : sector.currentMs
  return `running-${sector.index}-${animationKey(live)}`
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
          <span>SECTORS</span>
        </div>
        <strong
          :key="animationKey(compactCurrentLapTimeMs)"
          class="sector-compact__lap sector-compact__number--updating"
          :class="{ 'sector-compact__lap--invalid': compactLapValid === false }"
        >{{ compactLapTime }}</strong>
        <small class="sector-compact__lap-label">CURRENT LAP</small>
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
              :key="sectorAnimationKey(sector)"
              :class="{ 'sector-compact__number--updating': sector.state === 'running' }"
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
      <div class="sector-delta-hud__header">
        <span>{{ modeLabel }}</span>
        <em v-if="statusLabel">{{ statusLabel }}</em>
        <em v-else-if="referenceLabel">{{ referenceLabel }}</em>
        <em v-else-if="sectorHud?.referenceLap">ref lap {{ sectorHud.referenceLap }}</em>
        <em v-else>ref --</em>
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
  gap: calc(10px * var(--hud-scale, 1));
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
  grid-template-rows: auto minmax(0, 1fr) auto;
  column-gap: calc(5px * var(--hud-scale, 1));
  flex: 0 0 auto;
  min-height: 0;
}

.sector-compact__title {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  gap: calc(6px * var(--hud-scale, 1));
}

.sector-compact__title::before,
.sector-compact__title::after {
  content: '';
  height: 1px;
  background: rgba(255, 255, 255, 0.42);
}

.sector-compact__title::before {
  width: calc(38px * var(--hud-scale, 1));
}

.sector-compact__title::after {
  flex: 1;
}

.sector-compact__title > span {
  color: rgba(255, 255, 255, 0.7);
  font-size: calc(10px * var(--hud-scale, 1));
  font-weight: 950;
  letter-spacing: 0.06em;
  line-height: 1;
}

.sector-compact__lap {
  grid-column: 1 / -1;
  justify-self: center;
  color: #facc15;
  font-size: calc(37px * var(--hud-scale, 1));
  font-variant-numeric: tabular-nums;
  font-weight: 950;
  letter-spacing: -0.045em;
  line-height: 0.94;
}

.sector-compact__lap--invalid {
  color: #dc1010;
}

.sector-compact__lap-label {
  grid-column: 2;
  justify-self: end;
  color: rgba(255, 255, 255, 0.48);
  font-size: calc(7px * var(--hud-scale, 1));
  font-weight: 900;
  line-height: 1;
}

.sector-compact__rows {
  display: grid;
  flex: 1;
  grid-template-rows: repeat(3, minmax(0, 1fr));
  min-height: 0;
  overflow: hidden;
}

.sector-compact__row {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr) max-content;
  align-items: center;
  gap: calc(8px * var(--hud-scale, 1));
  box-sizing: border-box;
  min-height: 0;
  padding: 0 calc(3px * var(--hud-scale, 1));
  overflow: hidden;
  border: 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  background: transparent;
}

.sector-compact__row:last-child {
  border-bottom: 0;
}

.sector-compact__label {
  color: rgba(255, 255, 255, 0.72);
  font-size: calc(13px * var(--hud-scale, 1));
  font-weight: 950;
  letter-spacing: 0.02em;
}

.sector-compact__row .sector-compact__time,
.sector-compact__row .sector-compact__time > span {
  overflow: hidden;
  color: #fff;
  font-size: calc(25px * var(--hud-scale, 1));
  font-variant-numeric: tabular-nums;
  font-weight: 950;
  line-height: 1;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sector-compact__delta {
  justify-self: end;
  overflow: visible;
  font-size: calc(17px * var(--hud-scale, 1));
  font-variant-numeric: tabular-nums;
  font-weight: 950;
  line-height: 1;
  text-transform: uppercase;
}

.sector-compact__row--running {
  background: rgba(255, 255, 255, 0.035);
}

.sector-compact__number--updating {
  display: inline-grid;
  animation: sector-number-refresh 180ms cubic-bezier(0.2, 0.75, 0.25, 1);
}

@keyframes sector-number-refresh {
  from {
    opacity: 0.58;
    transform: translateY(22%);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .sector-compact__number--updating {
    animation: none;
  }
}
</style>
