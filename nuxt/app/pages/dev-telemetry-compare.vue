<script setup lang="ts">
/**
 * Pagina dev "Io vs Riferimento" (PIP-258): telemetria del giro registrato
 * sovrapposta al riferimento del coach + tabella curva per curva e verdetto.
 * Solo lettura: consuma i LapTrace del logger (IPC read-lap-trace) e
 * coach_state.json — nessun calcolo di confronto lato FE.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useCoachStatePoller } from '~/composables/useCoachStatePoller'
import {
  channelRange,
  normalizeLapTrace,
  polylinePoints,
  type ChartBox,
  type LapTraceView,
} from '~/services/telemetry/lapTraceChart'

definePageMeta({
  layout: 'dashboard'
})

const BOX: ChartBox = { width: 1150, height: 300, padding: 42 }
const REF_COLOR = '#2f7ed8'
const LAP_COLOR = '#d84b2f'
const CHARTS = [
  { channel: 'speed_kmh', title: 'Velocità', unit: 'km/h' },
  { channel: 'brake_pct', title: 'Freno', unit: '%' },
  { channel: 'throttle_pct', title: 'Gas', unit: '%' },
] as const

function getRuntimeApi(): any | null {
  if (typeof window === 'undefined') return null
  return (window as any).electronAPI || null
}

const { coachState, startCoachStatePolling, stopCoachStatePolling } = useCoachStatePoller(getRuntimeApi)

const traceList = ref<{ id: string, label: string }[]>([])
const referenceTrace = ref<LapTraceView | null>(null)
const lapTrace = ref<LapTraceView | null>(null)
const selectedLapId = ref<string>('')
const loadError = ref<string>('')
const runtimeAvailable = ref(true)

const lapOptions = computed(() => traceList.value.filter(item => item.id !== 'reference'))

function fmtTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  return `${minutes}:${(seconds % 60).toFixed(3).padStart(6, '0')}`
}

const chartModels = computed(() => {
  const traces = [referenceTrace.value, lapTrace.value].filter(Boolean) as LapTraceView[]
  if (!traces.length) return []
  return CHARTS.map(({ channel, title, unit }) => {
    const { yMin, yMax } = channelRange(traces, channel)
    return {
      channel,
      title,
      unit,
      yMin,
      yMax,
      reference: referenceTrace.value
        ? polylinePoints(referenceTrace.value, channel, BOX, yMin, yMax)
        : '',
      lap: lapTrace.value
        ? polylinePoints(lapTrace.value, channel, BOX, yMin, yMax)
        : '',
    }
  })
})

const cornerMarkers = computed(() => {
  const corners = coachState.value?.focus ? [coachState.value.focus] : []
  return corners.map(focus => ({
    x: BOX.padding + focus.apexNormPos * (BOX.width - 2 * BOX.padding),
    label: `focus C${focus.cornerId}`,
  }))
})

const cornerRows = computed(() => coachState.value?.lastLapCorners ?? [])

async function loadTraces() {
  loadError.value = ''
  const api = getRuntimeApi()
  if (typeof api?.listLapTraces !== 'function') {
    runtimeAvailable.value = false
    return
  }
  try {
    traceList.value = (await api.listLapTraces()) ?? []
    const reference = traceList.value.find(item => item.id === 'reference')
    referenceTrace.value = reference ? normalizeLapTrace(await api.readLapTrace('reference')) : null
    if (!selectedLapId.value && lapOptions.value.length) {
      selectedLapId.value = lapOptions.value[0]!.id
    }
    if (selectedLapId.value) {
      lapTrace.value = normalizeLapTrace(await api.readLapTrace(selectedLapId.value))
    }
    if (!referenceTrace.value && !lapTrace.value) {
      loadError.value = 'Nessun giro disponibile: gira con il logger acceso (PIP-253) su una pista con riferimento.'
    }
  } catch (error: any) {
    loadError.value = `Errore caricamento giri: ${error?.message ?? error}`
  }
}

async function onSelectLap() {
  const api = getRuntimeApi()
  if (typeof api?.readLapTrace !== 'function' || !selectedLapId.value) return
  lapTrace.value = normalizeLapTrace(await api.readLapTrace(selectedLapId.value))
}

onMounted(() => {
  startCoachStatePolling()
  void loadTraces()
})

onBeforeUnmount(() => {
  stopCoachStatePolling()
})
</script>

<template>
  <div class="telemetry-compare">
    <h1>Io vs Riferimento</h1>

    <p v-if="!runtimeAvailable" class="notice">
      Disponibile solo nell'app desktop (serve il runtime Electron per leggere i giri).
    </p>
    <p v-else-if="loadError" class="notice">{{ loadError }}</p>

    <section v-if="coachState" class="coach-box">
      <h2>Coach</h2>
      <p v-if="coachState.focus">
        Focus: <b>C{{ coachState.focus.cornerId }}<template v-if="coachState.focus.cornerName"> — {{ coachState.focus.cornerName }}</template></b>
        — {{ coachState.focus.metric }} / {{ coachState.focus.direction }}
        (~{{ coachState.focus.timeLostS }}s a giro)
        <span v-if="coachState.lastLapOutcome"> | ultimo giro: <b>{{ coachState.lastLapOutcome }}</b></span>
      </p>
      <p v-else>Nessuna curva-focus attiva (tutto entro tolleranza o dati insufficienti).</p>
    </section>

    <section class="selector">
      <label>
        Giro da confrontare:
        <select v-model="selectedLapId" @change="onSelectLap">
          <option v-for="option in lapOptions" :key="option.id" :value="option.id">{{ option.label }}</option>
        </select>
      </label>
      <button type="button" @click="loadTraces">Ricarica</button>
      <span v-if="referenceTrace" class="legend">
        <span :style="{ color: REF_COLOR }">■</span> riferimento {{ referenceTrace.car }} {{ fmtTime(referenceTrace.lapTimeS) }}
      </span>
      <span v-if="lapTrace" class="legend">
        <span :style="{ color: LAP_COLOR }">■</span> io {{ fmtTime(lapTrace.lapTimeS) }}
        <em v-if="!lapTrace.complete"> (parziale)</em>
        <em v-if="!lapTrace.valid"> (invalido)</em>
      </span>
    </section>

    <section v-for="model in chartModels" :key="model.channel" class="chart">
      <h3>{{ model.title }} <small>({{ model.unit }})</small></h3>
      <svg :viewBox="`0 0 ${BOX.width} ${BOX.height}`">
        <line
          v-for="marker in cornerMarkers"
          :key="marker.label"
          :x1="marker.x" :y1="BOX.padding" :x2="marker.x" :y2="BOX.height - BOX.padding"
          stroke="#c9a227" stroke-dasharray="5 4"
        />
        <polyline v-if="model.reference" :points="model.reference" fill="none" :stroke="REF_COLOR" stroke-width="1.5" />
        <polyline v-if="model.lap" :points="model.lap" fill="none" :stroke="LAP_COLOR" stroke-width="1.5" />
      </svg>
    </section>

    <section v-if="cornerRows.length" class="corners">
      <h2>Curva per curva (ultimo giro vs riferimento)</h2>
      <table>
        <thead>
          <tr>
            <th>Curva</th><th>Nome</th><th>Frenata Δm<br>(+ = più tardi)</th>
            <th>V-min Δkm/h</th><th>Gas Δm</th><th>Tempo perso (s)</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in cornerRows"
            :key="row.corner_id"
            :class="{ focus: coachState?.focus?.cornerId === row.corner_id }"
          >
            <td>C{{ row.corner_id }}</td>
            <td>{{ row.corner_name ?? '—' }}</td>
            <td>{{ row.brake_delta_m ?? '—' }}</td>
            <td>{{ row.vmin_delta_kmh }}</td>
            <td>{{ row.throttle_delta_m ?? '—' }}</td>
            <td>{{ row.time_lost_s }}</td>
          </tr>
        </tbody>
      </table>
    </section>
  </div>
</template>

<style scoped>
.telemetry-compare { max-width: 1200px; margin: 0 auto; padding: 16px; }
.notice { color: #b45309; }
.coach-box { background: rgba(47, 126, 216, 0.08); border-radius: 8px; padding: 8px 14px; margin-bottom: 12px; }
.selector { display: flex; align-items: center; gap: 14px; margin-bottom: 10px; flex-wrap: wrap; }
.legend em { opacity: 0.7; }
.chart svg { width: 100%; background: rgba(127, 127, 127, 0.06); border: 1px solid rgba(127, 127, 127, 0.25); border-radius: 6px; }
.corners table { border-collapse: collapse; }
.corners th, .corners td { border: 1px solid rgba(127, 127, 127, 0.35); padding: 4px 10px; text-align: right; }
.corners th:first-child, .corners td:first-child,
.corners th:nth-child(2), .corners td:nth-child(2) { text-align: left; }
.corners tr.focus { background: rgba(201, 162, 39, 0.18); font-weight: 600; }
</style>
