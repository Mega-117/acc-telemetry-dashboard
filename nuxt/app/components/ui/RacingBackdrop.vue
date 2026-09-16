<script setup lang="ts">
// Official app background, extracted from the original login scene.
const particles = Array.from({ length: 28 }, (_, i) => ({
  left: `${8 + ((i * 37) % 90)}%`, top: `${(i * 23) % 100}%`,
  animationDelay: `${-i * 1.7}s`, animationDuration: `${15 + i % 5 * 2}s`,
}))
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
i { position: absolute; width: 3px; height: 3px; border-radius: 50%; background: #ff526b;
  box-shadow: 0 0 6px #ff0024bb, 0 0 11px #ff00244d; animation: racing-spark 18s linear infinite; will-change: transform, opacity; }
i:nth-child(3n) { background: #fff; box-shadow: 0 0 5px #ffffff80, 0 0 9px #ffffff26; }
@keyframes racing-spark {
  0% { transform: translate3d(110px,-110px,0); opacity: 0; }
  20%,70% { opacity: .9; }
  100% { transform: translate3d(-350px,350px,0); opacity: 0; }
}
@media (prefers-reduced-motion: reduce) { i { animation: none; opacity: .5; } }
</style>
