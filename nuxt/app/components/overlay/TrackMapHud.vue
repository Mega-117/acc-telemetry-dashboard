<script setup lang="ts">
// PIP-428 — sola presentazione: disegna cio' che trackMapPresentation ha deciso.
// Spessori, colori e rotazione replicano TrackMapWindow.xaml di ACC Drive.
import {
  TRACK_MAP_CANVAS,
  TRACK_MAP_MARKER_DIAMETER,
  TRACK_MAP_ROTATION_DEG,
  type TrackMapView,
} from '~/services/overlay/trackMapPresentation'

defineProps<{ view: TrackMapView }>()

const MARGIN = 40
const viewBox = `${-MARGIN} ${-MARGIN} ${TRACK_MAP_CANVAS + MARGIN * 2} ${TRACK_MAP_CANVAS + MARGIN * 2}`
const center = TRACK_MAP_CANVAS / 2
const rotation = `rotate(${TRACK_MAP_ROTATION_DEG} ${center} ${center})`
const upright = `rotate(${360 - TRACK_MAP_ROTATION_DEG})`
const markerRadius = TRACK_MAP_MARKER_DIAMETER / 2
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
        :style="{ transform: `translate(${dot.x}px, ${dot.y}px)` }"
        :opacity="dot.opacity"
      >
        <circle :r="dot.diameter / 2" :fill="dot.fill" stroke="#000000" stroke-width="2" />
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
        :style="{ transform: `translate(${marker.x}px, ${marker.y}px)` }"
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
  </svg>
</template>

<style scoped>
.track-map{display:block;width:100%;height:100%;overflow:visible}
.track-map__edge{fill:none;stroke:#696969;stroke-width:12;stroke-linejoin:round}
.track-map__asphalt{fill:none;stroke:#000000;stroke-width:6;stroke-linejoin:round}
/* Il roster UDP arriva a 4 Hz: la transizione copre il buco fra due campioni. */
.track-map__item{transition:transform 250ms linear}
.track-map__item--local{transition-duration:80ms}
.track-map__number{fill:#ffffff;font:800 26px/1 system-ui,sans-serif}
.track-map__letter{fill:#ffffff;font:700 26px/1 system-ui,sans-serif;text-anchor:middle}
</style>
