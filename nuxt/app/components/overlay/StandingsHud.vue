<script setup lang="ts">
import { computed } from 'vue'
import HudOverlayBackground from '~/components/overlay/HudOverlayBackground.vue'
import type { StandingsPresentation } from '~/services/overlay/standingsPresentation'

const props = defineProps<{
  model: StandingsPresentation
  backgroundOpacity: number
}>()

const layoutStyle = computed(() => ({
  width: `${props.model.layout.width}px`,
  height: `${props.model.layout.height}px`,
  padding: `${props.model.layout.paddingY}px ${props.model.layout.paddingX}px`,
  gridTemplateRows: `${props.model.layout.headerHeight}px minmax(0, 1fr)`,
  '--standings-row-height': `${props.model.layout.rowHeight}px`,
  '--standings-row-gap': `${props.model.layout.rowGap}px`,
  '--standings-column-gap': `${props.model.layout.columnGap}px`,
  '--standings-vehicle-gap': `${props.model.layout.vehicleGap}px`,
  '--standings-manufacturer-width': `${props.model.layout.columnWidths.manufacturer}px`,
  '--standings-number-width': `${props.model.layout.columnWidths.carNumber}px`,
}))

const vehicleWidth = computed(() => (
  props.model.layout.columnWidths.manufacturer
  + (props.model.columns.carNumber
    ? props.model.layout.vehicleGap + props.model.layout.columnWidths.carNumber
    : 0)
))

const gridTemplateColumns = computed(() => [
  `${props.model.layout.columnWidths.position}px`,
  `${props.model.layout.columnWidths.driver}px`,
  `${vehicleWidth.value}px`,
  `${props.model.layout.columnWidths.pit}px`,
  ...(props.model.columns.bestLap ? [`${props.model.layout.columnWidths.bestLap}px`] : []),
  ...(props.model.columns.lastLap ? [`${props.model.layout.columnWidths.lastLap}px`] : []),
  `${props.model.layout.columnWidths.gap}px`,
  ...(props.model.columns.stint ? [`${props.model.layout.columnWidths.stint}px`] : []),
].join(' '))
</script>

<template>
  <section
    v-if="model.visible"
    class="standings-hud"
    :style="layoutStyle"
    aria-label="Classifica"
  >
    <HudOverlayBackground :opacity="backgroundOpacity" />

    <header class="standings-header">
      <div class="standings-header__meta">
        <span class="standings-header__left">
          <strong v-if="model.header.sessionType" class="standings-header__session">{{ model.header.sessionType }}</strong>
          <strong v-if="model.header.timeLeft" class="standings-header__time">{{ model.header.timeLeft }}</strong>
        </span>
        <strong
          v-if="model.header.temperatures"
          class="standings-header__temperature"
          aria-label="Temperatura aria e pista"
        >{{ model.header.temperatures }}</strong>
      </div>
      <div
        class="standings-columns"
        :style="{ gridTemplateColumns }"
        aria-hidden="true"
      >
        <span></span>
        <span></span>
        <span></span>
        <span></span>
        <strong v-if="model.columns.bestLap">Best</strong>
        <strong v-if="model.columns.lastLap">Last</strong>
        <strong>Gap</strong>
        <strong v-if="model.columns.stint">Stint</strong>
      </div>
    </header>

    <div class="standings-rows">
      <div
        v-for="(row, rowIndex) in model.rows"
        :key="row.carIndex ?? 'local'"
        class="standings-row"
        :class="{ 'is-local': row.local, 'is-alt': rowIndex % 2 === 1 }"
        :style="{ gridTemplateColumns }"
      >
        <strong
          class="standings-row__position"
          :class="!row.local && row.positionFlash ? `is-${row.positionFlash}` : null"
        >{{ row.position ?? '—' }}</strong>
        <!-- HUD style v2 (27/10): the car model line is gone by product decision; the logo stays. -->
        <strong class="standings-row__driver" :title="row.carModel ?? undefined">{{ row.driverName }}</strong>
        <span class="standings-row__vehicle">
          <span
            class="standings-row__manufacturer"
            :aria-label="row.manufacturerName"
            :title="row.manufacturerName"
          >
            <img
              class="standings-row__manufacturer-logo"
              :src="row.manufacturerLogoSrc"
              alt=""
              aria-hidden="true"
              draggable="false"
            >
          </span>
          <strong
            v-if="model.columns.carNumber"
            class="standings-row__number"
            :class="row.carNumber !== null ? ['has-number', `is-${row.carNumberVariant}`] : null"
          >{{ row.carNumber }}</strong>
        </span>
        <strong
          class="standings-row__pit"
          :class="{ 'is-active': row.inPitLane }"
          :aria-label="row.inPitLane ? 'In pit lane' : 'In pista'"
        >{{ row.inPitLane ? 'P' : '' }}</strong>
        <strong
          v-if="model.columns.bestLap"
          class="standings-row__best"
          :class="{ 'is-fastest': row.fastestInClass }"
        >{{ row.bestLap }}</strong>
        <strong
          v-if="model.columns.lastLap"
          class="standings-row__last"
          :class="row.lastLapPersonalBest ? `is-pb-${row.lastLapPersonalBest}` : null"
        >{{ row.lastLap }}</strong>
        <strong
          class="standings-row__gap"
          :class="`is-${row.relativeGapTone}`"
        >{{ row.relativeGap }}</strong>
        <!-- Stint is the last column on the right (user request 14/10). -->
        <strong v-if="model.columns.stint" class="standings-row__stint">{{ row.stintTime ?? '—' }}</strong>
        <span
          v-if="model.columns.progress"
          class="standings-row__progress-track"
          aria-hidden="true"
        >
          <i
            class="standings-row__progress"
            :style="{ width: `${row.progressPercent ?? 0}%` }"
          ></i>
        </span>
      </div>
      <p
        v-if="model.message"
        class="standings-recovery"
        role="status"
      >{{ model.message }}</p>
    </div>
  </section>
</template>

<style scoped>
/* HUD style v2 (27/10, approved mock docs/wiki/frontend/assets/2026-10-27-hud-stili-v2.html):
   Chakra Petch numbers and names, condensed labels, alternating rows, a white veil on the local row. */
.standings-hud { position:relative;box-sizing:border-box;display:grid;overflow:hidden;border-radius:8px;color:#f4f4f6;background:transparent;font-family:var(--hud-font-label);font-size:18px;font-weight:700;font-variant-numeric:tabular-nums; }
.standings-hud > :not(.hud-overlay-background) { position:relative;z-index:1; }
.standings-header { display:grid;grid-template-rows:24px 24px;min-width:0;overflow:hidden;color:#f4f4f6;font-weight:700;white-space:nowrap;box-shadow:inset 0 -1px rgba(255,255,255,0.15); }
.standings-header__meta { display:flex;align-items:center;min-width:0;gap:28px;padding:0 4px;font-size:18px; }
.standings-header__left { display:flex;min-width:0;gap:10px;align-items:baseline;overflow:hidden;text-overflow:ellipsis; }
.standings-header__session { color:#a3a5ae;font:700 15px/1 var(--hud-font-label);letter-spacing:0.08em;text-transform:uppercase; }
.standings-header__time { font:italic 700 17px/1 var(--hud-font-num); }
.standings-header__temperature { flex:none;margin-left:auto;font:italic 700 16px/1 var(--hud-font-num); }
.standings-columns { display:grid;column-gap:var(--standings-column-gap);align-items:center;min-width:0;padding:0 0 2px;color:#a3a5ae;font:700 12px/1 var(--hud-font-label);letter-spacing:0.08em;text-transform:uppercase; }
.standings-columns strong { min-width:0;text-align:right; }
.standings-rows { display:grid;grid-auto-rows:var(--standings-row-height);row-gap:var(--standings-row-gap);align-content:start;align-items:stretch;min-height:0;overflow:hidden; }
.standings-recovery { display:flex;align-items:center;min-height:var(--standings-row-height);margin:0;color:rgba(255,255,255,0.76);font-size:14px;font-weight:600;letter-spacing:0.01em; }
/* Rows alternate (class from the row index) so they stay distinguishable beyond the fifth. */
.standings-row { position:relative;display:grid;height:var(--standings-row-height);min-height:var(--standings-row-height);column-gap:var(--standings-column-gap);align-items:center;box-sizing:border-box;overflow:hidden;color:#f4f4f6;background:rgba(255,255,255,0.04);font:italic 600 17px/1 var(--hud-font-num); }
.standings-row.is-alt { background:rgba(0,0,0,0.2); }
.standings-row > strong { position:relative;z-index:1;box-sizing:border-box;min-width:0;white-space:nowrap; }
/* Local row: a light veil fading to the right with a solid white edge; never red. */
.standings-row.is-local { background:linear-gradient(90deg,rgba(255,255,255,0.22),rgba(255,255,255,0.08) 55%,rgba(255,255,255,0.02));box-shadow:inset 4px 0 #fff; }
.standings-row__position { display:flex;align-items:center;justify-content:center;height:calc(var(--standings-row-height) - 6px);color:#f4f4f6;background:rgba(255,255,255,0.1);font-weight:700; }
.standings-row__position.is-improved { color:white;background:green; }
.standings-row__position.is-worsened { color:white;background:red; }
.standings-row.is-local .standings-row__position { color:#0b0c0f;background:#fff; }
.standings-row__driver { min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600; }
.standings-row.is-local .standings-row__driver { font-weight:700; }
.standings-row__vehicle { position:relative;z-index:1;display:flex;min-width:0;gap:var(--standings-vehicle-gap);align-items:center; }
.standings-row__manufacturer { display:flex;flex:0 0 var(--standings-manufacturer-width);width:var(--standings-manufacturer-width);height:calc(var(--standings-row-height) - 6px);align-items:center;justify-content:center;overflow:hidden;background:#f2f2f2;outline:1px solid rgba(0,0,0,0.1);outline-offset:-1px; }
.standings-row__manufacturer-logo { display:block;width:34px;height:calc(var(--standings-row-height) - 6px);object-fit:contain;object-position:center;user-select:none; }
.standings-row__number { display:flex;flex:0 0 var(--standings-number-width);width:var(--standings-number-width);height:calc(var(--standings-row-height) - 6px);align-items:center;justify-content:center;overflow:hidden;background:transparent;color:#f4f4f6;text-align:center;font-weight:700; }
.standings-row__number.has-number { color:#000;background:#fff;box-shadow:inset 0 0 0 1px rgba(255,255,255,0.33); }
.standings-row__number.has-number.is-pro-am { color:#fff;background:#000; }
.standings-row__number.has-number.is-am { color:#fff;background:#f00; }
.standings-row__number.has-number.is-silver { color:#fff;background:#707070; }
.standings-row__pit { display:flex;width:100%;height:calc(var(--standings-row-height) - 6px);align-items:center;justify-content:center;overflow:hidden;background:transparent;color:white;text-align:center;font-weight:700; }
.standings-row__pit.is-active { color:#000;background:#fff; }
.standings-row__best,.standings-row__last { text-align:right; }
.standings-row__stint { text-align:right; }
.standings-row__gap { overflow:hidden;text-align:right;text-overflow:clip;font-size:16px; }
.standings-row__gap.is-ahead { color:#ff9d00; }
.standings-row__gap.is-behind { color:#00e7f0; }
.standings-row__gap.is-neutral { color:rgba(255,255,255,0.64); }
.standings-row__best.is-fastest { color:magenta; }
.standings-row__last.is-pb-focused { color:yellow; }
.standings-row__last.is-pb-other { color:green; }
.standings-row__progress-track { position:absolute;z-index:2;right:0;bottom:0;left:0;height:2px;overflow:hidden;background:rgba(255,255,255,0.07); }
.standings-row__progress { display:block;height:100%;max-width:100%;background:white;opacity:0.72; }
.standings-row.is-local .standings-row__progress { opacity:1; }
</style>
