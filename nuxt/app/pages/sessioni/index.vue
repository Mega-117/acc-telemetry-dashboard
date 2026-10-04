<script setup lang="ts">
import { useGameContext } from '~/composables/useGameContext'
import { preparePage, preparePageFonts } from '~/services/ui/pagePreparation'
import { useTelemetryGateway } from '~/composables/useTelemetryGateway'
definePageMeta({
  layout: 'dashboard'
})
const gateway = useTelemetryGateway()
async function prepare() {
  const gameId = useGameContext().consultedGame.value
  return preparePage(async () => {
    await Promise.all([
      gateway.getSessionsPage(undefined, { gameId, sessionTypes: [], fromDateIso: null, toDateIso: null, track: null, car: null, carCategory: null, hideEmpty: true }, 1, 25),
      preparePageFonts(),
    ])
    return gameId
  })
}
const prepared = shallowRef(await prepare())
async function retry() { prepared.value = await prepare() }
</script>

<template>
  <PagesSessioniPage v-if="prepared.ok" :initially-prepared="prepared.value === useGameContext().consultedGame.value" @go-to-session="navigateTo(`/sessioni/${$event}`)" />
  <LayoutPagePreparationError v-else @retry="retry" />
</template>
