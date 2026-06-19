<script setup lang="ts">
import { computed } from 'vue'
import type { SectorHudState, SectorHudEntry } from '~/composables/useLiveStatePoller'

const props = defineProps<{
  sectorHud: SectorHudState | null
  // Mostra anche i tempi dei settori del giro di riferimento/precedente (PIP-175).
  showReference?: boolean
  // Per il settore in corso mostra il tempo parziale "live" invece di "--" (PIP-175).
  liveRunning?: boolean
}>()

const idleSectors: SectorHudEntry[] = ([1, 2, 3] as const).map((index) => ({
  index,
  state: 'pending',
  currentMs: null,
  referenceMs: null,
  bestMs: null,
  deltaMs: null,
  color: 'grey',
}))

const hasSectorData = computed(() => (props.sectorHud?.sectors?.length ?? 0) === 3)
const visibleSectors = computed(() => hasSectorData.value ? props.sectorHud!.sectors : idleSectors)
const modeLabel = computed(() => props.sectorHud?.mode === 'last_lap' ? 'Ultimo giro' : 'Settori')
const statusLabel = computed(() => props.sectorHud?.awaitingFlyingLap ? 'attesa giro lanciato' : null)

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

// Tempo parziale "live" del settore in corso = tempo giro corrente meno i
// settori gia' completati (aggiornato al ritmo del poller).
function liveElapsedMs(): number | null {
  const hud = props.sectorHud
  if (!hud || hud.currentLapTimeMs === null || hud.currentLapTimeMs === undefined) return null
  const completed = hud.sectors
    .filter((s) => s.state === 'complete')
    .reduce((acc, s) => acc + (s.currentMs ?? 0), 0)
  const elapsed = hud.currentLapTimeMs - completed
  return elapsed > 0 ? elapsed : null
}

function valueText(sector: SectorHudEntry): string {
  if (props.sectorHud?.awaitingFlyingLap) return '--'
  if (sector.state === 'pending') return '--'
  if (sector.state === 'running') {
    if (sector.currentMs !== null) return formatTime(sector.currentMs)
    if (props.liveRunning) {
      const live = liveElapsedMs()
      if (live !== null) return formatTime(live)
    }
    return '--'
  }
  return sector.currentMs !== null ? formatTime(sector.currentMs) : '--'
}

function ariaLabel(sector: SectorHudEntry): string {
  const base = `Settore ${sector.index}`
  if (!hasSectorData.value) return `${base} in attesa dati`
  if (sector.state === 'pending') return `${base} non ancora iniziato`
  if (sector.state === 'running') return `${base} in corso`
  return `${base} ${formatTime(sector.currentMs)} secondi, delta ${formatDelta(sector.deltaMs)}`
}
</script>

<template>
  <section
    class="sector-delta-hud"
    :class="{ 'sector-delta-hud--last-lap': sectorHud?.mode === 'last_lap', 'sector-delta-hud--idle': !hasSectorData }"
    aria-label="Delta settori"
  >
    <div class="sector-delta-hud__header">
      <span>{{ modeLabel }}</span>
      <em v-if="statusLabel">{{ statusLabel }}</em>
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
          class="sector-delta__delta"
          :class="{ 'sector-delta__delta--placeholder': sector.state !== 'complete' || sector.deltaMs === null }"
        >{{ sectorHud?.awaitingFlyingLap ? 'wait' : sector.state === 'complete' ? formatDelta(sector.deltaMs) : sector.state === 'running' ? 'live' : 'wait' }}</small>
      </div>
    </div>
  </section>
</template>
