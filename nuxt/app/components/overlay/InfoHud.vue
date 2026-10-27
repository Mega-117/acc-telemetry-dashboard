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
  <!-- Info style A (28/10): only the top-right corner is cut (owner), centre-out Delta bar,
       LABEL ... value rows. Times use fixed-width digit slots so ticking values never jitter;
       words such as Clear or Optimum render as plain text through the same component. -->
  <section
    class="info-hud"
    :class="{ 'info-hud--yellow-flag': model.yellowFlagActive }"
    aria-label="Info"
  >
    <!-- Background transparency acts on this layer only, never on the content. -->
    <HudOverlayBackground :opacity="backgroundOpacity" />
    <!-- clip-path removes the border on the cut: this line draws it back. -->
    <i class="info-hud__cut" aria-hidden="true" />
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
        :class="`info-row--${row.tone}`"
      >
        <dt>{{ infoRowLabel(row.label) }}</dt>
        <dd><HudFixedDigits :value="rowValue(row)" /></dd>
      </div>
    </dl>
  </section>
</template>

<style scoped>
.info-hud {
  --info-cut: 14px;
  --info-line: rgba(255, 255, 255, 0.18);
  position: relative;
  box-sizing: border-box;
  display: grid;
  gap: 8px;
  width: 344px;
  height: auto;
  padding: 14px 16px;
  overflow: visible;
  border: 1px solid var(--info-line);
  border-radius: 0;
  color: #f4f4f6;
  background: transparent;
  font-family: var(--hud-font-label);
  clip-path: polygon(0 0, calc(100% - var(--info-cut)) 0, 100% var(--info-cut), 100% 100%, 0 100%);
}

.info-hud > :not(.hud-overlay-background) {
  position: relative;
  z-index: 1;
}

/* The diagonal border line on the cut, placed on the border-box diagonal (absolute boxes start
   inside the 1px border) and rotated so its thickness falls inside the clip shape. */
.info-hud > .info-hud__cut {
  position: absolute;
  z-index: 3;
  top: -1px;
  left: calc(100% + 1px - var(--info-cut));
  width: calc(var(--info-cut) * 1.4142);
  height: 1px;
  background: var(--info-line);
  transform: rotate(45deg);
  transform-origin: 0 0;
  pointer-events: none;
}

/* Yellow flag (owner 28/10): the same frame as the tyres HUD, 4px at native size on the OUTER edge
   (it covers the 1px border), drawn above the content so nothing moves. The page scales the whole
   canvas by transform, so 4px here scales with the HUD like the tyres frame. The cut gets the same
   4px line, so the frame follows the diagonal. */
.info-hud--yellow-flag::after {
  position: absolute;
  z-index: 2;
  inset: -1px;
  border: 4px solid #ffd400;
  content: '';
  pointer-events: none;
}

.info-hud--yellow-flag > .info-hud__cut { height: 4px; background: #ffd400; }

.info-delta {
  position: relative;
  height: 44px;
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
.info-delta--positive .info-delta__bar i { background: #ff0000; }
.info-delta--purple .info-delta__bar i { background: #b600b6; }

.info-delta strong {
  position: relative;
  z-index: 1;
  display: grid;
  height: 100%;
  place-items: center;
  font: italic 700 30px/1 var(--hud-font-num);
  text-shadow: 0 0 4px #000;
}

.info-hud__rows {
  display: grid;
  align-content: start;
  margin: 0;
}

.info-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding: 5px 2px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

/* Readability at the minimum size (owner, 28/10): labels bold, bright and ~85% of the value size.
   The page scales the whole canvas by transform, so a floor of N rendered px is N / --hud-scale here:
   labels never render below 12px, values never below 14px (at 0.6: 20px and 23.33px before scaling). */
.info-row dt {
  color: #d0d2d8;
  font: 700 max(17px, calc(12px / var(--hud-scale, 1)))/1.2 var(--hud-font-label);
  letter-spacing: 0.04em;
  text-transform: uppercase;
  white-space: nowrap;
}

.info-row dd {
  min-width: 0;
  margin: 0;
  overflow: hidden;
  white-space: nowrap;
  font: italic 700 max(20px, calc(14px / var(--hud-scale, 1)))/1 var(--hud-font-num);
  font-variant-numeric: tabular-nums;
  text-shadow: 0 1px 1px rgba(0, 0, 0, 0.3);
}

.info-row--green dd { color: #9acd32; }
.info-row--yellow dd { color: #facc15; }
.info-row--orange dd { color: #ff9d00; }
.info-row--red dd { color: #ef4444; }
.info-row--purple dd { color: #d946ef; }
</style>
