<script setup lang="ts">
import type { RaceWeatherItem } from '~/utils/raceWeatherPresentation'
defineProps<{ item: RaceWeatherItem }>()
// Rain lines under the cloud: one centred, two or three spread (HUD style v2, 27/10).
const LINE_X: Record<number, number[]> = { 1: [13], 2: [10, 16], 3: [7, 13, 19] }
</script>

<template>
  <span v-if="item.glyph.kind === 'none'" aria-hidden="true">—</span>
  <svg v-else-if="item.glyph.kind === 'sun'" viewBox="0 0 28 28" aria-hidden="true" class="race-weather-icon">
    <circle cx="14" cy="14" r="5" fill="currentColor" />
    <path d="M14 2v4M14 22v4M2 14h4M22 14h4M5.5 5.5l2.8 2.8M19.7 19.7l2.8 2.8M5.5 22.5l2.8-2.8M19.7 8.3l2.8-2.8" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
  </svg>
  <svg v-else viewBox="0 0 28 28" aria-hidden="true" class="race-weather-icon">
    <path d="M7 19h12a5 5 0 0 0 0-10 7 7 0 0 0-13.4 2A4 4 0 0 0 7 19z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" />
    <text x="13" y="16" text-anchor="middle" class="race-weather-icon__letter">{{ item.glyph.letter }}</text>
    <g stroke="currentColor" stroke-width="1.6" stroke-linecap="round" :stroke-dasharray="item.glyph.dotted ? '0.1 2' : undefined">
      <path v-for="x in LINE_X[item.glyph.lines]" :key="x" :d="`M${x} 22l-1.5 4`" />
    </g>
    <path v-if="item.glyph.thunder" d="M23 18l-2.5 4h3l-2.5 4" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" />
  </svg>
</template>

<style scoped>
.race-weather-icon { display: block; width: 100%; height: 100%; color: #f4f4f6; }
.race-weather-icon__letter { fill: currentColor; font: italic 700 9px var(--hud-font-num); }
</style>
