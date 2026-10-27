<script setup lang="ts">
// PIP-663: the four wheels around the car seen from above, each card with its own values.
// The colour is a side mark on the value (state at a glance), the number stays white to read.
import type { WheelCard } from '~/utils/datiWheels'

defineProps<{ wheels: WheelCard[] }>()
</script>

<template>
  <div class="wheel-board">
    <section v-for="wheel in wheels" :key="wheel.id" class="wheel" :class="`wheel--${wheel.id.toLowerCase()}`" :aria-label="wheel.name">
      <h3>{{ wheel.name }}</h3>
      <dl>
        <div v-for="m in wheel.metrics" :key="m.label" class="wheel-metric" :title="m.hint" :style="m.color ? { '--mark': m.color } : undefined" :class="{ marked: !!m.color }">
          <dt>{{ m.label }}</dt>
          <dd><strong>{{ m.value }}</strong><small v-if="m.detail">{{ m.detail }}</small></dd>
        </div>
      </dl>
    </section>
    <svg class="wheel-car" viewBox="0 0 60 140" aria-hidden="true">
      <path d="M18 8 Q30 0 42 8 L46 40 L46 104 Q46 128 30 134 Q14 128 14 104 L14 40 Z" />
      <rect x="4" y="22" width="9" height="22" rx="2" /><rect x="47" y="22" width="9" height="22" rx="2" />
      <rect x="4" y="96" width="9" height="24" rx="2" /><rect x="47" y="96" width="9" height="24" rx="2" />
      <path class="wheel-car-glass" d="M20 46 L40 46 L38 64 L22 64 Z" />
    </svg>
  </div>
</template>

<style scoped lang="scss">
$line: #ffffff24;
.wheel-board { display: grid; grid-template-columns: minmax(0, 380px) 76px minmax(0, 380px); grid-template-areas: 'fl car fr' 'rl car rr'; justify-content: center; gap: 10px; }
.wheel--fl { grid-area: fl; } .wheel--fr { grid-area: fr; } .wheel--rl { grid-area: rl; } .wheel--rr { grid-area: rr; }
.wheel-car { grid-area: car; align-self: center; width: 100%; max-height: 220px;
  path, rect { fill: none; stroke: #ffffff59; stroke-width: 1.4; }
  rect { fill: #ffffff14; }
  .wheel-car-glass { fill: #ffffff0d; } }
.wheel { border: 1px solid $line; background: #ffffff08; padding: 8px 10px;
  h3 { margin: 0 0 6px; font: italic 700 13px 'Racer Display', 'Arial Narrow', sans-serif; text-transform: uppercase; color: #fff; }
  dl { display: grid; gap: 4px; margin: 0; } }
// Right-hand wheels mirror the left ones: values sit next to the car on both sides.
.wheel--fr, .wheel--rr { h3, dt { text-align: right; } .wheel-metric { grid-template-columns: minmax(0, 1fr) 92px; border-left: 0; border-right: 3px solid var(--mark, transparent); padding: 2px 8px 2px 0; dt { order: 2; } dd { justify-content: flex-end; } } }
.wheel-metric { display: grid; grid-template-columns: 92px minmax(0, 1fr); align-items: baseline; gap: 8px; padding: 2px 0 2px 8px; border-left: 3px solid var(--mark, transparent); }
.wheel-metric:not(.marked) { --mark: #ffffff1f; }
dt { color: #b3b3b8; font-size: 11px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; }
dd { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 8px; margin: 0; font-variant-numeric: tabular-nums;
  strong { font: 600 15px/1.25 'Inter', sans-serif; color: #f2f2f5; }
  small { color: #8a8a90; font-size: 11px; } }
[title] { cursor: help; }
@media (max-width: 720px) {
  .wheel-board { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); grid-template-areas: 'fl fr' 'rl rr'; }
  .wheel-car { display: none; }
  .wheel-metric, .wheel--fr .wheel-metric, .wheel--rr .wheel-metric { grid-template-columns: 1fr; gap: 0; }
  .wheel--fr .wheel-metric dt, .wheel--rr .wheel-metric dt { order: 0; }
}
</style>
