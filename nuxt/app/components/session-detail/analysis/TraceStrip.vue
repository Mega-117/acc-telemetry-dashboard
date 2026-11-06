<script setup lang="ts">
// Sectors and corners on top of the charts, aligned to their distance axis (Track Titan's segment strip, MoTeC's
// section bar). 05/11 (user): no head bar any more (the extra channels are always shown; "Torna al giro intero" sits
// over the map); "Settore 1" written in full when the box has room, "S1" when not (many sectors); big ◀ ▶ step the open
// sector or corner. The gap of the open stretch sits at the right of the Delta header, as a number only.
import { formatDelta } from '~/services/telemetry/lapAnalysis'
import { useI18n } from '~/i18n'

interface Placed { left: number, width: number }
const props = defineProps<{
  sectors: (Placed & { index: number })[]
  corners: (Placed & { number: number, lost: number })[]
  selectedSector: number | null
  selectedCorner: number | null
  /** A sector or a corner is open: the arrows show. */
  canStep: boolean
}>()
const emit = defineEmits<{ sector: [index: number], corner: [number: number], step: [direction: -1 | 1] }>()
const { t } = useI18n()
// The arrows step the open sector, else the open segment (useCornerStepper).
const stepLabel = (dir: 'Prev' | 'Next') => t(`telemetry.step${dir}${props.selectedSector !== null ? 'Sector' : 'Corner'}`)
const tone = (s: number | null | undefined) => s === null || s === undefined ? '' : s >= 0.01 ? 'loss' : s <= -0.01 ? 'gain' : ''
</script>

<template>
  <div class="trace-strip" :class="{ 'is-stepping': canStep }">
    <div v-if="sectors.length" class="strip-row strip-row--sectors">
      <button v-for="s in sectors" :key="s.index" type="button" :class="{ active: selectedSector === s.index }" :style="{ left: `${s.left}%`, width: `${s.width}%` }"
        :title="t('telemetry.sectorStripTitle', { n: s.index + 1 })" data-testid="strip-sector" @click="emit('sector', s.index)">
        <span class="strip-long">{{ t('telemetry.sectorN', { n: s.index + 1 }) }}</span><span class="strip-short">S{{ s.index + 1 }}</span>
      </button>
    </div>
    <div class="strip-row strip-row--corners">
      <button v-for="c in corners" :key="c.number" type="button" :class="[{ active: selectedCorner === c.number }, tone(c.lost)]" :style="{ left: `${c.left}%`, width: `${c.width}%` }"
        :title="`${t('telemetry.corner', { n: c.number })}: ${formatDelta(c.lost)} s`" data-testid="strip-corner" @click="emit('corner', c.number)">
        <template v-if="selectedCorner === c.number">
          <span class="strip-long">{{ t('telemetry.corner', { n: c.number }) }}</span><span class="strip-short">{{ c.number }}</span>
        </template>
        <template v-else>{{ c.number }}</template>
      </button>
    </div>
    <template v-if="canStep">
      <!-- 06/11 (user): one pair of arrows; their label says what they step, the open sector or segment. -->
      <button type="button" class="strip-step strip-step--prev" data-testid="strip-prev" :aria-label="stepLabel('Prev')" :title="`${stepLabel('Prev')} (←)`" @click="emit('step', -1)">
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10.5 3 5.5 8l5 5" /></svg>
      </button>
      <button type="button" class="strip-step strip-step--next" data-testid="strip-next" :aria-label="stepLabel('Next')" :title="`${stepLabel('Next')} (→)`" @click="emit('step', 1)">
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5.5 3l5 5-5 5" /></svg>
      </button>
    </template>  </div>
</template>

<style scoped lang="scss">
// The rows start over the charts' 42 px axis; the ◀ sits in that gutter, the ▶ over the right end.
.trace-strip { position: relative; display: grid; gap: 2px; padding: 4px 0 4px 43px; }
// A dark track under each row, so the gaps between boxes read as the lap, not as holes.
.strip-row { position: relative; height: 24px; background: #ffffff06;
  // 06/11 (user: "you hardly see they are clickable, nor where one ends"): a light line between the boxes (not a dark
  // gap) and a slightly fuller ground; the hover fills more. Still flat, not bricks.
  button { position: absolute; top: 0; height: 100%; display: flex; align-items: center; justify-content: center; gap: 8px; padding: 0 6px; border: 0; box-shadow: inset -1px 0 #ffffff33;
    background: #ffffff12; color: #c8c8cc; font: 700 12px 'Inter', sans-serif; font-variant-numeric: tabular-nums; cursor: pointer; overflow: hidden; white-space: nowrap; transition: background .15s ease, color .15s ease;
    &:hover { background: #ffffff2b; color: #fff; }
    &:focus-visible { outline: 2px solid #fff; outline-offset: -2px; }
    &.active { background: #ffffff33; color: #fff; box-shadow: inset 0 -2px #fff, inset -1px 0 #ffffff33; } }
  // Each box asks its own width: the full word when it fits.
  &--sectors { height: 26px; button { container-type: inline-size; font: italic 700 13px 'Racer Display', 'Arial Narrow', sans-serif; text-transform: uppercase; letter-spacing: .02em; } }
  &--corners { height: 22px;
    button { container-type: inline-size; background: #ffffff12; font-size: 11px;
      &.gain { color: #3ddc5a; } &.loss { color: #ff5a6e; }
      &.active { color: #fff; } } } }
.strip-long { display: none; }
@container (min-width: 76px) { .strip-long { display: inline; } .strip-short { display: none; } }
// 06/11 (user): light as the site's secondary button (.rc-btn: thin white edge, a fuller white on hover), not a dark box
// going red. The ground stays nearly opaque: the arrows sit over the strip's ends.
.strip-step { position: absolute; top: 4px; bottom: 4px; z-index: 1; display: grid; place-items: center; width: 34px; padding: 0; border: 0; box-shadow: inset 0 0 0 1px #ffffff59; background: #121217; color: #fff; cursor: pointer; transition: background .15s ease, box-shadow .15s ease;
  svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2.4; stroke-linecap: round; stroke-linejoin: round; }
  &:hover { background: #2a2a30; box-shadow: inset 0 0 0 1px #ffffffb3; }
  &:focus-visible { outline: 2px solid #fff; outline-offset: 1px; }
  &--prev { left: 4px; } &--next { right: 0; } }</style>
