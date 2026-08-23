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
}))

const gridTemplateColumns = computed(() => [
  `${props.model.layout.columnWidths.position}px`,
  `${props.model.layout.columnWidths.driver}px`,
  ...(props.model.columns.carNumber ? [`${props.model.layout.columnWidths.carNumber}px`] : []),
  `${props.model.layout.columnWidths.pit}px`,
  ...(props.model.columns.bestLap ? [`${props.model.layout.columnWidths.bestLap}px`] : []),
  ...(props.model.columns.lastLap ? [`${props.model.layout.columnWidths.lastLap}px`] : []),
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
          <strong v-if="model.header.sessionType">{{ model.header.sessionType }}</strong>
          <strong v-if="model.header.timeLeft">{{ model.header.timeLeft }}</strong>
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
        <span v-if="model.columns.carNumber"></span>
        <span></span>
        <strong v-if="model.columns.bestLap">Best</strong>
        <strong v-if="model.columns.lastLap">Last</strong>
      </div>
    </header>

    <div class="standings-rows">
      <div
        v-for="row in model.rows"
        :key="row.carIndex ?? 'local'"
        class="standings-row"
        :class="{ 'is-local': row.local }"
        :style="{ gridTemplateColumns }"
      >
        <strong
          class="standings-row__position"
          :class="!row.local && row.positionFlash ? `is-${row.positionFlash}` : null"
        >{{ row.position ?? '—' }}</strong>
        <strong class="standings-row__driver">{{ row.driverName }}</strong>
        <strong
          v-if="model.columns.carNumber"
          class="standings-row__number"
          :class="{ 'has-number': row.carNumber !== null }"
        >{{ row.carNumber }}</strong>
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
.standings-hud { position:relative;box-sizing:border-box;display:grid;overflow:hidden;border-radius:8px;color:white;background:transparent;font-family:Arial,Helvetica,sans-serif;font-size:18px;font-weight:700;font-variant-numeric:tabular-nums; }
.standings-hud > :not(.hud-overlay-background) { position:relative;z-index:1; }
.standings-header { display:grid;grid-template-rows:24px 24px;min-width:0;overflow:hidden;color:white;font-weight:700;white-space:nowrap; }
.standings-header__meta { display:flex;align-items:flex-start;min-width:0;gap:28px;font-size:18px; }
.standings-header__left { display:flex;min-width:0;gap:28px;align-items:center;overflow:hidden;text-overflow:ellipsis; }
.standings-header__temperature { flex:none;margin-left:auto; }
.standings-columns { display:grid;column-gap:var(--standings-column-gap);align-items:end;min-width:0;color:rgba(255,255,255,0.72);font-size:12px;line-height:1;text-transform:uppercase; }
.standings-columns strong { min-width:0;text-align:right; }
.standings-rows { display:grid;grid-auto-rows:var(--standings-row-height);row-gap:var(--standings-row-gap);align-content:start;align-items:stretch;min-height:0;overflow:hidden; }
.standings-recovery { display:flex;align-items:center;min-height:var(--standings-row-height);margin:0;color:rgba(255,255,255,0.76);font-size:14px;font-weight:600;letter-spacing:0.01em; }
.standings-row { position:relative;display:grid;height:var(--standings-row-height);min-height:var(--standings-row-height);column-gap:var(--standings-column-gap);align-items:center;box-sizing:border-box;overflow:hidden;color:white;font-size:18px;font-weight:700;line-height:1; }
.standings-row > strong { position:relative;z-index:1;box-sizing:border-box;min-width:0;white-space:nowrap; }
.standings-row.is-local { background:rgba(0,170,255,0.34);box-shadow:inset 1px 0 rgba(131,231,255,0.72),inset -1px 0 rgba(131,231,255,0.72),inset 0 1px rgba(131,231,255,0.72); }
.standings-row__position { display:flex;align-items:center;justify-content:center;height:24px;color:black;background:yellow; }
.standings-row__position.is-improved { color:white;background:green; }
.standings-row__position.is-worsened { color:white;background:red; }
.standings-row.is-local .standings-row__position { color:#00141c;background:#4de3ff; }
.standings-row__driver { min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }
.standings-row__number { display:flex;width:100%;height:24px;align-items:center;justify-content:center;overflow:hidden;background:transparent;color:white;text-align:center; }
.standings-row__number.has-number { color:#000;background:#fff; }
.standings-row__pit { display:flex;width:100%;aspect-ratio:1;align-items:center;justify-content:center;overflow:hidden;background:transparent;color:white;text-align:center; }
.standings-row__pit.is-active { color:#000;background:#fff; }
.standings-row__best,.standings-row__last { text-align:right; }
.standings-row__best.is-fastest { color:magenta; }
.standings-row__last.is-pb-focused { color:yellow; }
.standings-row__last.is-pb-other { color:green; }
.standings-row__progress-track { position:absolute;z-index:2;right:0;bottom:0;left:0;height:2px;overflow:hidden;background:rgba(255,255,255,0.18); }
.standings-row__progress { display:block;height:100%;max-width:100%;background:white;opacity:0.72; }
</style>
