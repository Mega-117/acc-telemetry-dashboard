<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { Gauge, LoaderCircle } from '@lucide/vue'
import { usePresentationInterval } from '~/composables/usePresentationVisibility'
import { readableReason, type ControlKStatusMessage } from '~/services/overlay/controlKStatus'
import { useI18n } from '~/i18n'

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
const emit = defineEmits<{ status: [message: ControlKStatusMessage | null]; outcome: [message: ControlKStatusMessage | null] }>()
const { t } = useI18n()
const state = ref<Snapshot>({})
const requesting = ref(false)
let generation = 0
const pending = computed(() => requesting.value || ['reading', 'calculating', 'applying'].includes(state.value.status || ''))
const psi = (value: number) => value.toFixed(1).replace('.', ',')
// One line for the Control K status: progress, error, or the four applied PSI.
// An expired estimate (PIP-556) is a state of the button, never a message.
const statusMessage = computed<ControlKStatusMessage | null>(() => {
  if (pending.value) return { tone: 'progress', text: t('quickPanel.estimate.statusProgress', { message: state.value.message || t('quickPanel.estimate.calculatingLower') }) }
  if (state.value.status === 'error') return { tone: 'error', text: t('quickPanel.estimate.statusError', { reason: readableReason(state.value.reason) }) + (state.value.partial ? t('quickPanel.estimate.checkSetup') : '') }
  if (state.value.status === 'ready' && state.value.result) {
    const values = state.value.result.wheels.map(w => `${w.wheel} ${psi(w.cold)}`).join(' · ')
    return state.value.applied
      ? { tone: 'ok', text: t('quickPanel.estimate.applied', { values }) }
      : { tone: 'error', text: t('quickPanel.estimate.notConfirmed', { values }) }
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
  state.value = { available: true, status: 'reading', message: t('quickPanel.estimate.reading') }
  try {
    const result = await props.api?.trainingOverlayPressureTest?.()
    state.value = result ? { ...result, available: true } : { available: true, status: 'error', reason: t('quickPanel.estimate.commandUnavailable') }
  } catch { state.value = { available: true, status: 'error', reason: t('quickPanel.estimate.interrupted') } }
  finally { generation++; requesting.value = false; emit('outcome', statusMessage.value) }
}
const polling = usePresentationInterval(() => { void refresh() }, 1000)
onMounted(() => { void refresh(); polling.start() })
</script>

<template>
  <section v-if="state.available" class="pressure-test" :class="{ 'pressure-test--horizontal': horizontal }" :aria-label="t('quickPanel.estimate.aria')">
    <button type="button" class="pressure-test__button" data-overlay-wheel-action="pressure-test"
      :title="t('quickPanel.estimate.buttonTitle')" :aria-label="t('quickPanel.estimate.buttonAria')"
      :disabled="pending || disabled" :aria-busy="pending" @click="run"><LoaderCircle v-if="pending" class="pressure-test__spinner" :size="20" aria-hidden="true" /><Gauge v-else :size="20" aria-hidden="true" /><span>{{ t('quickPanel.estimate.line1') }}<br>{{ t('quickPanel.estimate.line2') }}</span><small class="quick-action-badge">BETA</small></button>
    <Teleport defer :to="feedbackTarget || '#quick-panel-horizontal-feedback'" :disabled="!feedbackTarget && !horizontal">
    <div class="pressure-test__feedback" aria-live="polite">
    <p v-if="pending && !statusLine" class="launcher-hint" role="status">{{ state.message || t('quickPanel.estimate.calculating') }}</p>
    <div v-else-if="!pending && state.status === 'error'" class="launcher-hint pressure-test__error" role="alert">
      <p :title="state.reason">{{ statusLine ? readableReason(state.reason) : state.reason }}</p>
      <p v-if="state.partial">{{ t('quickPanel.estimate.partial') }}</p>
      <p v-if="state.partial && state.result">{{ t('quickPanel.estimate.expected', { values: state.result.wheels.map(w => `${w.wheel} ${psi(w.cold)}`).join(' · ') }) }}</p>
      <p v-if="state.observed">{{ t('quickPanel.estimate.lastRead', { values: Object.entries(state.observed).map(([w, v]) => `${w} ${psi(v / 10)}`).join(' · ') }) }}</p>
    </div>
    <div v-else-if="!pending && state.status === 'ready' && state.result" class="pressure-test__result" role="status">
      <strong>{{ t('quickPanel.estimate.resultTitle', { psi: psi(state.result.target) }) }}</strong>
      <dl>
        <div v-for="wheel in state.result.wheels" :key="wheel.wheel">
          <dt>{{ wheel.name }}</dt><dd>{{ psi(wheel.cold) }} <small>PSI</small></dd>
        </div>
      </dl>
      <p>{{ t('quickPanel.estimate.conditions', { track: state.result.context.track, air: psi(state.result.context.air), road: psi(state.result.context.road) }) }}</p>
      <p>{{ state.applied ? t('quickPanel.estimate.appliedVerified') : t('quickPanel.estimate.applyNotConfirmed') }}</p>
      <p>{{ t('quickPanel.estimate.hotTarget') }}</p>
      <p>{{ t('quickPanel.estimate.recalc') }}</p>
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
.pressure-test__button[aria-busy="true"] { opacity: 1; cursor: progress; }
.pressure-test__spinner { animation: pressure-test-spin .8s linear infinite; }
@keyframes pressure-test-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .pressure-test__spinner { animation: none; } }
.pressure-test__button:focus-visible, .pressure-test__button[data-overlay-selected] { outline: 2px solid #ffe27a; outline-offset: 1px; }
.pressure-test__result { padding: 10px; border: 1px solid #ffffff26; border-radius: 8px; font-size: 12px; }
.pressure-test__result dl { display: grid; gap: 4px; margin: 8px 0; }
.pressure-test__result dl > div { display: flex; justify-content: space-between; gap: 12px; }
.pressure-test__result dd { margin: 0; font-size: 16px; font-weight: 700; font-variant-numeric: tabular-nums; }
.pressure-test__result small { font-size: 10px; font-weight: 400; }
.pressure-test__result p { margin: 4px 0 0; opacity: .75; }
</style>
