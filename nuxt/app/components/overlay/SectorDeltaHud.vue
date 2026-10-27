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
    ...resolveSectorDeltaPresentation(sector, selectedReference.value, props.customSectorTimes?.[sector.index - 1] ?? null),
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

// Green when ahead of the reference, red when behind, as in the approved mock.
const lapDeltaClass = computed(() => {
  const ms = props.lapDeltaMs ?? null
  if (ms === null) return 'sector-delta-hud__lap-delta--placeholder'
  const rounded = Math.round(ms)
  if (rounded < 0) return 'sector-delta-hud__lap-delta--faster'
  return rounded > 0 ? 'sector-delta-hud__lap-delta--slower' : ''
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
            :class="{ 'sector-delta__delta--placeholder': sector.state !== 'complete' || sector.deltaMs === null }"
          ><HudFixedDigits :value="deltaText(sector)" /></small>
        </div>
      </div>
    </template>
    <template v-else>
      <div class="sector-delta-hud__header sector-delta-hud__header--classic">
        <span class="sector-delta-hud__title">{{ titleText }}</span>
        <em class="sector-delta-hud__comparison"><span class="sector-title__versus">{{ t('overlays.sectors.versus') }}</span> <b class="sector-title__reference">{{ comparisonToken }}</b></em>
      </div>
      <div
        class="sector-delta-hud__body"
        :class="{ 'sector-delta-hud__body--with-lap': showCurrentLap !== false }"
        :style="showCurrentLap !== false ? { gridTemplateColumns: `minmax(0, 1.25fr) repeat(${visibleSectors.length}, minmax(0, 1fr))` } : undefined"
      >
        <div v-if="showCurrentLap !== false" class="sector-delta-hud__lap">
          <strong
            class="sector-delta-hud__lap-time"
            :class="{
              'sector-compact__lap--invalid': compactCurrentLapValid === false,
              'sector-compact__lap--unknown': compactCurrentLapValid === null,
            }"
          ><HudFixedDigits :value="compactLapTime" /></strong>
          <small
            class="sector-delta-hud__lap-delta"
            :class="lapDeltaClass"
          ><HudFixedDigits :value="formatDelta(lapDeltaMs ?? null)" /></small>
        </div>
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

<style scoped>
/* HUD style v2 (27/10): compact layout. The classic rules live in pages/sectors-overlay.vue. */
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
  font-family: var(--hud-font-label);
}

.sector-compact__header {
  display: grid;
  /* Title bar -> lap block spacing (6px + 7px requested on 27/10), scales with the HUD. */
  gap: calc(13px * var(--hud-scale, 1));
  flex: 0 0 auto;
  min-height: 0;
}

.sector-compact__title {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: calc(8px * var(--hud-scale, 1));
}

.sector-compact__title::before,
.sector-compact__title::after {
  content: '';
  width: 100%;
  height: 1px;
  background: rgba(255, 255, 255, 0.15);
}

.sector-compact__title > span {
  color: #a3a5ae;
  font: 700 calc(12px * var(--hud-scale, 1))/1 var(--hud-font-label);
  letter-spacing: 0.14em;
  text-transform: uppercase;
  white-space: nowrap;
}

.sector-compact__title b { color: #f4f4f6; }

/* "SETTORI vs BEST": title and reference word bold, the link word lowercase and light. */
.sector-compact__title .sector-title__versus {
  font-weight: 400;
  letter-spacing: 0.04em;
  text-transform: none;
}

/* The lap block keeps the in/out target backgrounds; neutral is a plain cell. */
.sector-compact__lap-block {
  display: grid;
  justify-items: center;
  gap: calc(4px * var(--hud-scale, 1));
  padding: calc(7px * var(--hud-scale, 1)) calc(6px * var(--hud-scale, 1));
  background: rgba(255, 255, 255, 0.045);
}

.sector-compact__lap-block.sector-compact__lap--target-inside { background: #0b315a; }
.sector-compact__lap-block.sector-compact__lap--target-outside { background: #542600; }

.sector-compact__lap {
  color: #facc15;
  font: italic 700 calc(42px * var(--hud-scale, 1))/0.92 var(--hud-font-num);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.sector-compact__lap.sector-compact__lap--invalid { color: #dc1010; }
.sector-compact__lap.sector-compact__lap--unknown { color: #6f7277; }

.sector-compact__rows {
  display: grid;
  flex: 1;
  margin-top: calc(6px * var(--hud-scale, 1));
  grid-template-rows: repeat(3, minmax(0, 1fr));
  gap: calc(5px * var(--hud-scale, 1));
  min-height: 0;
  overflow: hidden;
}

/* Label, time and delta/live/wait sit on one shared baseline; the line itself is
   centred vertically in the row (align-content), so the three read as one row. */
.sector-compact__row {
  display: grid;
  grid-template-columns: calc(36px * var(--hud-scale, 1)) minmax(0, 1fr) max-content;
  align-items: baseline;
  align-content: center;
  gap: calc(8px * var(--hud-scale, 1));
  box-sizing: border-box;
  min-height: 0;
  padding: 0 calc(8px * var(--hud-scale, 1));
  overflow: hidden;
  border: 0;
  background: rgba(255, 255, 255, 0.045);
}

/* Same face as the times and the live/wait words, so "S1" belongs to the row. */
.sector-compact__label {
  color: #a3a5ae;
  font: italic 700 calc(20px * var(--hud-scale, 1))/1 var(--hud-font-num);
  letter-spacing: 0.02em;
}

/* overflow: clip (not hidden) keeps the content baseline for the row alignment. */
.sector-compact__row .sector-compact__time,
.sector-compact__row .sector-compact__time > span {
  overflow: clip;
  color: #f4f4f6;
  font: italic 700 calc(32px * var(--hud-scale, 1))/1 var(--hud-font-num);
  font-variant-numeric: tabular-nums;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sector-compact__row .sector-compact__time > .sector-compact__time-value--long {
  font-size: calc(26px * var(--hud-scale, 1));
}

.sector-compact__delta {
  justify-self: end;
  overflow: visible;
  font: italic 700 calc(19px * var(--hud-scale, 1))/1 var(--hud-font-num);
  font-variant-numeric: tabular-nums;
  text-transform: uppercase;
}

/* Sectors not reached yet stay dimmer; the running one is lifted. */
.sector-compact__row--pending .sector-compact__time,
.sector-compact__row--pending .sector-compact__time > span {
  color: #6f7277;
}

.sector-compact__row--running {
  background: rgba(255, 255, 255, 0.09);
}

.sector-compact__row--running .sector-compact__label {
  color: #f4f4f6;
}
</style>
