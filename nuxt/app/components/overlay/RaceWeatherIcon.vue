<script setup lang="ts">
import type { raceWeatherItem } from '~/utils/raceWeatherPresentation'
defineProps<{ item: ReturnType<typeof raceWeatherItem> }>()
</script>

<template>
  <span v-if="item.intensity === null" aria-hidden="true">—</span>
  <svg v-else viewBox="0 0 32 30" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M8 18h16a5 5 0 0 0 0-10 8 8 0 0 0-15-1 5.5 5.5 0 0 0-1 11Z" />
    <template v-if="item.intensity === 0">
      <path d="m12 13 3 3 6-6" />
    </template>
    <path v-for="drop in item.drops" :key="drop" :d="`M${5 + drop * 5} 22l-2 ${item.intensity === 1 ? 1 : 4}`" />
    <path v-if="item.thunder" d="m19 3-4 7h5l-4 7" stroke="#ffd45b" />
  </svg>
</template>

<style scoped>
svg { width: 1.25em; height: 1em; }
</style>
