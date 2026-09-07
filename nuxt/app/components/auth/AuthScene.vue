<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

withDefaults(defineProps<{ wide?: boolean }>(), { wide: false })
const content = ref<HTMLElement | null>(null)
const height = ref<number>()
let observer: ResizeObserver | undefined
// Measure the intrinsic content, never the animated wrapper, to avoid feedback loops.
onMounted(() => {
  if (typeof ResizeObserver === 'undefined' || !content.value) return
  observer = new ResizeObserver(([entry]) => {
    if (entry) height.value = entry.contentRect.height
  })
  observer.observe(content.value)
})
onBeforeUnmount(() => observer?.disconnect())
const base = useRuntimeConfig().app.baseURL
const particles = Array.from({ length: 16 }, (_, i) => ({
  left: `${8 + ((i * 37) % 90)}%`, top: `${(i * 23) % 100}%`,
  animationDelay: `${-i * 1.7}s`, animationDuration: `${15 + i % 5 * 2}s`,
}))
</script>

<template>
  <section class="racer-auth" aria-label="Autenticazione Racer Core">
    <div class="racer-auth__background" aria-hidden="true">
      <i v-for="(particle, i) in particles" :key="i" class="racer-auth__particle" :style="particle" />
    </div>
    <div class="racer-auth__column" :class="{ 'racer-auth__column--wide': wide }">
      <header class="racer-auth__brand">
        <div class="racer-auth__logo-viewport">
          <img :src="`${base}branding/auth/racer_core_exact.svg`" alt="Racer Core — Sim Racing Software" width="1774" height="887" />
        </div>
      </header>
      <div class="racer-auth__height" :style="height !== undefined ? { height: `${height}px` } : undefined">
        <div ref="content" class="racer-auth__content"><slot /></div>
      </div>
    </div>
  </section>
</template>

<style lang="scss" scoped>
@use '~/assets/scss/auth-racer-core';
</style>
