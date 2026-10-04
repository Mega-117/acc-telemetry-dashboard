<script setup lang="ts">
import { useGameContext } from '~/composables/useGameContext'
import { preparePage, preparePageFonts } from '~/services/ui/pagePreparation'
import { useTelemetryGateway } from '~/composables/useTelemetryGateway'
import { decodeOverviewImage } from '~/services/auth/overviewEntryPreparation'
import { responsiveImage, TRACK_CARD_SIZES } from '~/utils/responsiveImage'
import { buildCommonTrackOverview } from '~/services/projections/buildCommonTrackOverview'
definePageMeta({
  layout: 'dashboard'
})
const baseURL = useRuntimeConfig().app.baseURL
async function prepare() {
  const gameId = useGameContext().consultedGame.value
  const gateway = useTelemetryGateway(gameId)
  return preparePage(async () => {
    const [sessions] = await Promise.all([gateway.getVehicleHistory(), preparePageFonts()])
    const tracks = buildCommonTrackOverview(sessions, gameId)
    // The small responsive catalog is prepared as a unit: wide windows may
    // expose more than the six eager cards before the first scroll.
    await Promise.allSettled(tracks.filter(track => track.image).map(track =>
      decodeOverviewImage(responsiveImage(track.image!, baseURL, TRACK_CARD_SIZES))))
    return { tracks, sessions, gameId }
  })
}
const prepared = shallowRef(await prepare())
async function retry() { prepared.value = await prepare() }
</script>

<template>
  <PagesPistePage v-if="prepared.ok" :initial-sessions="prepared.value.gameId === useGameContext().consultedGame.value ? prepared.value.sessions : undefined" :initial-tracks="prepared.value.gameId === useGameContext().consultedGame.value ? prepared.value.tracks : undefined" @go-to-track="navigateTo(`/piste/${encodeURIComponent($event)}`)" />
  <LayoutPagePreparationError v-else @retry="retry" />
</template>
