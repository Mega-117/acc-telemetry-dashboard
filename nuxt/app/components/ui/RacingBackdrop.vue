<script setup lang="ts">
// Official app background, extracted from the original login scene.
// Keep the upper-left region quieter without changing the other trajectories.
const particles = Array.from({ length: 28 }, (_, i) => ({
  left: `${8 + ((i * 37) % 90)}%`, top: `${(i * 23) % 100}%`,
  animationDelay: `${-i * 1.7}s`, animationDuration: `${15 + i % 5 * 2}s`,
})).filter((particle, i) => !(parseFloat(particle.left) < 45 && parseFloat(particle.top) < 35 && i % 18 !== 0))
</script>

<template>
  <div class="racing-backdrop" aria-hidden="true">
    <i v-for="(particle, i) in particles" :key="i" :style="particle" />
  </div>
</template>

<style scoped>
.racing-backdrop { position: fixed; inset: 0; z-index: -1; overflow: hidden; pointer-events: none;
  background: repeating-linear-gradient(135deg, transparent 0 148px, #ffffff04 149px, transparent 150px),
    radial-gradient(ellipse at 92% 95%, #62001677, #27000833 36%, transparent 68%), #020202; }
i { position: absolute; width: 3px; height: 3px; border-radius: 50%; background: #ff7188;
  box-shadow: 0 0 5px #f4002870; animation: racing-spark 18s linear infinite; will-change: transform, opacity; }
@keyframes racing-spark {
  0% { transform: translate3d(110px,-110px,0); opacity: 0; }
  20%,70% { opacity: .7; }
  100% { transform: translate3d(-350px,350px,0); opacity: 0; }
}
@media (prefers-reduced-motion: reduce) { i { animation: none; opacity: .5; } }
</style>
