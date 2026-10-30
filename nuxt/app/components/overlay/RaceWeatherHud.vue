<script setup lang="ts">
import { useI18n } from '~/i18n'
import { hudSourcePolicy } from '~/services/sim/hudSourceAdapter'

import { computed } from 'vue'
import type { FastOverlayState } from '~/composables/useFastStatePoller'
import { raceWeatherCells, raceWeatherItem } from '~/utils/raceWeatherPresentation'
import RaceWeatherIcon from './RaceWeatherIcon.vue'
const props = defineProps<{ fastState: FastOverlayState }>()
const unavailableForecast = computed(() => !hudSourcePolicy(props.fastState).weatherForecast)
// HUD style v2 (27/10): one cell per forecast the data provides; the cells share the width.
const weather = computed(() => raceWeatherCells([
  raceWeatherItem(props.fastState.rainIntensity, 0, props.fastState.isFresh && props.fastState.isLive),
  raceWeatherItem(props.fastState.rainIntensity10Min, 10, props.fastState.isFresh && props.fastState.isLive),
  raceWeatherItem(props.fastState.rainIntensity30Min, 30, props.fastState.isFresh && props.fastState.isLive),
]))
const { t } = useI18n()
</script>
<template>
    <header class="tyre-race__weather">
      <small v-if="unavailableForecast" class="tyre-race__weather-unavailable" role="status">{{ t('overlays.weather.unavailable') }}</small>
      <template v-else><div v-for="item in weather" :key="item.horizon" class="tyre-race__weather-cell" :title="item.title" :aria-label="item.title" :data-rain-intensity="item.intensity">
        <strong>{{ item.horizon }}</strong><span><RaceWeatherIcon :item="item" /></span>
      </div></template>
    </header>
</template>
<style scoped>
/* PIP-671 (approved draft "Gomme", 30/10): the forecast strip on top of the Race window, one tile
   per forecast sharing the width; minutes 26px and 50px outline icons. Native px: the page zooms
   the whole Race window by the HUD scale. No background of its own: the outer panel is the only
   layer that follows "Trasparenza sfondo" (owner 28/10); the cells keep their light tile. */
.tyre-race__weather {
  display:flex; flex:0 0 auto; gap:6px; padding:6px;
  border-bottom:2px solid #66717b; background:transparent;
}
.tyre-race__weather-unavailable { flex:1; align-self:center; padding:8px; text-align:center; color:#a3a5ae; font:700 16px/1.3 var(--hud-gauge-num); }
.tyre-race__weather-cell { display:grid; flex:1 1 0; min-width:0; justify-items:center; align-content:center; gap:6px; padding:8px; background:rgba(255,255,255,0.035); }
.tyre-race__weather strong { color:#f4f6f8; font:700 26px/1.1 var(--hud-gauge-num); }
.tyre-race__weather span { display:grid; place-items:center; width:50px; height:50px; color:#f4f6f8; font:700 26px/1 var(--hud-gauge-num); }
.tyre-race__weather :deep(.race-weather-icon__letter) { font:700 9px var(--hud-gauge-num); }
</style>
