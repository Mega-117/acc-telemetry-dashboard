<script setup lang="ts">
import HudFixedDigits from '~/components/overlay/HudFixedDigits.vue'
import HudOverlayBackground from '~/components/overlay/HudOverlayBackground.vue'
import { infoDeltaFillStyle, infoRowLabel, type InfoPresentation } from '~/utils/infoPresentation'

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
  <!-- Info (PIP-671, approved draft "Info" 30/10): 300px, only the top-right corner cut (the
       bottom-left one stays at 90°), centre-out Delta bar, large LABEL ... value rows; a warning
       row takes the caution band. Ticking values never move (tabular figures). -->
  <section
    class="info-hud"
    :class="{ 'info-hud--yellow-flag': model.yellowFlagActive }"
    aria-label="Info"
  >
    <!-- Background transparency acts on this layer only, never on the content. -->
    <HudOverlayBackground :opacity="backgroundOpacity" />
    <div
      v-if="model.delta.visible"
      class="info-delta"
      :class="[`info-delta--${model.delta.side}`, { 'info-delta--purple': model.delta.purple }]"
    >
      <div class="info-delta__bar" aria-hidden="true">
        <i :style="infoDeltaFillStyle(model.delta)" />
      </div>
      <strong><HudFixedDigits :value="model.delta.value" /></strong>
    </div>

    <dl class="info-hud__rows">
      <div
        v-for="row in model.rows"
        :key="row.id"
        class="info-row"
        :class="[`info-row--${row.tone}`, { 'info-row--caution': row.caution }]"
      >
        <dt>{{ infoRowLabel(row.label) }}</dt>
        <dd><HudFixedDigits :value="rowValue(row)" /></dd>
      </div>
    </dl>
  </section>
</template>

<style scoped lang="scss">
@use '~/assets/scss/hud-cut-corner' as *;
@use '~/assets/scss/hud-gauge' as *;

.info-hud {
  box-sizing: border-box;
  display: grid;
  gap: 8px;
  width: 300px;
  height: auto;
  // Draft: 12px inside a 3px frame.
  padding: 15px;
  color: #f4f6f8;
  background: transparent;
  @include hud-gauge-type;
  @include hud-cut-corner(0px, 14px, $hud-hairline-width, $hud-hairline-color, 'info-hud--yellow-flag', $hud-flag-width);
}

.info-hud > :not(.hud-overlay-background) {
  position: relative;
  z-index: 1;
}

.info-delta {
  position: relative;
  height: 64px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
}

.info-delta__bar {
  position: absolute;
  inset: 0;
  overflow: hidden;
}

.info-delta__bar i {
  position: absolute;
  inset-block: 0;
  display: block;
}

/* White centre line: the reference the fill grows from. */
.info-delta__bar::after {
  position: absolute;
  inset-block: 0;
  left: 50%;
  width: 2px;
  background: #fff;
  content: '';
  transform: translateX(-1px);
}
.info-delta--negative .info-delta__bar i { background: #9acd32; }
.info-delta--positive .info-delta__bar i { background: #ef4444; }
.info-delta--purple .info-delta__bar i { background: #b600b6; }

.info-delta strong {
  position: relative;
  z-index: 1;
  display: grid;
  height: 100%;
  place-items: center;
  font: 800 48px/1 var(--hud-gauge-num);
  text-shadow: 0 0 4px #000;
}

.info-hud__rows {
  display: grid;
  align-content: start;
  margin: 0;
}

.info-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  min-height: 43px;
  box-sizing: border-box;
  padding: 5px 2px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

/* Readability at the minimum size (owner, 28/10): the page scales the whole canvas by transform, so
   a floor of N rendered px is N / --hud-scale here: labels never render below 12px, values never
   below 14px. Draft sizes at scale 1: labels 20px, values 27px. */
.info-row dt {
  color: #c5ced7;
  font: 700 max(20px, calc(12px / var(--hud-scale, 1)))/1.2 var(--hud-gauge-num);
  letter-spacing: 0;
  text-transform: uppercase;
  white-space: nowrap;
}

.info-row dd {
  min-width: 0;
  margin: 0;
  overflow: hidden;
  white-space: nowrap;
  font: 700 max(27px, calc(14px / var(--hud-scale, 1)))/1 var(--hud-gauge-num);
}

.info-row--green dd { color: #9acd32; }
.info-row--yellow dd { color: #facc15; }
.info-row--orange dd { color: #ff9d00; }
.info-row--red dd { color: #ef4444; }
.info-row--purple dd { color: #d946ef; }

/* Draft caution row: dark amber band, amber left edge, label and value in the warning colour
   (amber; orange or red when the existing tone is stronger). */
.info-row--caution {
  --caution: #{$hud-caution};
  padding: 5px 6px;
  border-left: 3px solid var(--caution);
  background: $hud-caution-bg;
  dt,
  dd { color: var(--caution); }
}
.info-row--caution.info-row--orange { --caution: #ff9d00; }
.info-row--caution.info-row--red { --caution: #ef4444; }
</style>
