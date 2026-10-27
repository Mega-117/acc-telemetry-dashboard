<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { commonSessionPresentation } from '~/services/telemetry/commonSessionPresentation'
import { useTelemetryGateway } from '~/composables/useTelemetryGateway'
import { usePilotContext } from '~/composables/usePilotContext'
import { filterHistory, historyBest, historyTrackId } from '~/services/projections/vehicleHistory'
import { formatLapTime } from '~/utils/telemetryFormat'
import { useI18n } from '~/i18n'
const { t } = useI18n()
const props = defineProps<{ session: unknown; ownerId?: string }>()
const model = computed(() => commonSessionPresentation(props.session))
const pilot = usePilotContext()
const references = ref<ReturnType<typeof historyBest>>({})
const referenceError = ref(false)
let revision = 0
watch(() => [props.session, props.ownerId, pilot.value], async () => {
  const ticket = ++revision
  references.value = {}
  referenceError.value = false
  const current = model.value
  if (!current) return
  try {
    const sessions = await useTelemetryGateway(current.gameId).getVehicleHistory(props.ownerId || pilot.value || undefined,
      historyTrackId(current.track, current.variant), true)
    if (ticket === revision) references.value = historyBest(filterHistory(sessions, current.gameId, { car: current.car }))
  } catch { if (ticket === revision) referenceError.value = true }
}, { immediate: true })
</script>

<template>
  <section class="common-session racing-data">
    <slot name="actions" />
    <template v-if="model">
      <p class="eyebrow">{{ model.game }} · {{ t('sessions.type.unknown') }}</p>
      <h1>{{ model.track }}</h1>
      <p>{{ model.car }} · {{ model.date }}</p>
      <p v-if="model.variant">{{ t('sessions.common.variant') }}: {{ model.variant }}</p>
      <section class="historical-references" :aria-label="t('sessions.common.referencesAria')">
        <h2>{{ t('overview.historyCar') }} · {{ model.car }}</h2>
        <p v-if="referenceError">{{ t('sessions.common.referencesError') }}</p>
        <dl v-else class="common-analysis">
          <dt>{{ t('overview.columns.qualify') }}</dt><dd>{{ formatLapTime(references.bestQualy) }}</dd>
          <dt>{{ t('overview.columns.race') }}</dt><dd>{{ formatLapTime(references.bestRace) }}</dd>
          <dt>{{ t('overview.columns.avgRace') }}</dt><dd>{{ formatLapTime(references.bestAvgRace) }}</dd>
        </dl>
        <p class="availability">{{ t('sessions.common.fuelRule') }}</p>
      </section>
      <dl v-if="model.analysis" class="common-analysis">
        <dt>{{ t('sessions.common.eligibleLaps') }}</dt><dd>{{ model.analysis.eligibleLaps }}</dd>
        <dt>{{ t('sessions.common.best') }}</dt><dd>{{ model.analysis.best }}</dd>
        <dt>{{ t('sessions.common.average') }}</dt><dd>{{ model.analysis.average }}</dd>
        <dt>{{ t('sessions.common.consistency') }}</dt><dd>{{ model.analysis.consistency }}</dd>
        <dt>{{ t('sessions.common.theoretical') }}</dt><dd>{{ model.analysis.theoretical }}</dd>
      </dl>
      <div class="racing-table-scroll">
        <table class="racing-day-table">
          <caption>{{ t('sessions.common.recordedTimes') }}</caption>
          <thead><tr><th>{{ t('sessions.common.lap') }}</th><th>{{ t('sessions.common.time') }}</th><th>{{ t('sessions.common.recording') }}</th><th>{{ t('sessions.common.validity') }}</th><th>{{ t('sessions.common.sectors') }}</th></tr></thead>
          <tbody><tr v-for="lap in model.laps" :key="lap.number">
            <td>{{ lap.number }}</td><td>{{ lap.time }}</td><td>{{ lap.completeness }}</td><td>{{ lap.validity }}</td>
            <td><span v-for="(sector, index) in lap.sectors" :key="index" class="sector">S{{ index + 1 }} {{ sector }}</span><span v-if="!lap.sectors.length">{{ t('sessions.common.sectorsNone') }}</span></td>
          </tr></tbody>
        </table>
      </div>
      <p class="availability">{{ t('sessions.common.legend') }}</p>
    </template>
    <p v-else>{{ t('sessions.common.unsupported') }}</p>
  </section>
</template>

<style scoped lang="scss">
@use '@/assets/scss/racing-settings' as controls;
.common-session { @include controls.tokens; padding: 28px; }
h1 { margin: 6px 0; }
.eyebrow, .availability { color: var(--racing-data-muted); }
.eyebrow { font-size: 11px; letter-spacing: .1em; }
.sector { display: inline-block; margin-right: 18px; font-variant-numeric: tabular-nums; }
th { text-align: left; }
.availability { font-size: 12px; margin-top: 20px; }
</style>
