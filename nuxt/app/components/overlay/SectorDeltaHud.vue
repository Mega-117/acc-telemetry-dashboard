<script setup lang="ts">
import { useI18n } from '~/i18n'
import { computed } from 'vue'
import HudFixedDigits from '~/components/overlay/HudFixedDigits.vue'
import type { CustomSectorTimes } from '~/utils/customSectorReferences'
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
  // Only the ACC caller may retain its known three-sector idle layout.
  idleSectorCount?: number
  // Mostra anche i tempi dei settori del giro di riferimento/precedente (PIP-175).
  showReference?: boolean
  // Mostra anche il best settore persistente del contesto corrente (PIP-181).
  showBest?: boolean
  // Mostra il riquadro del tempo giro. La pagina passa l'opzione del layout attivo:
  // Compatto `showCurrentLap` (default on), Classico `showClassicLap` (default off).
  showCurrentLap?: boolean
  // Per il settore in corso mostra il tempo parziale "live" invece di "--" (PIP-175).
  liveRunning?: boolean
  // Cambia solo il riferimento usato da delta e colore (PIP-275).
  deltaReference?: SectorDeltaReference
  customSectorTimes?: CustomSectorTimes | null
  // Cambia soltanto la presentazione; stato e calcoli restano condivisi (PIP-276).
  variant?: 'classic' | 'compact'
  // Campione live dell'overlay Info, usato solo per i numeri ancora in corso.
  liveCurrentLapTimeMs?: number | null
  // Coppia hero gia' risolta dalla presentazione: live o giro concluso in hold.
  compactDisplayLap?: {
    timeMs: number | null
    valid: boolean | null
  }
  // Esito congelato sullo stesso snapshot del giro trattenuto per 7 secondi.
  targetOutcome?: InfoTargetOutcome
  // Delta live del giro (stesso dato dell'overlay Info), sotto il tempo nel riquadro
  // giro del Classico; null quando manca o durante l'hold del giro concluso.
  lapDeltaMs?: number | null
}>(), {
  showCurrentLap: true,
  targetOutcome: 'neutral',
  idleSectorCount: 3,
  lapDeltaMs: null,
})

const idleSectors = computed<SectorHudEntry[]>(() => Array.from({ length: props.idleSectorCount }, (_, offset) => ({
  index: offset + 1,
  state: 'pending',
  currentMs: null,
  referenceMs: null,
  bestMs: null,
  deltaMs: null,
  bestReferenceMs: null,
  color: 'grey',
})))

const hasSectorData = computed(() => (props.sectorHud?.sectors?.length ?? 0) > 0)
const selectedReference = computed(() => normalizeSectorDeltaReference(props.deltaReference))
const visibleSectors = computed(() => {
  const sectors = props.sectorHud?.sectors ?? idleSectors.value
  return sectors.map((sector) => ({
    ...sector,
    ...resolveSectorDeltaPresentation(
      sector,
      selectedReference.value,
      props.customSectorTimes?.[sector.index - 1] ?? null,
      props.sectorHud?.lapValid ?? null,
    ),
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
const compactCurrentLapValid = computed(() => (
  props.compactDisplayLap
    ? props.compactDisplayLap.valid
    : props.sectorHud?.lapValid ?? null
))
const compactLapTime = computed(() => {
  return compactDisplayLapTimeMs.value === null
    ? '--:--.---'
    : formatLapTime(compactDisplayLapTimeMs.value)
})
// HUD style v2 (27/10): both layouts share the "SETTORI vs BEST" title bar. The lap
// tile has no label any more, so the title alone says when the last lap is shown:
// Classic "SETTORI · ULTIMO GIRO", Compact (narrower) "ULTIMO GIRO".
const titleText = computed(() => {
  if (props.sectorHud?.mode !== 'last_lap') return t('overlays.sectors.title')
  return props.variant === 'compact' ? t('overlays.sectors.lastLap') : t('overlays.sectors.titleLastLap')
})

function formatTime(ms: number | null): string {
  if (ms === null) return '--'
  return `${(ms / 1000).toFixed(3)}`
}

function formatDelta(ms: number | null): string {
  if (ms === null) return '--'
  // PIP-524: one format for both layouts and every reference (custom included):
  // thousandths and the same minus sign, so text and colour always agree.
  const milliseconds = Math.round(Math.abs(ms))
  return `${ms < 0 && milliseconds > 0 ? '−' : '+'}${(milliseconds / 1000).toFixed(3)}`
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
  // A completed sector with no reference (invalid first lap) has nothing to wait for.
  if (sector.state === 'complete') return sector.deltaMs === null ? '--' : formatDelta(sector.deltaMs)
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
const { t } = useI18n()
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
    <p v-if="visibleSectors.length === 0" role="status">{{ t('overlays.sectors.unavailable') }}</p>
    <template v-if="variant === 'compact'">
      <div class="sector-compact__header">
        <div class="sector-compact__title">
          <span><b>{{ titleText }}</b> <span class="sector-title__versus">{{ t('overlays.sectors.versus') }}</span> <b class="sector-title__reference">{{ comparisonToken }}</b></span>
        </div>
        <div
          v-if="showCurrentLap !== false"
          class="sector-compact__lap-block"
          :class="{
            'sector-compact__lap--target-inside': targetOutcome === 'inside' && compactCurrentLapValid === true,
            'sector-compact__lap--target-outside': targetOutcome === 'outside' && compactCurrentLapValid === true,
          }"
        >
          <strong
            class="sector-compact__lap"
            :class="{
              'sector-compact__lap--invalid': compactCurrentLapValid === false,
              'sector-compact__lap--unknown': compactCurrentLapValid === null,
            }"
          ><HudFixedDigits :value="compactLapTime" /></strong>
        </div>
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
            ><HudFixedDigits :value="valueText(sector)" /></span>
          </strong>
          <small
            class="sector-compact__delta"
            :class="{
              'sector-delta__delta--placeholder': sector.state !== 'complete' || sector.deltaMs === null,
              'sector-compact__delta--long': deltaText(sector).length > 7,
            }"
          ><HudFixedDigits :value="deltaText(sector)" /></small>
        </div>
      </div>
    </template>
    <template v-else>
      <div class="sector-delta-hud__header sector-delta-hud__header--classic">
        <span class="sector-delta-hud__title">{{ titleText }}</span>
        <em class="sector-delta-hud__comparison"><span class="sector-title__versus">{{ t('overlays.sectors.versus') }}</span> <b class="sector-title__reference">{{ comparisonToken }}</b></em>
      </div>
      <!-- Owner (30/10): the current lap is the same full-width row as the Compact layout, above
           the sector tiles (it was a tile on their left). -->
      <div
        v-if="showCurrentLap !== false"
        class="sector-compact__lap-block sector-delta-hud__lap-row"
        :class="{
          'sector-compact__lap--target-inside': targetOutcome === 'inside' && compactCurrentLapValid === true,
          'sector-compact__lap--target-outside': targetOutcome === 'outside' && compactCurrentLapValid === true,
        }"
      >
        <strong
          class="sector-compact__lap"
          :class="{
            'sector-compact__lap--invalid': compactCurrentLapValid === false,
            'sector-compact__lap--unknown': compactCurrentLapValid === null,
          }"
        ><HudFixedDigits :value="compactLapTime" /></strong>
      </div>
      <div class="sector-delta-hud__body">
        <div class="sector-delta-hud__grid" :style="{ gridTemplateColumns: `repeat(${visibleSectors.length}, minmax(0, 1fr))` }">
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
            ><HudFixedDigits :value="valueText(sector)" /></strong>
            <small
              class="sector-delta__delta"
              :class="{ 'sector-delta__delta--placeholder': sector.state !== 'complete' || sector.deltaMs === null }"
            ><HudFixedDigits :value="deltaText(sector)" /></small>
            <div v-if="showReference || showBest" class="sector-delta__minis">
              <span v-if="showReference" class="sector-delta__ref">
                <b>{{ t('overlays.sectors.previous') }}</b><em>{{ sector.referenceMs !== null ? formatTime(sector.referenceMs) : '--' }}</em>
              </span>
              <span v-if="showBest" class="sector-delta__best">
                <b>{{ t('overlays.sectors.best') }}</b><em>{{ sector.bestMs !== null ? formatTime(sector.bestMs) : '--' }}</em>
              </span>
            </div>
          </div>
        </div>
      </div>
    </template>
  </section>
</template>

<style scoped lang="scss">
@use '~/assets/scss/hud-gauge' as *;

/* PIP-671 (approved draft "Settori · compatto", 30/10): title bar, large current lap, three
   S1/S2/S3 rows split by thin grey lines, no inner background tiles. Native px: the page zooms
   the HUD by its scale. The classic rules live in assets/scss/components/sectors-overlay.scss. */
.sector-delta-hud--compact {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 0;
  border: 0;
  background: transparent;
  box-sizing: border-box;
  min-height: 0;
  overflow: hidden;
  color: #f4f6f8;
  @include hud-gauge-type-barlow;
}

.sector-compact__header {
  display: grid;
  gap: 6px;
  flex: 0 0 auto;
  min-height: 0;
}

.sector-compact__title {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: 10px;
}

.sector-compact__title::before,
.sector-compact__title::after {
  content: '';
  width: 100%;
  height: 2px;
  background: #66717b;
}

/* "SETTORI vs BEST" (owner 30/10): flex items with the same 10px on both sides of "vs". */
.sector-compact__title > span {
  display: inline-flex;
  align-items: baseline;
  gap: 10px;
  color: #a4b0bc;
  font: 700 14px/1 var(--hud-gauge-label);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  white-space: nowrap;
}

.sector-compact__title b { color: #f4f6f8; }

/* "SETTORI vs BEST": the link word lowercase. */
.sector-compact__title .sector-title__versus {
  letter-spacing: 0.04em;
  text-transform: none;
}

/* The lap block keeps the in/out target backgrounds (PIP-416); neutral has no tile. */
.sector-compact__lap-block {
  display: grid;
  justify-items: center;
  padding: 5px 10px 9px;
  background: transparent;
}

.sector-compact__lap-block.sector-compact__lap--target-inside { background: #0b315a; }
.sector-compact__lap-block.sector-compact__lap--target-outside { background: #542600; }

.sector-compact__lap {
  color: #f1d541;
  font: 800 56px/1 var(--hud-gauge-num);
  white-space: nowrap;
}

.sector-compact__lap.sector-compact__lap--invalid { color: #dc1010; }
.sector-compact__lap.sector-compact__lap--unknown { color: #6f7277; }

.sector-compact__rows {
  display: grid;
  min-height: 0;
  overflow: hidden;
}

/* Label, time and delta/live/wait on one shared baseline. */
.sector-compact__row {
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr) max-content;
  align-items: baseline;
  gap: 8px;
  box-sizing: border-box;
  min-height: 0;
  /* Owner (30/10): the figures had 15-19px of space above and 10-11px below (the line box keeps room
     above the digits): 3px more below than above balances the ink. */
  padding: 4px 10px 10px;
  overflow: hidden;
  border: 0;
  border-top: 1px solid rgba(184, 194, 204, 0.22);
  background: transparent;
  opacity: 1;
}

.sector-compact__label {
  color: #c6d0d8;
  font: 700 19px/1 var(--hud-gauge-label);
  letter-spacing: 0.06em;
}

/* overflow: clip (not hidden) keeps the content baseline for the row alignment. */
.sector-compact__row .sector-compact__time,
.sector-compact__row .sector-compact__time > span {
  overflow: clip;
  color: #f4f6f8;
  font: 700 32px/1 var(--hud-gauge-num);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sector-compact__delta {
  justify-self: end;
  overflow: visible;
  color: #f4f6f8;
  font: 800 38px/1 var(--hud-gauge-num);
  text-transform: uppercase;
}

.sector-delta--purple .sector-compact__delta { color: #c756f0; }
.sector-delta--green .sector-compact__delta { color: #24c26c; }
.sector-delta--yellow .sector-compact__delta { color: #edc52b; }
.sector-delta--red .sector-compact__delta { color: #f05b4b; }

/* Long values (a sector over a minute, a delta of 100 s or more, e.g. after a stop) step down
   one size, so time and delta both stay whole inside the narrow compact row. */
.sector-compact__row .sector-compact__time > .sector-compact__time-value--long { font-size: 26px; }
.sector-compact__row .sector-compact__delta.sector-compact__delta--long { font-size: 30px; }

/* live/wait and a missing delta are not values: grey. */
.sector-compact__row .sector-compact__delta.sector-delta__delta--placeholder { color: #a4b0bc; }

/* Sectors not reached yet stay dimmer. */
.sector-compact__row--pending .sector-compact__time,
.sector-compact__row--pending .sector-compact__time > span {
  color: #6f7277;
}
</style>
