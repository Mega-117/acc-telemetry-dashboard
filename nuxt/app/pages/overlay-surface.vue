<script setup lang="ts">
import { markRaw, onMounted, onBeforeUnmount, shallowRef, type Component } from 'vue'
import SurfaceRegion from '~/components/overlay/SurfaceRegion.vue'
import Tyres from './tyres-overlay.vue'
import Sectors from './sectors-overlay.vue'
import Dashboard from './dashboard-overlay.vue'
import Info from './info-overlay.vue'
import Standings from './standings-overlay.vue'
import Trackmap from './trackmap-overlay.vue'
import Training from './training-overlay.vue'
import Audio from './spotter-audio-runtime.vue'
import Bootstrap from './runtime-bootstrap.vue'

definePageMeta({ layout: 'hud-overlay' })
const components: Record<string, Component> = { tyres: markRaw(Tyres), sectors: markRaw(Sectors), dashboard: markRaw(Dashboard), info: markRaw(Info), standings: markRaw(Standings), trackmap: markRaw(Trackmap), training: markRaw(Training), 'spotter-audio-runtime': markRaw(Audio), 'runtime-bootstrap': markRaw(Bootstrap) }
const state = shallowRef<any>(null)
let unsubscribe: (() => void) | undefined
onMounted(async () => {
  const api = (window as any).electronAPI
  if (!api?.overlaySurfaceGetState) return
  let received = false
  unsubscribe = api.onOverlaySurfaceState((next: unknown) => { received = true; state.value = next })
  const initial = await api.overlaySurfaceGetState()
  if (!received) state.value = initial
})
onBeforeUnmount(() => unsubscribe?.())
</script>

<template>
  <main class="overlay-surface">
    <template v-if="state">
      <SurfaceRegion v-for="region in state.regions" :key="`${region.id}:${region.generation}`"
        :region="region" :origin="state.bounds" :component="components[region.id]!" />
    </template>
  </main>
</template>

<style>
.overlay-surface { position: fixed; inset: 0; width: 100vw; height: 100vh; margin: 0; padding: 0; background: transparent; overflow: hidden; }
</style>
