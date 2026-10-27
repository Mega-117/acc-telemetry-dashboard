<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { useOverlayRegionApi } from '~/composables/useOverlayRegionApi'
import { useStandingsState } from '~/composables/useStandingsState'
import { useFastStatePoller } from '~/composables/useFastStatePoller'
import { scopeStandingsForLive, commonStandingsLocal } from '~/services/overlay/standingsPresentation'
import { useI18n } from '~/i18n'

const { t } = useI18n()

// Local simulator identities are display facts, never Pitwall memberships.
const getApi = useOverlayRegionApi()
const standings = useStandingsState(getApi)
const fast = useFastStatePoller(getApi)
const localCar = computed(() => {
  const state = scopeStandingsForLive(standings.state.value, fast.fastState.value.commonLive, standings.nowMs.value)
  const local = commonStandingsLocal(state, standings.nowMs.value)
  return local ? state.snapshot?.cars.find(car => car.car_index === local.carIndex) ?? null : null
})
const drivers = computed(() => localCar.value?.drivers.slice(0, 16).map((driver, index) => ({
  index,
  name: [driver.first_name, driver.last_name].filter(value => typeof value === 'string' && value.trim())
    .map(value => String(value).slice(0, 60)).join(' ') || t('pitwall.localCrew.noName'),
  current: localCar.value?.current_driver_index === index,
})) ?? [])
onMounted(() => { standings.start(); void fast.startFastStatePolling() })
onUnmounted(() => { standings.stop(); fast.stopFastStatePolling() })
</script>

<template>
  <section v-if="drivers.length" class="local-crew" :aria-label="t('pitwall.localCrew.aria')">
    <h3>{{ t('pitwall.localCrew.title') }} <span v-if="localCar?.race_number != null">· #{{ localCar.race_number }}</span></h3>
    <ul><li v-for="driver in drivers" :key="driver.index">
      <span>{{ driver.name }}</span><small v-if="driver.current">{{ t('pitwall.localCrew.atWheel') }}</small>
    </li></ul>
  </section>
</template>

<style scoped>
.local-crew { border: 1px solid var(--pwc-line, #333); padding: 14px 18px; }
h3 { margin: 0 0 10px; font-size: 13px; }
ul { list-style: none; margin: 0; padding: 0; }
li { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px; padding: 6px 0; }
small { color: #a9c3d2; }
</style>
