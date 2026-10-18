<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Gauge } from '@lucide/vue'
import { usePresentationInterval } from '~/composables/usePresentationVisibility'

type Snapshot = {
  available?: boolean
  status?: string
  reason?: string
  message?: string
  partial?: boolean
  applied?: boolean
  observed?: Record<string, number>
  result?: {
    target: number
    wheels: Array<{ wheel: string; name: string; cold: number }>
    context: { track: string; air: number; road: number }
  }
}
const props = defineProps<{ api?: {
  trainingOverlayPressureTestState?: () => Promise<Snapshot>
  trainingOverlayPressureTest?: () => Promise<Snapshot>
} | null; disabled?: boolean; horizontal?: boolean }>()
const state = ref<Snapshot>({})
const requesting = ref(false)
let generation = 0
const pending = computed(() => requesting.value || ['reading', 'calculating', 'applying'].includes(state.value.status || ''))
const psi = (value: number) => value.toFixed(1).replace('.', ',')
async function refresh() {
  const current = generation
  try { const next = await props.api?.trainingOverlayPressureTestState?.(); if (current === generation && next) state.value = next }
  catch { /* A missed poll must not cancel an active native transaction. */ }
}
async function run() {
  if (pending.value || props.disabled) return
  requesting.value = true
  generation++
  state.value = { available: true, status: 'reading', message: 'Leggo condizioni e setup…' }
  try {
    const result = await props.api?.trainingOverlayPressureTest?.()
    state.value = result ? { ...result, available: true } : { available: true, status: 'error', reason: 'Comando non disponibile.' }
  } catch { state.value = { available: true, status: 'error', reason: 'Stima interrotta. Controlla il setup prima di riprovare.' } }
  finally { generation++; requesting.value = false }
}
const polling = usePresentationInterval(() => { void refresh() }, 1000)
onMounted(() => { void refresh(); polling.start() })
</script>

<template>
  <section v-if="state.available" class="pressure-test" :class="{ 'pressure-test--horizontal': horizontal }" aria-label="Pressioni Test">
    <button type="button" class="pressure-test__button" data-overlay-wheel-action="pressure-test"
      title="Legge il setup e applica le pressioni iniziali stimate" aria-label="Pressioni Test BETA"
      :disabled="pending || disabled" :aria-busy="pending" @click="run"><Gauge :size="20" aria-hidden="true" /><span>Pressioni<br>Test</span><small>BETA</small></button>
    <Teleport defer to="#quick-panel-horizontal-feedback" :disabled="!horizontal">
    <div class="pressure-test__feedback" aria-live="polite">
    <p v-if="pending" class="launcher-hint" role="status">{{ state.message || 'Calcolo in corso…' }}</p>
    <div v-else-if="state.status === 'error'" class="launcher-hint" role="alert">
      <p>{{ state.reason }}</p>
      <p v-if="state.partial">Applicazione incompleta: alcune pressioni potrebbero essere cambiate. Controlla il setup.</p>
      <p v-if="state.partial && state.result">Previste: {{ state.result.wheels.map(w => `${w.wheel} ${psi(w.cold)}`).join(' · ') }} PSI</p>
      <p v-if="state.observed">Ultime lette: {{ Object.entries(state.observed).map(([w, v]) => `${w} ${psi(v / 10)}`).join(' · ') }} PSI</p>
    </div>
    <div v-else-if="state.status === 'ready' && state.result" class="pressure-test__result" role="status">
      <strong>Stima iniziale · obiettivo {{ psi(state.result.target) }} PSI</strong>
      <dl>
        <div v-for="wheel in state.result.wheels" :key="wheel.wheel">
          <dt>{{ wheel.name }}</dt><dd>{{ psi(wheel.cold) }} <small>PSI</small></dd>
        </div>
      </dl>
      <p>{{ state.result.context.track }} · Aria {{ psi(state.result.context.air) }} °C · Pista {{ psi(state.result.context.road) }} °C</p>
      <p>{{ state.applied ? 'Pressioni applicate e verificate nel setup.' : 'Applicazione non confermata.' }}</p>
      <p>Obiettivo a caldo stimato · gomme nuove · BETA.</p>
      <p>Ricalcola se modifichi setup o condizioni.</p>
    </div>
    </div>
    </Teleport>
  </section>
</template>

<style scoped>
.pressure-test { display: grid; gap: 6px; min-width: 0; grid-column: 1 / -1; order: 99; }
.pressure-test--horizontal { flex: 0 0 64px; align-content: start; order: 5; grid-column: auto; padding-top: 20px; }
.pressure-test__button { width: 64px; height: 64px; padding: 3px 2px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px; border: 1px solid #626262; background: #292929; color: #eee; font: inherit; font-size: 10px; line-height: 11px; cursor: pointer; }
.pressure-test__button small { color: #ffe27a; font-size: 8px; font-weight: 700; line-height: 9px; }
.pressure-test__feedback:empty { display: none; }
.pressure-test__button:disabled { opacity: .5; cursor: default; }
.pressure-test__button:focus-visible, .pressure-test__button[data-overlay-selected] { outline: 2px solid #ffe27a; outline-offset: 1px; }
.pressure-test__result { padding: 10px; border: 1px solid #ffffff26; border-radius: 8px; font-size: 12px; }
.pressure-test__result dl { display: grid; gap: 4px; margin: 8px 0; }
.pressure-test__result dl > div { display: flex; justify-content: space-between; gap: 12px; }
.pressure-test__result dd { margin: 0; font-size: 16px; font-weight: 700; font-variant-numeric: tabular-nums; }
.pressure-test__result small { font-size: 10px; font-weight: 400; }
.pressure-test__result p { margin: 4px 0 0; opacity: .75; }
</style>
