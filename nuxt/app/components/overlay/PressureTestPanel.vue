<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { usePresentationInterval } from '~/composables/usePresentationVisibility'

type Snapshot = {
  available?: boolean
  status?: string
  reason?: string
  message?: string
  result?: {
    target: number
    wheels: Array<{ wheel: string; name: string; cold: number }>
    context: { track: string; air: number; road: number }
  }
}
const props = defineProps<{ api?: {
  trainingOverlayPressureTestState?: () => Promise<Snapshot>
  trainingOverlayPressureTest?: () => Promise<Snapshot>
} | null; disabled?: boolean }>()
const state = ref<Snapshot>({})
const requesting = ref(false)
let generation = 0
const pending = computed(() => requesting.value || ['reading', 'calculating'].includes(state.value.status || ''))
const psi = (value: number) => value.toFixed(1).replace('.', ',')
async function refresh() {
  if (requesting.value) return
  const current = generation
  try { const next = await props.api?.trainingOverlayPressureTestState?.(); if (current === generation && !requesting.value) state.value = next || {} }
  catch { if (current === generation && !requesting.value) state.value = { ...state.value, status: 'error', result: undefined, reason: 'Lettura del risultato non disponibile.' } }
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
  finally { requesting.value = false }
}
const polling = usePresentationInterval(() => { void refresh() }, 1000)
onMounted(() => { void refresh(); polling.start() })
</script>

<template>
  <section v-if="state.available" class="pressure-test" aria-label="Pressioni Test">
    <button type="button" class="pressure-test__button" data-overlay-wheel-action="pressure-test"
      :disabled="pending || disabled" :aria-busy="pending" @click="run">{{ pending ? 'Pressioni Test…' : 'Pressioni Test' }}</button>
    <p v-if="pending" class="launcher-hint" role="status">{{ state.message || 'Calcolo in corso…' }}</p>
    <p v-else-if="state.status === 'error'" class="launcher-hint" role="alert">{{ state.reason }}</p>
    <div v-else-if="state.status === 'ready' && state.result" class="pressure-test__result" role="status">
      <strong>Stima iniziale · obiettivo {{ psi(state.result.target) }} PSI</strong>
      <dl>
        <div v-for="wheel in state.result.wheels" :key="wheel.wheel">
          <dt>{{ wheel.name }}</dt><dd>{{ psi(wheel.cold) }} <small>PSI</small></dd>
        </div>
      </dl>
      <p>{{ state.result.context.track }} · Aria {{ psi(state.result.context.air) }} °C · Pista {{ psi(state.result.context.road) }} °C</p>
      <p>Da impostare a mano · gomme nuove · stima sperimentale.</p>
      <p>Ricalcola se modifichi setup o condizioni.</p>
    </div>
  </section>
</template>

<style scoped>
.pressure-test { display: grid; gap: 6px; min-width: 0; grid-column: 1 / -1; order: 99; flex: 0 0 100%; }
.pressure-test__button { width: 100%; padding: 10px; border: 1px solid #626262; background: #292929; color: #eee; font: inherit; font-size: 12px; cursor: pointer; }
.pressure-test__button:disabled { opacity: .5; cursor: default; }
.pressure-test__button:focus-visible, .pressure-test__button[data-overlay-selected] { outline: 2px solid #ffe27a; outline-offset: 1px; }
.pressure-test__result { padding: 10px; border: 1px solid #ffffff26; border-radius: 8px; font-size: 12px; }
.pressure-test__result dl { display: grid; gap: 4px; margin: 8px 0; }
.pressure-test__result dl > div { display: flex; justify-content: space-between; gap: 12px; }
.pressure-test__result dd { margin: 0; font-size: 16px; font-weight: 700; font-variant-numeric: tabular-nums; }
.pressure-test__result small { font-size: 10px; font-weight: 400; }
.pressure-test__result p { margin: 4px 0 0; opacity: .75; }
</style>
