<script setup lang="ts">
import { useGameContext } from '~/composables/useGameContext'
import { preparePage, preparePageFonts, rememberPage, rememberedPage } from '~/services/ui/pagePreparation'
import { overviewEntryKey, decodeOverviewImage } from '~/services/auth/overviewEntryPreparation'
import { useTargetUserId } from '~/composables/usePilotContext'
import { useTelemetryGateway } from '~/composables/useTelemetryGateway'
import { loadRaceCalendarEvents } from '~/repositories/raceCalendarRepository'
import { responsiveImage, OVERVIEW_CAR_SIZES } from '~/utils/responsiveImage'
import { getOverviewCarImage } from '~/utils/overviewCarImage'
import { useFirebaseAuth } from '~/composables/useFirebaseAuth'
import { OverviewNotReadyError } from '~/services/gateway/offlineOverviewPolicy'
definePageMeta({
  layout: 'dashboard'
})
const uid = useTargetUserId().value
const gateway = useTelemetryGateway('acc')
const { cloudSessionReady } = useFirebaseAuth()
const entry = inject(overviewEntryKey, null)
const baseURL = useRuntimeConfig().app.baseURL
async function prepare() {
  if (useGameContext().consultedGame.value !== 'acc') return { ok: true as const, value: undefined }
  return preparePage(async () => {
    if (!uid) throw new Error('No owner')
    // PIP-555: before the cloud, with nothing known, the page waits instead of saying "empty".
    const NOT_READY = 'not-ready' as const
    const [projection, events] = await Promise.all([
      (entry?.value?.takeProjection(uid) || gateway.getOverviewProjection(uid))
        .catch((error: unknown) => { if (error instanceof OverviewNotReadyError) return NOT_READY; throw error }),
      cloudSessionReady.value ? entry?.value?.takeEvents(uid) || loadRaceCalendarEvents(uid, 25) : [],
      preparePageFonts(),
    ])
    const pending = projection === NOT_READY
    const ready = pending ? null : projection
    await decodeOverviewImage(responsiveImage(getOverviewCarImage(ready?.lastCar.rawName), baseURL, OVERVIEW_CAR_SIZES)).catch(() => {})
    return { uid, projection: ready, events, pending }
  })
}
// 06/11 (user: "I click and nothing happens for a moment"): the projection was rebuilt on every visit (0.5-0.65 s while
// the old page waited). Seen before for this owner, the page enters at once with what it showed and refreshes behind.
const rememberKey = `panoramica:${uid}`
const remembered = useGameContext().consultedGame.value === 'acc' ? rememberedPage<NonNullable<Awaited<ReturnType<typeof prepare>> & { ok: true }>['value']>(rememberKey) : undefined
const prepared = shallowRef(remembered ? { ok: true as const, value: { ...remembered, stale: true } } : await prepare())
if (prepared.value.ok && prepared.value.value && !remembered) rememberPage(rememberKey, prepared.value.value)
// The refresh behind is PanoramicaPage's own load (`stale`), which drops late answers and shows errors (Codex 06/11).
async function retry() { prepared.value = await prepare(); if (prepared.value.ok && prepared.value.value) rememberPage(rememberKey, prepared.value.value) }
watch(useGameContext().consultedGame, game => { if (game === 'acc') void retry() })
</script>

<template>
  <PagesPanoramicaPage v-if="prepared.ok || useGameContext().consultedGame.value !== 'acc'" :prepared="prepared.ok ? prepared.value : undefined" />
  <LayoutPagePreparationError v-else @retry="retry" />
</template>
