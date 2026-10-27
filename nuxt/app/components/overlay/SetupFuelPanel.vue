<script setup lang="ts">
import { Fuel, LoaderCircle } from '@lucide/vue'
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import ControlKNumberField from '~/components/overlay/ControlKNumberField.vue'
import ControlKViewHeader from '~/components/overlay/ControlKViewHeader.vue'
import { fieldWheelCommand, singleField } from '~/utils/controlKNumberField'
import { useI18n } from '~/i18n'
const props = defineProps<{ api: any; separateView?: boolean; editorOnly?: boolean; showHeading?: boolean; statusTarget?: string; previewExpanded?: boolean; bodyTarget?: string
  /** PIP-556: unavailable commands stay pressable and explain why through `notice`. */
  reportUnavailable?: boolean
  /** PIP-556: minutes as the shared number field (wheel, mouse scroll, digits) instead of -/input/+. */
  numberField?: boolean }>()
const emit = defineEmits<{ open: []; cancel: []; notice: [text: string, tone: 'ok' | 'error'] }>()
const { t } = useI18n()
const minutes = defineModel<number>('minutes', { default: 10 })
const open = ref(props.editorOnly === true || props.previewExpanded === true), pending = ref(false), error = ref('')
const applicationSucceeded = ref(false)
const state = ref<any>(null)
const previewPending = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined
let successTimer: ReturnType<typeof setTimeout> | undefined
const SUCCESS_VISIBLE_MS = 5000
let generation = 0
let disposed = false
const plan = computed(() => state.value?.plan)
// Session type is polled lightly even while the panel is closed, so the
// whole-session button can be disabled outside qualifying/race (PIP-423).
const sessionType = ref<number | null>(null)
const sessionAllowsAuto = computed(() => sessionType.value === 1 || sessionType.value === 2)
// The reason alone feeds the notice; the hint adds the 'whole session' prefix.
const sessionReason = computed(() => sessionType.value === null ? t('hudSetup.fuel.sessionWaiting') : t('hudSetup.fuel.sessionOnlyQualifyRace'))
const sessionHint = computed(() => t('hudSetup.fuel.sessionHint', { reason: sessionReason.value }))
let sessionTimer: ReturnType<typeof setTimeout> | undefined
async function pollSession() {
  clearTimeout(sessionTimer)
  if (disposed) return
  if (!pending.value) {
    try {
      const value = await props.api?.trainingOverlayPreviewSetupFuel?.({ mode: 'minutes', minutes: Number(minutes.value) })
      if (!disposed && value && typeof value.sessionType === 'number') sessionType.value = value.sessionType
    } catch { /* keep the last known session type */ }
  }
  if (!disposed) sessionTimer = setTimeout(pollSession, 5000)
}
void pollSession()
const statusMessage = computed(() => pending.value ? t('hudSetup.fuel.preparing')
  : error.value || state.value?.conflict || state.value?.unavailableReason
  || (plan.value && !plan.value.ok ? plan.value.reason : '')
  || state.value?.result?.reason || (state.value?.available ? t('hudSetup.fuel.ready') : t('hudSetup.fuel.checking')))
// The minutes editor shows actionable problems, never successful sequence diagnostics.
const minutesProblem = computed(() => {
  if (pending.value) return ''
  return (!applicationSucceeded.value ? error.value : '')
    || state.value?.conflict || state.value?.unavailableReason
    || (plan.value?.ok === false ? plan.value.reason : '')
    || (state.value?.available === false ? t('hudSetup.fuel.unavailable') : '')
})
// The preview error shown last (identity, not text): a later good preview clears only that one.
let previewErrorShown = ''
async function refresh(background = false) {
  if (disposed || pending.value) return
  const token = ++generation
  if (!background) previewPending.value = true
  clearTimeout(timer)
  try {
    const value = await props.api?.trainingOverlayPreviewSetupFuel?.({ mode: 'minutes', minutes: minutes.value })
    if (token !== generation) return
    state.value = value
    if (value && typeof value.sessionType === 'number') sessionType.value = value.sessionType
    if (value && previewErrorShown && error.value === previewErrorShown) error.value = ''
    if (!value) { applicationSucceeded.value = false; error.value = t('hudSetup.fuel.restart') }
  } catch { if (token === generation) { state.value = null; applicationSucceeded.value = false; error.value = previewErrorShown = t('hudSetup.fuel.previewUnavailable') } }
  finally { if (token === generation) previewPending.value = false }
  if (token === generation && open.value) timer = setTimeout(() => refresh(true), 1500)
}
// Keep the displayed estimate mounted while recalculating; only a fresh preview can be applied.
watch([open, minutes], () => { error.value = ''; applicationSucceeded.value = false; if (open.value) void refresh(); else { generation++; clearTimeout(timer); state.value = null; previewPending.value = false } }, { flush: 'sync', immediate: true })
function adjust(amount: number) {
  if (pending.value) return
  const current = Number(minutes.value)
  minutes.value = Math.max(1, Math.min(180, (Number.isFinite(current) ? Math.round(current) : 10) + amount))
}
const MINUTES_SPEC = singleField(1, 180, 3, String)
const editingMinutes = ref(false)
function setMinutes(value: number | null) { if (!pending.value && value !== null) minutes.value = value }
// OK on the field edits it; Up/Down change it, OK or Back leave it.
function handleWheelCommand(command: string | undefined): boolean {
  const result = fieldWheelCommand(editingMinutes.value ? 0 : null, Number(minutes.value), command, MINUTES_SPEC)
  if (!result.handled) return false
  if (result.value !== null) setMinutes(result.value)
  editingMinutes.value = result.part !== null
  return true
}
defineExpose({ handleWheelCommand })
function wheelMinutes(event: WheelEvent) {
  if (event.ctrlKey || !event.deltaY) return
  event.preventDefault()
  event.stopPropagation()
  adjust(event.deltaY < 0 ? 1 : -1)
}
async function keyboard(event: PointerEvent) {
  event.preventDefault()
  if (await props.api?.trainingOverlayKeyboardEditing?.(true)) {
    if (disposed) { await props.api?.trainingOverlayKeyboardEditing?.(false); return }
    (event.target as HTMLInputElement).focus()
  }
}
async function beginApplication() {
  pending.value = true; error.value = ''; applicationSucceeded.value = false; generation++; clearTimeout(timer)
  previewPending.value = false
  // Commit the pending message before IPC can hide Ctrl+K.
  await nextTick()
}
async function applyPlan(mode: 'auto' | 'minutes', expected: any) {
  const result = await props.api.trainingOverlayApplySetupFuel({ mode, minutes: Number(minutes.value), contextKey: expected.contextKey, totalLitres: expected.totalLitres })
  applicationSucceeded.value = result?.ok === true
  error.value = result?.reason || t('hudSetup.fuel.noOutcome')
  emit('notice', applicationSucceeded.value ? (expected?.totalLitres ? t('hudSetup.fuel.setLitres', { litres: expected.totalLitres }) : t('hudSetup.fuel.set')) : t('hudSetup.fuel.failure', { reason: error.value }),
    applicationSucceeded.value ? 'ok' : 'error')
  // PIP-522: a success message leaves after 5 s; a failure stays until the next action.
  clearTimeout(successTimer)
  if (applicationSucceeded.value) successTimer = setTimeout(() => {
    if (applicationSucceeded.value && !pending.value && !disposed) error.value = ''
  }, SUCCESS_VISIBLE_MS)
}
function finishApplication() {
  pending.value = false
  if (open.value) void refresh()
}
async function applySession() {
  if (pending.value) return
  if (!sessionAllowsAuto.value) { emit('notice', t('hudSetup.fuel.sessionNotice', { reason: sessionReason.value }), 'error'); return }
  await beginApplication()
  try {
    if (disposed) return
    // Obtain a fresh session plan on click; never reuse the custom stint preview.
    const value = await props.api?.trainingOverlayPreviewSetupFuel?.({ mode: 'auto', minutes: Number(minutes.value) })
    if (disposed) return
    if (!value?.available || !value?.plan?.ok) {
      error.value = value?.conflict || value?.unavailableReason || value?.plan?.reason || t('hudSetup.fuel.sessionUnavailable')
      emit('notice', t('hudSetup.fuel.sessionNotice', { reason: error.value }), 'error')
      return
    }
    await applyPlan('auto', value.plan)
  } catch { error.value = t('hudSetup.fuel.interrupted'); emit('notice', t('hudSetup.fuel.failure', { reason: error.value }), 'error') }
  finally { finishApplication() }
}
async function apply() {
  if (!state.value?.available || pending.value || previewPending.value) return
  const expected = plan.value
  await beginApplication()
  try {
    if (disposed) return
    await applyPlan('minutes', expected)
  }
  catch { error.value = t('hudSetup.fuel.interrupted'); emit('notice', t('hudSetup.fuel.failure', { reason: error.value }), 'error') }
  finally { finishApplication() }
}
onBeforeUnmount(() => { disposed = true; generation++; clearTimeout(timer); clearTimeout(successTimer); clearTimeout(sessionTimer); void props.api?.trainingOverlayKeyboardEditing?.(false) })
</script>

<template>
  <section class="fuel-panel" :class="{ 'fuel-panel--editor': editorOnly }">
    <h2 v-if="showHeading && !editorOnly" class="quick-panel-heading">{{ t('hudSetup.fuel.heading') }}</h2>
    <button v-if="!editorOnly" class="fuel-open" type="button" data-overlay-wheel-action="fuel-session" :aria-label="t('hudSetup.fuel.sessionAria')" :aria-busy="pending" :disabled="pending || (!sessionAllowsAuto && !reportUnavailable)" :data-unavailable="!sessionAllowsAuto && reportUnavailable ? '' : undefined" :title="sessionAllowsAuto ? undefined : sessionHint" @click="applySession"><LoaderCircle v-if="pending" class="fuel-pending-spinner" :size="16" aria-hidden="true" /><Fuel v-else :size="22" aria-hidden="true" /><span>{{ t('hudSetup.fuel.session') }}</span></button>
    <Teleport defer :to="statusTarget || 'body'" :disabled="!statusTarget">
      <div v-if="!open && (pending || error)" class="fuel-status" :class="{ 'fuel-status--error': !pending && !applicationSucceeded }" role="status" aria-live="polite"><strong>{{ pending ? t('hudSetup.fuel.statusFuel') : applicationSucceeded ? t('hudSetup.fuel.statusSet') : t('hudSetup.fuel.statusProblem') }}</strong><p>{{ statusMessage }}</p></div>
    </Teleport>
    <button v-if="!editorOnly" class="fuel-open" type="button" data-overlay-wheel-action="fuel" :aria-label="t('hudSetup.fuel.stintAria')" :aria-expanded="open" :disabled="pending" @click="separateView ? emit('open') : open = !open"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 8 3 5l3-2 2 3h10a2 2 0 0 1 2 2v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V10a2 2 0 0 1 1-2Z" /><path d="M10 6V3h7v3M8 11l8 6m0-6-8 6" /></svg><span>{{ t('hudSetup.fuel.byMinutes') }}</span></button>
    <!-- PIP-556: in Control K ACC the editor has the shared ← header. -->
    <ControlKViewHeader v-if="editorOnly && numberField" :title="t('hudSetup.fuel.minutesTitle')" action="fuel-back" @back="!pending && emit('cancel')" />
    <button v-else-if="editorOnly" type="button" class="utility-action overlay-menu-back" data-overlay-wheel-action="fuel-back" :disabled="pending" @click="emit('cancel')">{{ t('hudSetup.fuel.back') }}</button>
    <Teleport defer :to="bodyTarget || 'body'" :disabled="!bodyTarget">
    <div v-if="open" class="fuel-body">
      <strong v-if="!numberField">{{ t('hudSetup.fuel.prepare') }}</strong>
      <ControlKNumberField v-if="numberField" class="fuel-minutes-field" :value="Number(minutes)" :label="t('hudSetup.fuel.minutesField')" action="fuel-minutes"
        :name="t('hudSetup.fuel.minutesName')" :spec="MINUTES_SPEC" suffix=" min" :disabled="pending" :part="editingMinutes ? 0 : null"
        @toggle="editingMinutes = !editingMinutes" @release="editingMinutes = false" @update:value="setMinutes" />
      <div v-else class="fuel-duration" :inert="pending || undefined">
        <button type="button" data-overlay-wheel-action="fuel-minus" :aria-label="t('hudSetup.fuel.minuteLess')" @click="adjust(-1)">−</button>
        <label><input v-model.number="minutes" type="number" min="1" max="180" step="1" :aria-label="t('hudSetup.fuel.minutesName')" :disabled="pending" @wheel="wheelMinutes" @pointerdown="keyboard" @keydown.stop @blur="api?.trainingOverlayKeyboardEditing?.(false)"> min</label>
        <button type="button" data-overlay-wheel-action="fuel-plus" :aria-label="t('hudSetup.fuel.minuteMore')" @click="adjust(1)">+</button>
      </div>
      <!-- PIP-526: common stint lengths in one press from the wheel. -->
      <div class="fuel-presets" role="group" :aria-label="t('hudSetup.fuel.presetsAria')" :inert="pending || undefined">
        <button v-for="value in [10, 20, 30, 45]" :key="value" type="button" :data-overlay-wheel-action="`fuel-preset-${value}`"
          :aria-pressed="Number(minutes) === value" :disabled="pending" @click="minutes = value">{{ value }} min</button>
      </div>
      <p v-if="numberField && editingMinutes" class="ck-editor__hint">{{ t('hudSetup.fuel.editingHint') }}</p>
      <button class="fuel-apply" type="button" data-overlay-wheel-action="fuel-apply" :aria-busy="pending" :aria-label="pending ? t('hudSetup.fuel.applyingAria') : undefined" :disabled="!state?.available || pending || previewPending" @click="apply"><template v-if="pending">{{ t('hudSetup.fuel.applying') }}<span class="fuel-pending-dots" aria-hidden="true"><span>.</span><span>.</span><span>.</span></span></template><template v-else>{{ plan?.ok ? t('hudSetup.fuel.applyLitres', { litres: plan.totalLitres }) : t('hudSetup.fuel.apply') }}</template></button>
      <div v-if="minutesProblem" class="fuel-status" role="status" aria-live="polite"><strong>{{ t('hudSetup.fuel.statusProblem') }}</strong><p>{{ minutesProblem }}</p></div>
    </div>
    </Teleport>
  </section>
</template>

<style scoped>
.fuel-pending-spinner{animation:fuel-pending-spin 1.2s linear infinite}
.fuel-pending-dots span{animation:fuel-pending-dot 1.2s steps(1,end) infinite}
.fuel-pending-dots span:nth-child(2){animation-delay:.2s}.fuel-pending-dots span:nth-child(3){animation-delay:.4s}
@keyframes fuel-pending-spin{to{transform:rotate(360deg)}}
@keyframes fuel-pending-dot{0%,20%{opacity:0}40%,100%{opacity:1}}
@media(prefers-reduced-motion:reduce){.fuel-pending-spinner,.fuel-pending-dots span{animation:none}}
.fuel-status{padding:10px;border:1px solid #6d604b;border-radius:8px;background:#24211c}.fuel-status strong{display:block;margin-bottom:4px}.fuel-panel{width:100%;text-align:left;display:grid;gap:8px}.fuel-open,.fuel-apply{width:100%;min-height:34px;border:1px solid #805126;border-radius:8px;background:#252019;color:#fff;font-weight:800}.fuel-body{padding:12px;border:1px solid #48423b;border-radius:10px;background:#131819;display:grid;gap:10px;font-size:12px;color:#d9e1e5}.fuel-body p{margin:0;line-height:1.4}.fuel-modes,.fuel-duration{display:flex;gap:8px;align-items:center}.fuel-presets{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}.fuel-presets button{background:#222b30;color:white;border:1px solid #526069;border-radius:6px;font-size:11px}.fuel-presets button[aria-pressed=true]{border-color:#ff9638;color:#ffae62}.fuel-body button{cursor:pointer;min-height:32px}.fuel-modes button,.fuel-duration button{background:#222b30;color:white;border:1px solid #526069;border-radius:6px;padding:5px 10px}.fuel-modes button[aria-pressed=true]{border-color:#ff9638;color:#ffae62}.fuel-duration input{width:62px;font-size:22px;text-align:center;color:white;background:#101516;border:1px solid #526069;border-radius:6px}.fuel-total{font-size:30px;font-weight:900}.fuel-total small{font-size:13px}.fuel-apply{background:#ff9638;color:#111}.fuel-open:disabled,.fuel-apply:disabled{opacity:.45;cursor:default}.fuel-body summary{cursor:pointer;color:#aeb9c0}.fuel-hint{margin:-4px 0 0;font-size:11px;color:#aeb9c0}.fuel-source{color:#aeb9c0}button:focus-visible,input:focus-visible{outline:2px solid #ffb257;outline-offset:2px}
</style>
