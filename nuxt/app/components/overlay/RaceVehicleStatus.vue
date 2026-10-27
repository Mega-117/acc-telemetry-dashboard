<script setup lang="ts">
import type { FastOverlayState } from '~/composables/useFastStatePoller'
// Box tops in viewBox units: the Damage page keeps its original places (40 / 152); the
// tyres page passes the tops that centre each box on its axle. Corners stay square.
withDefaults(defineProps<{ fastState: FastOverlayState; hasPhysics: boolean; engineTop?: number; limiterTop?: number }>(), {
  engineTop: 40, limiterTop: 152,
})
</script>
<template>
<g class="race-vehicle-status">
      <g v-if="hasPhysics && fastState.isEngineRunning === false" class="tyre-race__engine-off">
        <rect x="43" :y="engineTop" width="80" height="48" fill="red" class="tyre-race__engine-pulse" />
        <text x="83" :y="engineTop + 20">ENGINE</text><text x="83" :y="engineTop + 41">OFF</text>
      </g>
      <g v-if="hasPhysics && fastState.pitLimiterOn" class="tyre-race__limiter">
        <rect x="43" :y="limiterTop" width="80" height="48" fill="blue" />
        <text x="83" :y="limiterTop + 20">LIMITER</text><text x="83" :y="limiterTop + 41">ON</text>
      </g>
</g>
</template>
<style scoped>
.race-vehicle-status { font-size:18px; text-anchor:middle; fill:white; font-weight:700; }
.tyre-race__engine-pulse { animation:race-engine-pulse .8s linear infinite; }
@keyframes race-engine-pulse { 0%,100% { opacity:0; } 50% { opacity:.7; } }
@media (prefers-reduced-motion:reduce) { .tyre-race__engine-pulse { animation:none; opacity:.5; } }
</style>
