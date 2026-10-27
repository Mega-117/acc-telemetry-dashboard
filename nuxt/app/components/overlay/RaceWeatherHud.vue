<script setup lang="ts">
import { useI18n } from '~/i18n'
import { hudSourcePolicy } from '~/services/sim/hudSourceAdapter'

import { computed } from 'vue'
import type { FastOverlayState } from '~/composables/useFastStatePoller'
import { raceWeatherItem } from '~/utils/raceWeatherPresentation'
import RaceWeatherIcon from './RaceWeatherIcon.vue'
const props = defineProps<{ fastState: FastOverlayState }>()
const unavailableForecast = computed(() => !hudSourcePolicy(props.fastState).weatherForecast)
const weather = computed(() => [
  raceWeatherItem(props.fastState.rainIntensity, 0, props.fastState.isFresh && props.fastState.isLive),
  raceWeatherItem(props.fastState.rainIntensity10Min, 10, props.fastState.isFresh && props.fastState.isLive),
  raceWeatherItem(props.fastState.rainIntensity30Min, 30, props.fastState.isFresh && props.fastState.isLive),
])
const { t } = useI18n()
</script>
<template>
    <header class="tyre-race__weather">
      <small v-if="unavailableForecast" class="tyre-race__weather-unavailable" role="status">{{ t('overlays.weather.unavailable') }}</small>
      <template v-else><div v-for="item in weather" :key="item.horizon" :title="item.title" :aria-label="item.title" :data-rain-intensity="item.intensity">
        <strong>{{ item.horizon }}</strong><span><RaceWeatherIcon :item="item" /></span>
      </div></template>
    </header>
</template>
<style scoped>
.tyre-race__weather {
  display:grid; grid-template-columns:repeat(3,1fr); flex:0 0 calc(78px * var(--hud-scale,1));
  border-bottom:1px solid #45484e; background:#080a0e;
}
.tyre-race__weather-unavailable { grid-column:1/-1; align-self:center; padding:8px; text-align:center; color:#cbd5e1; font:12px/1.3 system-ui,sans-serif; }
.tyre-race__weather div { display:grid; place-items:center; align-content:center; }
.tyre-race__weather div+div { border-left:1px solid #303238; }
.tyre-race__weather strong { font-size:max(18px,calc(25px * var(--hud-scale,1))); line-height:1; }
.tyre-race__weather span { min-height:1em; font-size:max(21px,calc(30px * var(--hud-scale,1))); line-height:1.05; }

</style>
