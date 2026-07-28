<script setup lang="ts">
import { normalizeHudOverlayBackgroundOpacity } from '~/utils/hudOverlayBackground'

const props = defineProps<{ opacity: number }>()
</script>

<template>
  <i
    class="hud-overlay-background"
    :style="{ '--hud-overlay-background-opacity': String(normalizeHudOverlayBackgroundOpacity(props.opacity)) }"
    aria-hidden="true"
  />
</template>

<style scoped>
.hud-overlay-background {
  position: absolute;
  z-index: 0;
  inset: 0;
  display: block;
  border-radius: inherit;
  background: rgba(0, 0, 0, var(--hud-overlay-background-opacity, .8));
  pointer-events: none;
}
</style>
