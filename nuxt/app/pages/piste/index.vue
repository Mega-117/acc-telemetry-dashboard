<script setup lang="ts">
import { useGameContext } from '~/composables/useGameContext'
import { preparePage, preparePageFonts } from '~/services/ui/pagePreparation'
import { useTelemetryGateway } from '~/composables/useTelemetryGateway'
import { decodeOverviewImage } from '~/services/auth/overviewEntryPreparation'
import { responsiveImage, TRACK_CARD_SIZES } from '~/utils/responsiveImage'
definePageMeta({
  layout: 'dashboard'
})
const gateway = useTelemetryGateway()
const baseURL = useRuntimeConfig().app.baseURL
async function prepare() {
  if (useGameContext().consultedGame.value !== 'acc') return { ok: false as const }
  return preparePage(async () => {
    const [tracks] = await Promise.all([gateway.getTracksOverviewProjection(), preparePageFonts()])
    // The small responsive catalog is prepared as a unit: wide windows may
    // expose more than the six eager cards before the first scroll.
    await Promise.allSettled(tracks.filter(track => track.image).map(track =>
      decodeOverviewImage(responsiveImage(track.image!, baseURL, TRACK_CARD_SIZES))))
    return tracks
  })
}
const prepared = shallowRef(await prepare())
async function retry() { prepared.value = await prepare() }
</script>

<template>
  <PagesCommonGamePage v-if="useGameContext().consultedGame.value !== 'acc'" surface="piste" />
  <PagesPistePage v-else-if="prepared.ok" :initial-tracks="prepared.value" @go-to-track="navigateTo(`/piste/${$event}`)" />
  <LayoutPagePreparationError v-else @retry="retry" />
</template>
