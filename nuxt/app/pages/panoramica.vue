<script setup lang="ts">
import { useGameContext } from '~/composables/useGameContext'
import { preparePage, preparePageFonts } from '~/services/ui/pagePreparation'
import { overviewEntryKey, decodeOverviewImage } from '~/services/auth/overviewEntryPreparation'
import { useTargetUserId } from '~/composables/usePilotContext'
import { useTelemetryGateway } from '~/composables/useTelemetryGateway'
import { loadRaceCalendarEvents } from '~/repositories/raceCalendarRepository'
import { responsiveImage, OVERVIEW_CAR_SIZES } from '~/utils/responsiveImage'
import { getOverviewCarImage } from '~/utils/overviewCarImage'
definePageMeta({
  layout: 'dashboard'
})
const uid = useTargetUserId().value
const gateway = useTelemetryGateway('acc')
const entry = inject(overviewEntryKey, null)
const baseURL = useRuntimeConfig().app.baseURL
async function prepare() {
  if (useGameContext().consultedGame.value !== 'acc') return { ok: true as const, value: undefined }
  return preparePage(async () => {
    if (!uid) throw new Error('No owner')
    const [projection, events] = await Promise.all([
      entry?.value?.takeProjection(uid) || gateway.getOverviewProjection(uid),
      entry?.value?.takeEvents(uid) || loadRaceCalendarEvents(uid, 25),
      preparePageFonts(),
    ])
    await decodeOverviewImage(responsiveImage(getOverviewCarImage(projection?.lastCar.rawName), baseURL, OVERVIEW_CAR_SIZES)).catch(() => {})
    return { uid, projection, events }
  })
}
const prepared = shallowRef(await prepare())
async function retry() { prepared.value = await prepare() }
watch(useGameContext().consultedGame, game => { if (game === 'acc') void retry() })
</script>

<template>
  <PagesPanoramicaPage v-if="prepared.ok || useGameContext().consultedGame.value !== 'acc'" :prepared="prepared.ok ? prepared.value : undefined" />
  <LayoutPagePreparationError v-else @retry="retry" />
</template>
