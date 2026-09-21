<script setup lang="ts">
// PIP-428 — sola presentazione: disegna cio' che trackMapPresentation ha deciso.
// Spessori, colori e rotazione replicano TrackMapWindow.xaml di ACC Drive.
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { usePresentationActivity } from '~/composables/usePresentationVisibility'
import {
  TRACK_MAP_CANVAS,
  TRACK_MAP_MARKER_DIAMETER,
  TRACK_MAP_PULSE_DIAMETER,
  advanceTrackMapMotion,
  pointAtSpline,
  rotatedOutlineBottom,
  type TrackMapMotionItem,
  type TrackMapPoint,
  type TrackMapView,
} from '~/services/overlay/trackMapPresentation'

// La rotazione e' una proprieta' dei dati della mappa (la dichiara chi li fornisce), non del disegno.
const props = withDefaults(defineProps<{
  view: TrackMapView
  outline: ReadonlyArray<TrackMapPoint>
  rotationDeg?: number
}>(), { rotationDeg: 0 })

// Ogni elemento si muove LUNGO la linea: si anima la posizione sul giro e la si
// riproietta sul tracciato a ogni frame. Animare x/y (una transizione CSS) fa
// tagliare il cerchio o il prato a un pallino che salta, per esempio il pit
// prediction quando cambia il tempo di sosta.
const shown = ref<Record<string, number>>({})
let frame = 0
let lastFrameAt = 0

function motionItems (): TrackMapMotionItem[] {
  return [
    ...props.view.dots.map(dot => ({ key: `car:${dot.carIndex}`, spline: dot.spline, isLocal: dot.isLocal })),
    ...props.view.markers.map(marker => ({ key: `marker:${marker.kind}`, spline: marker.spline, followsLocal: true })),
  ]
}

function animate (now: number) {
  const elapsed = lastFrameAt ? Math.min(100, now - lastFrameAt) : 16
  lastFrameAt = now
  const previous = shown.value
  // Un teletrasporto ("torna ai pit") riappare sul posto invece di percorrere il circuito.
  const next = advanceTrackMapMotion(previous, motionItems(), elapsed)
  const keys = Object.keys(next)
  if (keys.length !== Object.keys(previous).length || keys.some(key => next[key] !== previous[key])) shown.value = next
  frame = requestAnimationFrame(animate)
}

function place (key: string, item: { spline: number, x: number, y: number }) {
  const point = pointAtSpline(props.outline, shown.value[key] ?? item.spline) ?? item
  return { transform: `translate(${point.x}px, ${point.y}px)` }
}

const animation = usePresentationActivity(() => {
  // Resume at current positions, without animating the hidden interval.
  shown.value = Object.fromEntries(motionItems().map(item => [item.key, item.spline]))
  lastFrameAt = 0
  frame = requestAnimationFrame(animate)
}, () => cancelAnimationFrame(frame))
onMounted(animation.start)
onUnmounted(animation.stop)

const MARGIN = 40
const viewBox = `${-MARGIN} ${-MARGIN} ${TRACK_MAP_CANVAS + MARGIN * 2} ${TRACK_MAP_CANVAS + MARGIN * 2}`
const center = TRACK_MAP_CANVAS / 2
const rotation = computed(() => `rotate(${props.rotationDeg} ${center} ${center})`)
// Testi e numeri restano dritti qualunque sia la rotazione della mappa.
const upright = computed(() => `rotate(${-props.rotationDeg})`)
const markerRadius = TRACK_MAP_MARKER_DIAMETER / 2
const pulseRadius = TRACK_MAP_PULSE_DIAMETER / 2
// La scritta sta subito sotto il disegno vero, non al bordo del riquadro: una
// pista e' centrata ma quasi mai riempie il quadrato (Monza e' molto piu' larga
// che alta), e al bordo la scritta resterebbe lontana dalla mappa. Il salto
// copre il raggio di un pallino e il suo numero.
const CAPTION_GAP = 46
const captionY = computed(() => {
  const bottom = rotatedOutlineBottom(props.outline, props.rotationDeg)
  const preferred = (bottom ?? TRACK_MAP_CANVAS - MARGIN) + CAPTION_GAP
  return Math.min(preferred, TRACK_MAP_CANVAS + MARGIN - 12)
})
const captionWidth = computed(() => Math.min(TRACK_MAP_CANVAS + MARGIN, (props.view.caption?.length ?? 0) * 20 + 32))
const captionX = computed(() => center - captionWidth.value / 2)
</script>

<template>
  <svg class="track-map" :viewBox="viewBox" aria-hidden="true">
    <g :transform="rotation">
      <polyline class="track-map__edge" :points="view.outlinePath" />
      <polyline class="track-map__asphalt" :points="view.outlinePath" />

      <g
        v-for="dot in view.dots"
        :key="dot.carIndex"
        class="track-map__item"
        :class="{ 'track-map__item--local': dot.isLocal }"
        :style="place(`car:${dot.carIndex}`, dot)"
        :opacity="dot.opacity"
      >
        <circle :r="dot.diameter / 2" :fill="dot.fill" stroke="#000000" stroke-width="2" />
        <!-- Anello pulsante di ACC Drive: l'auto seguita e, in gara, il leader. -->
        <circle
          v-if="dot.pulse"
          class="track-map__pulse"
          :r="pulseRadius"
          fill="none"
          :stroke="dot.fill"
          stroke-width="3"
        />
        <g v-if="dot.label" :transform="upright">
          <rect
            :x="dot.diameter / 2 + 2"
            y="-15"
            :width="dot.label.length * 16 + 8"
            height="30"
            fill="#000000"
            opacity="0.7"
          />
          <text :x="dot.diameter / 2 + 6" y="9" class="track-map__number">{{ dot.label }}</text>
        </g>
      </g>

      <g
        v-for="marker in view.markers"
        :key="marker.kind"
        class="track-map__item"
        :class="`track-map__marker--${marker.kind}`"
        :style="place(`marker:${marker.kind}`, marker)"
      >
        <!-- Pieno = il logger ha almeno due passaggi per tratto; vuoto = stima non verificabile. -->
        <circle
          :r="marker.hollow ? markerRadius - 3 : markerRadius"
          :fill="marker.hollow ? 'rgba(0,0,0,0.55)' : marker.fill"
          :stroke="marker.fill"
          :stroke-width="marker.hollow ? 6 : 0"
        />
        <text :transform="upright" y="9" class="track-map__letter">{{ marker.label }}</text>
      </g>
    </g>
    <!-- Fuori dalla rotazione: su che tempo di sosta si basa il pallino. -->
    <g v-if="view.caption" class="track-map__caption">
      <rect :x="captionX" :y="captionY - 34" :width="captionWidth" height="48" rx="8" />
      <text :x="center" :y="captionY">{{ view.caption }}</text>
    </g>
  </svg>
</template>

<style scoped>
.track-map{display:block;width:100%;height:100%;overflow:visible}
.track-map__edge{fill:none;stroke:#696969;stroke-width:12;stroke-linejoin:round}
.track-map__asphalt{fill:none;stroke:#000000;stroke-width:6;stroke-linejoin:round}
/* Nessuna transizione CSS sulla posizione: il movimento lo fa lo script, lungo la linea. */
.track-map__pulse{animation:track-map-pulse .5s ease-in-out infinite alternate}
@keyframes track-map-pulse{from{opacity:.2}to{opacity:1}}
.track-map__number{fill:#ffffff;font:800 26px/1 system-ui,sans-serif}
.track-map__letter{fill:#ffffff;font:700 26px/1 system-ui,sans-serif;text-anchor:middle}
.track-map__caption rect{fill:#000000;opacity:.7}
.track-map__caption text{fill:#ffffff;font:700 34px/1 system-ui,sans-serif;text-anchor:middle;font-variant-numeric:tabular-nums}
</style>
