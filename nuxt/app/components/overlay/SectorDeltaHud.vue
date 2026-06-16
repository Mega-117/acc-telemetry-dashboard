<script setup lang="ts">
import { computed } from 'vue'
import type { SectorHudState, SectorHudEntry } from '~/composables/useLiveStatePoller'

const props = defineProps<{
  sectorHud: SectorHudState | null
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
      <em v-if="sectorHud?.referenceLap">ref lap {{ sectorHud.referenceLap }}</em>
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
        <strong>{{ sector.state === 'pending' ? '--' : formatTime(sector.currentMs) }}</strong>
        <small>{{ sector.state === 'complete' ? formatDelta(sector.deltaMs) : sector.state === 'running' ? 'live' : 'wait' }}</small>
      </div>
    </div>
  </section>
</template>
