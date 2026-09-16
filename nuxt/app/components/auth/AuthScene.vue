<script setup lang="ts">
import { PRODUCT } from '../../../shared/productIdentity'
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
</script>

<template>
  <section class="racer-auth" :aria-label="`Autenticazione ${PRODUCT.displayName}`">
    <div class="racer-auth__column" :class="{ 'racer-auth__column--wide': wide }">
      <header class="racer-auth__brand">
        <div class="racer-auth__logo-viewport">
          <img :src="`${base}branding/auth/racer_core_exact.svg`" :alt="`${PRODUCT.displayName} — Sim Racing Software`" width="1774" height="887" />
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
