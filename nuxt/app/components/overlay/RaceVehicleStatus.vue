<script setup lang="ts">
import type { FastOverlayState } from '~/composables/useFastStatePoller'
defineProps<{ fastState: FastOverlayState; hasPhysics: boolean }>()
</script>
<template>
<g class="race-vehicle-status">
      <g v-if="hasPhysics && fastState.isEngineRunning === false" class="tyre-race__engine-off">
        <rect x="43" y="40" width="80" height="48" rx="8" fill="red" class="tyre-race__engine-pulse" />
        <text x="83" y="60">ENGINE</text><text x="83" y="81">OFF</text>
      </g>
      <g v-if="hasPhysics && fastState.pitLimiterOn" class="tyre-race__limiter">
        <rect x="43" y="152" width="80" height="48" rx="8" fill="blue" />
        <text x="83" y="172">LIMITER</text><text x="83" y="193">ON</text>
      </g>
</g>
</template>
<style scoped>
.race-vehicle-status { font-size:18px; text-anchor:middle; fill:white; font-weight:700; }
.tyre-race__engine-pulse { animation:race-engine-pulse .8s linear infinite; }
@keyframes race-engine-pulse { 0%,100% { opacity:0; } 50% { opacity:.7; } }
@media (prefers-reduced-motion:reduce) { .tyre-race__engine-pulse { animation:none; opacity:.5; } }
</style>
