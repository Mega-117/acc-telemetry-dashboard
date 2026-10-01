<script setup lang="ts">
import { computed } from 'vue'
import type { FastOverlayState } from '~/composables/useFastStatePoller'
import { raceWeatherItem } from '~/utils/raceWeatherPresentation'
import RaceWeatherIcon from './RaceWeatherIcon.vue'
const props = defineProps<{ fastState: FastOverlayState }>()
const weather = computed(() => [
  raceWeatherItem(props.fastState.rainIntensity, 0, props.fastState.isFresh && props.fastState.isLive),
  raceWeatherItem(props.fastState.rainIntensity10Min, 10, props.fastState.isFresh && props.fastState.isLive),
  raceWeatherItem(props.fastState.rainIntensity30Min, 30, props.fastState.isFresh && props.fastState.isLive),
])
</script>
<template>
    <header class="tyre-race__weather">
      <div v-for="item in weather" :key="item.horizon" :title="item.title" :aria-label="item.title" :data-rain-intensity="item.intensity">
        <strong>{{ item.horizon }}</strong><span><RaceWeatherIcon :item="item" /></span>
      </div>
    </header>
</template>
<style scoped>
.tyre-race__weather {
  display:grid; grid-template-columns:repeat(3,1fr); flex:0 0 calc(78px * var(--hud-scale,1));
  border-bottom:1px solid #45484e; background:#080a0e;
}
.tyre-race__weather div { display:grid; place-items:center; align-content:center; }
.tyre-race__weather div+div { border-left:1px solid #303238; }
.tyre-race__weather strong { font-size:max(18px,calc(25px * var(--hud-scale,1))); line-height:1; }
.tyre-race__weather span { min-height:1em; font-size:max(21px,calc(30px * var(--hud-scale,1))); line-height:1.05; }

</style>
