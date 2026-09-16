<script setup lang="ts">
// Reusable backdrop for the racing theme, with slow drifting sparks.
const particles = Array.from({ length: 16 }, (_, i) => ({
  left: `${8 + ((i * 37) % 90)}%`, top: `${(i * 23) % 100}%`,
  animationDelay: `${-i * 1.7}s`, animationDuration: `${25 + i % 5 * 3}s`,
}))
</script>

<template>
  <div class="racing-backdrop" aria-hidden="true">
    <i v-for="(particle, i) in particles" :key="i" :style="particle" />
  </div>
</template>

<style scoped>
.racing-backdrop { position: absolute; inset: 0; z-index: -1; overflow: hidden; pointer-events: none;
  background: radial-gradient(ellipse at 100% 82%, #69000c55, #27000822 38%, transparent 70%), #020202; }
i { position: absolute; width: 2px; height: 2px; border-radius: 50%; background: #ff2442;
  box-shadow: 0 0 5px #f4002860; animation: racing-spark 28s linear infinite; }
@keyframes racing-spark {
  0% { transform: translate3d(110px,-110px,0); opacity: 0; }
  20%,70% { opacity: .8; }
  100% { transform: translate3d(-350px,350px,0); opacity: 0; }
}
@media (prefers-reduced-motion: reduce) { i { animation: none; opacity: .5; } }
</style>
