<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { commonSessionPresentation } from '~/services/telemetry/commonSessionPresentation'
import { useTelemetryGateway } from '~/composables/useTelemetryGateway'
import { usePilotContext } from '~/composables/usePilotContext'
import { filterHistory, historyBest, historyTrackId } from '~/services/projections/vehicleHistory'
import { formatLapTime } from '~/utils/telemetryFormat'
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
      <p class="eyebrow">{{ model.game }} · SESSIONE</p>
      <h1>{{ model.track }}</h1>
      <p>{{ model.car }} · {{ model.date }}</p>
      <p v-if="model.variant">Variante: {{ model.variant }}</p>
      <section class="historical-references" aria-label="Riferimenti storici della vettura">
        <h2>Storico vettura · {{ model.car }}</h2>
        <p v-if="referenceError">Riferimenti storici non disponibili al momento.</p>
        <dl v-else class="common-analysis">
          <dt>Qualifica</dt><dd>{{ formatLapTime(references.bestQualy) }}</dd>
          <dt>Gara</dt><dd>{{ formatLapTime(references.bestRace) }}</dd>
          <dt>Media gara</dt><dd>{{ formatLapTime(references.bestAvgRace) }}</dd>
        </dl>
        <p class="availability">Carburante: qualifica fino a 20 L, storico gara oltre 40 L. Media gara: almeno 5 giri puliti. I dati mancanti non generano record.</p>
      </section>
      <dl v-if="model.analysis" class="common-analysis">
        <dt>Giri completi e validi</dt><dd>{{ model.analysis.eligibleLaps }}</dd>
        <dt>Migliore</dt><dd>{{ model.analysis.best }}</dd>
        <dt>Media</dt><dd>{{ model.analysis.average }}</dd>
        <dt>Variabilità dei tempi</dt><dd>{{ model.analysis.consistency }}</dd>
        <dt>Teorico dai settori</dt><dd>{{ model.analysis.theoretical }}</dd>
      </dl>
      <div class="racing-table-scroll">
        <table class="racing-day-table">
          <caption>Tempi registrati</caption>
          <thead><tr><th>Giro</th><th>Tempo</th><th>Registrazione</th><th>Validità</th><th>Settori disponibili</th></tr></thead>
          <tbody><tr v-for="lap in model.laps" :key="lap.number">
            <td>{{ lap.number }}</td><td>{{ lap.time }}</td><td>{{ lap.completeness }}</td><td>{{ lap.validity }}</td>
            <td><span v-for="(sector, index) in lap.sectors" :key="index" class="sector">S{{ index + 1 }} {{ sector }}</span><span v-if="!lap.sectors.length">Non disponibili</span></td>
          </tr></tbody>
        </table>
      </div>
      <p class="availability">— indica un tempo non disponibile. La validità sconosciuta non è considerata valida nei best.</p>
    </template>
    <p v-else>Formato sessione non supportato.</p>
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
