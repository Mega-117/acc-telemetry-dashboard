<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { Gauge } from '@lucide/vue'
import { usePresentationInterval } from '~/composables/usePresentationVisibility'
import type { ControlKStatusMessage } from '~/services/overlay/controlKStatus'

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
} | null; disabled?: boolean; horizontal?: boolean; feedbackTarget?: string
  /** PIP-556: progress goes to the Control K status line; only final outcomes go to the feedback target. */
  statusLine?: boolean }>()
const emit = defineEmits<{ status: [message: ControlKStatusMessage | null] }>()
const state = ref<Snapshot>({})
const requesting = ref(false)
let generation = 0
const pending = computed(() => requesting.value || ['reading', 'calculating', 'applying'].includes(state.value.status || ''))
const psi = (value: number) => value.toFixed(1).replace('.', ',')
// One line for the Control K status: progress, error, or the four applied PSI.
// An expired estimate (PIP-556) is a state of the button, never a message.
const statusMessage = computed<ControlKStatusMessage | null>(() => {
  if (pending.value) return { tone: 'progress', text: `Stima pressioni: ${state.value.message || 'calcolo in corso…'}` }
  if (state.value.status === 'error') return { tone: 'error', text: `Stima pressioni: ${state.value.reason || 'non riuscita.'}${state.value.partial ? ' Controlla il setup.' : ''}` }
  if (state.value.status === 'ready' && state.value.result) {
    const values = state.value.result.wheels.map(w => `${w.wheel} ${psi(w.cold)}`).join(' · ')
    return state.value.applied
      ? { tone: 'ok', text: `Stima applicata: ${values} PSI` }
      : { tone: 'error', text: `Stima ${values} PSI: applicazione non confermata, controlla il setup.` }
  }
  return null
})
watch(statusMessage, message => emit('status', message), { immediate: true })
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
  <section v-if="state.available" class="pressure-test" :class="{ 'pressure-test--horizontal': horizontal }" aria-label="Stima pressioni">
    <button type="button" class="pressure-test__button" data-overlay-wheel-action="pressure-test"
      title="Legge il setup e applica le pressioni iniziali stimate" aria-label="Stima pressioni BETA"
      :disabled="pending || disabled" :aria-busy="pending" @click="run"><Gauge :size="20" aria-hidden="true" /><span>Stima<br>pressioni</span><small class="quick-action-badge">BETA</small></button>
    <Teleport defer :to="feedbackTarget || '#quick-panel-horizontal-feedback'" :disabled="!feedbackTarget && !horizontal">
    <div class="pressure-test__feedback" aria-live="polite">
    <p v-if="pending && !statusLine" class="launcher-hint" role="status">{{ state.message || 'Calcolo in corso…' }}</p>
    <div v-else-if="!pending && state.status === 'error'" class="launcher-hint pressure-test__error" role="alert">
      <p>{{ state.reason }}</p>
      <p v-if="state.partial">Applicazione incompleta: alcune pressioni potrebbero essere cambiate. Controlla il setup.</p>
      <p v-if="state.partial && state.result">Previste: {{ state.result.wheels.map(w => `${w.wheel} ${psi(w.cold)}`).join(' · ') }} PSI</p>
      <p v-if="state.observed">Ultime lette: {{ Object.entries(state.observed).map(([w, v]) => `${w} ${psi(v / 10)}`).join(' · ') }} PSI</p>
    </div>
    <div v-else-if="!pending && state.status === 'ready' && state.result" class="pressure-test__result" role="status">
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
.pressure-test--horizontal { flex: 0 0 64px; align-content: start; }
.pressure-test__button { position: relative; width: 64px; height: 64px; padding: 8px 2px 3px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px; border: 1px solid #626262; background: #292929; color: #eee; font: inherit; font-size: 10px; line-height: 11px; cursor: pointer; }
.pressure-test__button .quick-action-badge { position: absolute; top: 3px; right: 3px; padding: 0 3px; border: 1px solid #ffffff30; color: #ffe27a; background: #0b0b0b; font-size: 9px; font-weight: 700; line-height: 12px; }
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
