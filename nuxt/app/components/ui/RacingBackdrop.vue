<script setup lang="ts">
// Official app background, extracted from the original login scene. Look and sparks live in
// shared/racingBackdrop.ts, shared with the browser loading screen that draws it before the app starts.
import { RACING_BACKDROP_BACKGROUND, RACING_SPARKS, sparkDelay } from '../../../shared/racingBackdrop'

const now = typeof performance === 'undefined' ? 0 : performance.now()
const particles = RACING_SPARKS.map(spark => ({
  left: spark.left, top: spark.top, animationDelay: sparkDelay(spark, now), animationDuration: `${spark.durationS}s`,
}))
</script>

<template>
  <div class="racing-backdrop" aria-hidden="true" :style="{ background: RACING_BACKDROP_BACKGROUND }">
    <i v-for="(particle, i) in particles" :key="i" :style="particle" />
  </div>
</template>

<style scoped>
.racing-backdrop { position: fixed; inset: 0; z-index: -1; overflow: hidden; pointer-events: none; }
i { position: absolute; width: 3px; height: 3px; border-radius: 50%; background: #ff7188;
  box-shadow: 0 0 5px #f4002870; animation: racing-spark 18s linear infinite; will-change: transform, opacity; }
/* Same values as RACING_SPARK_FROM / RACING_SPARK_TO in shared/racingBackdrop.ts (checked by a test). */
@keyframes racing-spark {
  0% { transform: translate3d(110px,-110px,0); opacity: 0; }
  20%,70% { opacity: .7; }
  100% { transform: translate3d(-350px,350px,0); opacity: 0; }
}
@media (prefers-reduced-motion: reduce) { i { animation: none; opacity: .5; } }
</style>
