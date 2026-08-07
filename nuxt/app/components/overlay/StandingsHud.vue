<script setup lang="ts">
import HudOverlayBackground from '~/components/overlay/HudOverlayBackground.vue'
import type { StandingsPresentation } from '~/services/overlay/standingsPresentation'

defineProps<{
  model: StandingsPresentation
  backgroundOpacity: number
}>()
</script>

<template>
  <section
    v-if="model.visible"
    class="standings-hud"
    aria-label="Classifica"
  >
    <HudOverlayBackground :opacity="backgroundOpacity" />

    <header class="standings-header">
      <span class="standings-header__left">
        <strong v-if="model.header.sessionType">{{ model.header.sessionType }}</strong>
        <strong v-if="model.header.timeLeft">{{ model.header.timeLeft }}</strong>
      </span>
      <span class="standings-header__right">
        <strong v-if="model.header.temperatures">{{ model.header.temperatures }}</strong>
        <strong v-if="model.header.carClass">{{ model.header.carClass }}</strong>
      </span>
    </header>

    <div class="standings-rows">
      <div
        v-for="row in model.rows"
        :key="row.carIndex"
        class="standings-row"
        :class="{ 'has-progress': model.columns.progress && row.hasProgress }"
      >
        <strong
          class="standings-row__position"
          :class="row.positionFlash ? `is-${row.positionFlash}` : null"
        >{{ row.position }}</strong>
        <strong class="standings-row__driver">{{ row.driverName }}</strong>
        <strong
          v-if="model.columns.carNumber"
          class="standings-row__number"
          :style="{
            backgroundColor: row.carNumberColors.background,
            color: row.carNumberColors.color,
          }"
        >{{ row.carNumber }}</strong>
        <strong class="standings-row__pit">{{ row.inPitLane ? 'P' : '' }}</strong>
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
        <i
          v-if="model.columns.progress && row.hasProgress"
          class="standings-row__progress"
          :style="{ width: `${row.progressPercent}%` }"
          aria-hidden="true"
        ></i>
      </div>
    </div>
  </section>
</template>

<style scoped>
.standings-hud {
  position: relative;
  box-sizing: border-box;
  display: grid;
  grid-template-rows: 40px minmax(0, 1fr);
  width: 900px;
  height: 600px;
  padding: 10px 0;
  overflow: hidden;
  border-radius: 8px;
  color: white;
  background: transparent;
  font-family: Arial, Helvetica, sans-serif;
  font-size: 18px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.standings-hud > :not(.hud-overlay-background) {
  position: relative;
  z-index: 1;
}

.standings-header {
  display: flex;
  align-items: center;
  gap: 28px;
  margin: 0 10px;
  overflow: hidden;
  color: white;
  font-size: 18px;
  font-weight: 700;
  white-space: nowrap;
}

.standings-header__left,
.standings-header__right {
  display: flex;
  gap: 28px;
  align-items: center;
}

.standings-header__right { margin-left: auto; }

.standings-rows {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  min-height: 0;
  overflow: hidden;
}

.standings-row {
  position: relative;
  display: flex;
  gap: 8px;
  align-items: center;
  box-sizing: border-box;
  height: 24px;
  min-height: 24px;
  margin: 0 10px;
  overflow: hidden;
  color: white;
  font-size: 18px;
  font-weight: 700;
  line-height: 1;
}

.standings-row.has-progress {
  height: 28px;
  min-height: 28px;
  padding-bottom: 4px;
}

.standings-row > strong {
  position: relative;
  z-index: 1;
  box-sizing: border-box;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.standings-row__position {
  display: flex;
  flex: 0 0 30px;
  align-items: center;
  justify-content: center;
  height: 24px;
  color: black;
  background: yellow;
}

.standings-row__position.is-improved {
  color: white;
  background: green;
}

.standings-row__position.is-worsened {
  color: white;
  background: red;
}

.standings-row__driver { flex: 0 0 140px; }
.standings-row__number { flex: 0 0 50px; text-align: center; }
.standings-row__pit { flex: 0 0 22px; text-align: center; }
.standings-row__best,
.standings-row__last { flex: 0 0 76px; text-align: right; }
.standings-row__best.is-fastest { color: magenta; }
.standings-row__last.is-pb-focused { color: yellow; }
.standings-row__last.is-pb-other { color: green; }

.standings-row__progress {
  position: absolute;
  bottom: 0;
  left: 0;
  z-index: 0;
  height: 4px;
  max-width: 100%;
  background: white;
  opacity: 0.6;
}

</style>
