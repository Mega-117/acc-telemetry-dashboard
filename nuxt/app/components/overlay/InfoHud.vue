<script setup lang="ts">
import type { InfoPresentation, InfoTargetOutcome } from '~/utils/infoPresentation'

const props = defineProps<{
  model: InfoPresentation
  localTimeValue: string
  lapTimerValue: string
  lapTimerOutcome: InfoTargetOutcome
  lapTimerFading: boolean
  backgroundOpacity: number
}>()

function rowValue(row: InfoPresentation['rows'][number]): string {
  if (row.localTime) return props.localTimeValue
  return row.lapTimer ? props.lapTimerValue : row.value
}
</script>

<template>
  <section
    class="info-hud"
    :class="{ 'info-hud--yellow-flag': model.yellowFlagActive }"
    :style="{ '--info-background-opacity': String(backgroundOpacity) }"
    aria-label="Info"
  >
    <div
      v-if="model.delta.visible"
      class="info-delta"
      :class="[`info-delta--${model.delta.side}`, { 'info-delta--purple': model.delta.purple }]"
    >
      <div class="info-delta__bar" aria-hidden="true">
        <i :style="{ width: model.delta.side === 'zero' ? '0%' : `${model.delta.ratio * 100}%` }" />
      </div>
      <strong>{{ model.delta.value }}</strong>
    </div>

    <div class="info-hud__rows">
      <div
        v-for="row in model.rows"
        :key="row.id"
        class="info-row"
        :class="[
          `info-row--${row.tone}`,
          {
            'info-row--lap-timer': row.lapTimer,
            'info-row--inside': row.lapTimer && lapTimerOutcome === 'inside',
            'info-row--outside': row.lapTimer && lapTimerOutcome === 'outside',
            'info-row--fading': row.lapTimer && lapTimerFading,
          },
        ]"
      >
        <span>{{ row.label }}</span>
        <strong>{{ rowValue(row) }}</strong>
      </div>
    </div>
  </section>
</template>

<style scoped>
.info-hud {
  box-sizing: border-box;
  width: 344px;
  height: 512px;
  padding: 20px 20px 18px;
  overflow: hidden;
  border-radius: 24px;
  color: #fff;
  background: rgba(0, 0, 0, var(--info-background-opacity, 0.8));
  font-family: Arial, Helvetica, sans-serif;
  font-weight: 800;
  text-shadow: 0 1px 1px rgba(0, 0, 0, 0.22);
}

.info-hud--yellow-flag {
  box-shadow: inset 0 0 0 5px #ffd400;
}

.info-delta {
  position: relative;
  height: 47px;
  overflow: hidden;
  border-radius: 2px;
  background: rgba(144, 144, 144, 0.95);
  color: #090909;
}

.info-delta__bar {
  position: absolute;
  inset: 0;
  overflow: hidden;
}

.info-delta__bar i {
  position: absolute;
  inset-block: 0;
  left: 0;
  display: block;
  transition: width 80ms linear;
}
.info-delta--negative .info-delta__bar i { background: #9acd32; }
.info-delta--positive .info-delta__bar i { background: #ef3038; }
.info-delta--purple .info-delta__bar i { background: #d000e8; }
.info-delta--positive, .info-delta--purple { color: #fff; }

.info-delta strong {
  position: relative;
  z-index: 1;
  display: grid;
  height: 100%;
  place-items: center;
  font-size: 29px;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.info-hud__rows {
  display: grid;
  align-content: start;
  gap: 2px;
  padding-top: 8px;
}

.info-row {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  align-items: center;
  min-height: 34px;
  padding: 0 2px;
  border-radius: 3px;
  font-size: 27px;
  line-height: 1;
  letter-spacing: -0.7px;
}

.info-row span { white-space: nowrap; }
.info-row strong {
  min-width: 0;
  padding-left: 12px;
  overflow: hidden;
  text-overflow: clip;
  white-space: nowrap;
  font-size: inherit;
  font-variant-numeric: tabular-nums;
}

.info-row--yellow strong { color: #f5ec00; }
.info-row--orange strong { color: #ff9d00; }
.info-row--green strong { color: #8ee14a; }
.info-row--red strong { color: #ff2f38; }

.info-row--lap-timer {
  transition: background-color 500ms ease, color 500ms ease;
}
.info-row--lap-timer.info-row--inside { color: #fff; background: #238a3d; }
.info-row--lap-timer.info-row--outside { color: #fff; background: #b4262c; }
.info-row--lap-timer.info-row--fading { background: transparent; color: #fff; }
</style>
