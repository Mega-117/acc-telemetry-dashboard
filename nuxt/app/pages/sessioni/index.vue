<script setup lang="ts">
import { preparePage, preparePageFonts } from '~/services/ui/pagePreparation'
import { useTelemetryGateway } from '~/composables/useTelemetryGateway'
definePageMeta({
  layout: 'dashboard'
})
const gateway = useTelemetryGateway()
async function prepare() {
  return preparePage(async () => {
    await Promise.all([
      gateway.getSessionsPage(undefined, { sessionTypes: [], fromDateIso: null, toDateIso: null, track: null, car: null, carCategory: null, hideEmpty: true }, 1, 25),
      preparePageFonts(),
    ])
    return true
  })
}
const prepared = shallowRef(await prepare())
async function retry() { prepared.value = await prepare() }
</script>

<template>
  <PagesSessioniPage v-if="prepared.ok" initially-prepared @go-to-session="navigateTo(`/sessioni/${$event}`)" />
  <LayoutPagePreparationError v-else @retry="retry" />
</template>
