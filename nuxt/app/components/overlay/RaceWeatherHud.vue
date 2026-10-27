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
/* A small strip attached above the tyres; minutes plus a white outline icon per cell. */
.tyre-race__weather {
  display:flex; flex:0 0 auto; gap:calc(6px * var(--hud-scale,1)); padding:calc(6px * var(--hud-scale,1));
  border-bottom:1px solid rgba(255,255,255,0.15); background:#0d0e12;
}
.tyre-race__weather-unavailable { flex:1; align-self:center; padding:8px; text-align:center; color:#a3a5ae; font:700 max(11px,calc(12px * var(--hud-scale,1)))/1.3 var(--hud-font-label); }
.tyre-race__weather-cell { display:grid; flex:1 1 0; min-width:0; justify-items:center; align-content:center; gap:calc(4px * var(--hud-scale,1)); padding:calc(5px * var(--hud-scale,1)) calc(8px * var(--hud-scale,1)); background:rgba(255,255,255,0.045); }
.tyre-race__weather strong { color:#f4f4f6; font:italic 700 max(12px,calc(16px * var(--hud-scale,1)))/1 var(--hud-font-num); }
.tyre-race__weather span { display:grid; place-items:center; width:max(22px,calc(34px * var(--hud-scale,1))); height:max(22px,calc(34px * var(--hud-scale,1))); color:#f4f4f6; font:700 max(16px,calc(22px * var(--hud-scale,1)))/1 var(--hud-font-num); }
</style>
