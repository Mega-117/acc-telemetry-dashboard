<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'

defineProps<{ label: string }>()
const scrolling = ref(false)
let idleTimer: ReturnType<typeof setTimeout> | undefined
function revealScrollbar() {
  scrolling.value = true
  clearTimeout(idleTimer)
  idleTimer = setTimeout(() => { scrolling.value = false }, 650)
}
onBeforeUnmount(() => clearTimeout(idleTimer))
</script>

<template>
  <div
    class="scroll-area"
    :class="{ 'is-scrolling': scrolling }"
    data-page-scroll
    role="region"
    :aria-label="label"
    tabindex="0"
    @scroll.passive="revealScrollbar"
  >
    <slot></slot>
  </div>
</template>

<style scoped>
.scroll-area { scrollbar-color: transparent transparent; transition: scrollbar-color 180ms ease; }
.scroll-area.is-scrolling { scrollbar-color: #ffffff45 transparent; }
.scroll-area::-webkit-scrollbar-thumb { background: transparent; }
.scroll-area.is-scrolling::-webkit-scrollbar-thumb { background: #ffffff45; }
.scroll-area::-webkit-scrollbar-track { background: transparent; }
@media (prefers-reduced-motion: reduce) { .scroll-area { transition: none; } }
</style>
