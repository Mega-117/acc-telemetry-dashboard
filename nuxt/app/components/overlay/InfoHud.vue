<script setup lang="ts">
import HudOverlayBackground from '~/components/overlay/HudOverlayBackground.vue'
import type { InfoPresentation } from '~/utils/infoPresentation'

const props = defineProps<{
  model: InfoPresentation
  localTimeValue: string
  backgroundOpacity: number
}>()

function rowValue(row: InfoPresentation['rows'][number]): string {
  if (row.localTime) return props.localTimeValue
  return row.value
}
</script>

<template>
  <section
    class="info-hud"
    :class="{ 'info-hud--yellow-flag': model.yellowFlagActive }"
    aria-label="Info"
  >
    <HudOverlayBackground :opacity="backgroundOpacity" />
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
        :class="`info-row--${row.tone}`"
      >
        <span>{{ row.label }}</span>
        <strong>{{ rowValue(row) }}</strong>
      </div>
    </div>
  </section>
</template>

<style scoped>
.info-hud {
  position: relative;
  box-sizing: border-box;
  width: 344px;
  height: auto;
  padding: 20px 20px 18px;
  overflow: visible;
  border-radius: 24px;
  color: #fff;
  background: transparent;
  font-family: Arial, Helvetica, sans-serif;
  font-weight: 800;
  text-shadow: 0 1px 1px rgba(0, 0, 0, 0.22);
}

.info-hud > :not(.hud-overlay-background) {
  position: relative;
  z-index: 1;
}

.info-hud--yellow-flag {
  box-shadow: none;
}

.info-hud--yellow-flag::after {
  position: absolute;
  z-index: 2;
  inset: 0;
  border: 5px solid #ffff00;
  border-radius: 24px;
  content: '';
  pointer-events: none;
}

.info-delta {
  position: relative;
  height: 47px;
  overflow: hidden;
  border-radius: 2px;
  background: #808080;
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
}
.info-delta--negative .info-delta__bar i { background: #9acd32; }
.info-delta--positive .info-delta__bar i { background: #ff0000; }
.info-delta--purple .info-delta__bar i { background: #b600b6; }
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

.info-row--yellow strong { color: #ffff00; }
.info-row--orange strong { color: #ffa500; }
.info-row--green strong { color: #008000; }
.info-row--red strong { color: #ff0000; }

</style>
