<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, provide, type Component } from 'vue'
import { OVERLAY_REGION_API } from '~/composables/useOverlayRegionApi'
import { createSurfaceRegionBridge } from '~/services/overlay/surfaceRegionBridge'
import { PRESENTATION_VISIBLE, useWindowPresentationVisibility } from '~/composables/usePresentationVisibility'

const props = defineProps<{
  region: { id: string, generation: number, bounds: { x: number, y: number, width: number, height: number }, visible: boolean, opacity: number, movable: boolean, order: number }
  origin: { x: number, y: number }
  component: Component
}>()
const api = (window as any).electronAPI
const windowVisible = useWindowPresentationVisibility()
const presentationVisible = computed(() => props.region.visible && windowVisible.value)
provide(PRESENTATION_VISIBLE, presentationVisible)
const bridge = createSurfaceRegionBridge(api, props.region.id)
bridge.overlayRegionReady = () => api.overlaySurfaceReady(props.region.id, props.region.generation)
provide(OVERLAY_REGION_API, () => bridge)
// Training initializes asynchronously and acknowledges after installing commands.
onMounted(() => { if (props.region.id !== 'training') void bridge.overlayRegionReady() })
const style = computed(() => ({
  left: `${props.region.bounds.x - props.origin.x}px`,
  top: `${props.region.bounds.y - props.origin.y}px`,
  width: `${props.region.bounds.width}px`, height: `${props.region.bounds.height}px`,
  opacity: props.region.opacity, zIndex: props.region.order,
  visibility: props.region.visible ? 'visible' as const : 'hidden' as const,
}))
let drag: { pointer: number, x: number, y: number, startX: number, startY: number } | null = null
function down(event: PointerEvent) {
  if (!props.region.movable || event.button !== 0) return
  if ((event.target as Element).closest('button,input,select,textarea,[data-overlay-interactive]')) return
  drag = { pointer: event.pointerId, x: event.screenX, y: event.screenY, startX: props.region.bounds.x, startY: props.region.bounds.y }
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  void api.overlaySurfaceInteraction(props.region.id, 'drag-start')
  event.preventDefault()
}
function move(event: PointerEvent) {
  if (!drag || event.pointerId !== drag.pointer) return
  void api.overlaySurfaceMove(props.region.id, { x: drag.startX + event.screenX - drag.x, y: drag.startY + event.screenY - drag.y })
}
function up() {
  if (drag) void api.overlaySurfaceInteraction(props.region.id, 'drag-end')
  drag = null
}
onBeforeUnmount(up)
</script>

<template>
  <section :data-surface-region="region.id" :data-presentation-hidden="!presentationVisible" class="surface-region" :style="style"
    @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="up" @lostpointercapture="up">
    <component :is="component" />
  </section>
</template>

<style>
.surface-region { position: absolute; contain: layout; padding: 0; margin: 0; overflow: visible; }
.surface-region[data-presentation-hidden="true"] *, .surface-region[data-presentation-hidden="true"] *::before, .surface-region[data-presentation-hidden="true"] *::after { animation-play-state: paused !important; }
.surface-region, .surface-region * { -webkit-app-region: no-drag !important; }
.surface-region .training-overlay { width: 100%; height: 100%; position: absolute; }
.surface-region .overlay-work-area { padding: 0; }
.surface-region .hud-overlay { padding: 0 !important; }
.surface-region.overlay-software-cursor-active, .surface-region.overlay-software-cursor-active * { cursor: none !important; }
</style>
