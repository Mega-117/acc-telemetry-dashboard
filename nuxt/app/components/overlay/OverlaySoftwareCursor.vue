<script setup lang="ts">
import { computed } from 'vue'
import type { OverlayPointerState } from '~/composables/useOverlayInteractionContract'

const props = defineProps<{
  state: OverlayPointerState
}>()

const visible = computed(() => (
  props.state.cursorVisible
  && !props.state.placementActive
  && typeof props.state.x === 'number'
  && typeof props.state.y === 'number'
))

const cursorStyle = computed(() => ({
  transform: `translate3d(${props.state.x ?? 0}px, ${props.state.y ?? 0}px, 0)`,
}))
</script>

<template>
  <svg
    v-show="visible"
    class="overlay-software-cursor"
    :style="cursorStyle"
    viewBox="0 0 24 30"
    aria-hidden="true"
  >
    <path
      d="M2 2L2.5 24L8.3 18.4L12.7 28L17.1 25.9L12.6 16.6L20.5 16.1L2 2Z"
      fill="#ffffff"
      stroke="#05070a"
      stroke-width="2.4"
      stroke-linejoin="round"
    />
  </svg>
</template>

<style>
.overlay-software-cursor {
  position: fixed;
  top: -2px;
  left: -2px;
  z-index: 2147483647;
  width: 18px;
  height: 23px;
  pointer-events: none;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, .85));
  will-change: transform;
}

html.overlay-software-cursor-active,
html.overlay-software-cursor-active * {
  cursor: none !important;
}
</style>
