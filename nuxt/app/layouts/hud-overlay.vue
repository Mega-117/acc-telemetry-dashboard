<script setup lang="ts">
import { computed } from 'vue'
import { normalizeHudRightGutter } from '~/utils/hudOverlayWindow'

const route = useRoute()
const hostStyle = computed(() => ({
  '--hud-overlay-right-gutter': `${normalizeHudRightGutter(route.query.rightGutter)}px`,
}))
</script>

<template>
  <div class="hud-overlay-window" :style="hostStyle">
    <div class="hud-overlay-window__content">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.hud-overlay-window {
  position: fixed;
  inset: 0;
  box-sizing: border-box;
  padding-right: var(--hud-overlay-right-gutter, 0);
  overflow: hidden;
  background: transparent;
}

.hud-overlay-window__content {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: transparent;
}
</style>
