<script setup lang="ts">
import { hudSourcePolicy } from '~/services/sim/hudSourceAdapter'

import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useFastStatePoller } from '~/composables/useFastStatePoller'
import type { HudOverlaySettings } from '~/composables/useHudOverlay'
import { MAX_SECTOR_MS, MIN_SECTOR_MS, adjustSectorReferenceTime, formatSectorReferenceTime, parseSectorReferenceTime,
  resolveCustomSectorTimes, sectorReferenceContextKey } from '~/utils/customSectorReferences'
import { fieldStartPart, fieldWheelCommand, type NumberFieldSpec } from '~/utils/controlKNumberField'
import ControlKNumberField from '~/components/overlay/ControlKNumberField.vue'
import ControlKViewHeader from '~/components/overlay/ControlKViewHeader.vue'
import { normalizeSectorDeltaReference, type SectorDeltaReference } from '~/utils/sectorDeltaPresentation'
import { useI18n, type TranslationKey } from '~/i18n'

const props = withDefaults(defineProps<{ keyboardOverlay?: boolean }>(), { keyboardOverlay: false })
const emit = defineEmits<{ saved: [settings: HudOverlaySettings], cancel: [] }>()
const { t } = useI18n()
function getApi(): any { return typeof window === 'undefined' ? null : (window as any).electronAPI }
const { fastState, startFastStatePolling, stopFastStatePolling } = useFastStatePoller(getApi)
const settings = ref<HudOverlaySettings | null>(null)
const loaded = ref(false), saving = ref(false), error = ref('')
const mode = ref<SectorDeltaReference>('custom')
const draft = ref(['', '', ''])
const boundContext = ref<{ track: string, car: string, gameId?: string, variant?: string | null, sectorCount?: number } | null>(null)
const liveContext = computed(() => {
  const state = fastState.value, context = state.context
  if (!state.isFresh || state.dataSource === 'focused' || !context) return null
  const sectorCount = hudSourcePolicy(state).sectorCount
  return sectorCount ? { ...context, sectorCount } : null
})
const contextKey = computed(() => sectorReferenceContextKey(liveContext.value))
const boundKey = computed(() => sectorReferenceContextKey(boundContext.value))
const contextChanged = computed(() => boundKey.value !== null && boundKey.value !== contextKey.value)
const parsed = computed(() => draft.value.map(parseSectorReferenceTime))
const valid = computed(() => mode.value !== 'custom' || !!boundKey.value && !contextChanged.value && parsed.value.every(ms => ms !== null))
const total = computed(() => parsed.value.every(ms => ms !== null) ? (parsed.value.reduce<number>((sum, ms) => sum + (ms || 0), 0) / 1000).toFixed(1).replace('.', ',') : '—')
const modes: { id: SectorDeltaReference, labelKey: TranslationKey }[] = [
  { id: 'bestSector', labelKey: 'hudSetup.sectors.modeBest' }, { id: 'custom', labelKey: 'hudSetup.sectors.modeCustom' },
]
let disposed = false
function bindContext() {
  if (!loaded.value || boundKey.value || !contextKey.value) return
  const context = liveContext.value!
  boundContext.value = { track: context.track!, car: context.car!,
    ...(context.gameId ? { gameId: context.gameId } : {}),
    ...(context.variant != null ? { variant: context.variant } : {}),
    ...('sectorCount' in context ? { sectorCount: context.sectorCount as number } : {}) }
  const times = resolveCustomSectorTimes(settings.value?.customSectorReferences, context)
  // PIP-526: nothing saved yet -> start from the best sectors, so a few presses do.
  draft.value = times ? times.map(formatSectorTime) : bestSectorDraft() ?? Array(boundContext.value.sectorCount ?? 3).fill('')
}
const formatSectorTime = formatSectorReferenceTime
const contextLine = computed(() => boundContext.value
  ? `${boundContext.value.track} · ${boundContext.value.car}${boundContext.value.variant ? ` · ${boundContext.value.variant}` : ''}`
  : t('hudSetup.sectors.noContext'))
function bestSectorDraft(): string[] | null {
  const sectors = fastState.value.sectorHud?.sectors ?? []
  const count = boundContext.value?.sectorCount ?? 3
  const bests = Array.from({ length: count }, (_, index) => sectors[index]?.bestMs ?? null)
  return bests.every(ms => typeof ms === 'number' && ms > 0) ? bests.map(ms => formatSectorTime(ms!)) : null
}
const bestAvailable = computed(() => !!bestSectorDraft())
function useBestSectors() { const best = bestSectorDraft(); if (best) draft.value = best }
// PIP-611: one field per sector (37,0 in tenths). Typed digits enter from the
// right (3 7 0 = 37,0); from the wheel OK engages the seconds, Up/Down change
// them, OK moves to the tenths, then leaves. Limits 10,0 s .. 4:00,0.
const SECTOR_SPEC: NumberFieldSpec = {
  parts: [
    { label: 'SEC', min: MIN_SECTOR_MS / 1000, max: MAX_SECTOR_MS / 1000, wrap: false, digits: 3, unit: 10 },
    { label: 'DEC', min: 0, max: 9, wrap: true, digits: 1, unit: 1, separator: ',' },
  ],
  min: MIN_SECTOR_MS / 100, max: MAX_SECTOR_MS / 100,
}
const editing = ref<{ index: number, part: number } | null>(null)
function toggleEditing(index: number) {
  editing.value = editing.value?.index === index ? null : { index, part: fieldStartPart(SECTOR_SPEC) }
}
function fieldTenths(index: number): number | null {
  const ms = parseSectorReferenceTime(draft.value[index] ?? '')
  return ms === null ? null : ms / 100
}
// null: Esc brought back a sector that was empty.
function setField(index: number, tenths: number | null) { draft.value[index] = tenths === null ? '' : formatSectorReferenceTime(tenths * 100) }
function handleWheelCommand(command: string | undefined): boolean {
  if (!props.keyboardOverlay || editing.value === null) return false
  const { index } = editing.value
  const result = fieldWheelCommand(editing.value.part, fieldTenths(index), command, SECTOR_SPEC)
  if (!result.handled) return false
  if (result.value !== null) setField(index, result.value)
  editing.value = result.part === null ? null : { index, part: result.part }
  return true
}
watch([contextKey, loaded], bindContext)
function adjust(index: number, amount: number) { draft.value[index] = adjustSectorReferenceTime(draft.value[index]!, amount) }
async function requestKeyboard(event: PointerEvent) {
  if (!props.keyboardOverlay) return
  const input = event.target as HTMLInputElement
  event.preventDefault()
  try {
    if (!await getApi()?.trainingOverlayKeyboardEditing?.(true)) throw new Error('keyboard unavailable')
    {
      if (disposed) { await getApi()?.trainingOverlayKeyboardEditing?.(false); return }
      input.focus(); input.select()
    }
  } catch { error.value = t('hudSetup.sectors.keyboardUnavailable') }
}
async function submit() {
  if (!loaded.value || !valid.value || saving.value) return
  error.value = ''; saving.value = true
  try {
    const api = getApi()
    if (!api?.hudOverlaySaveSettings) throw new Error(t('hudSetup.sectors.linkUnavailable'))
    const next = await api.hudOverlaySaveSettings('sectors', {
      deltaReference: mode.value,
      ...(mode.value === 'custom' ? { customSectorReference: { ...boundContext.value, timesMs: parsed.value } } : {}),
    })
    if (!next || next.deltaReference !== mode.value) throw new Error(t('hudSetup.sectors.saveFailedRetry'))
    if (!disposed) emit('saved', next)
  } catch (cause) { if (!disposed) error.value = cause instanceof Error ? cause.message : t('hudSetup.sectors.saveFailed') }
  finally { saving.value = false }
}
function onKey(event: KeyboardEvent) {
  if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); void submit() }
  if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); if (!saving.value) emit('cancel') }
}
defineExpose({ submit, handleWheelCommand })
onMounted(async () => {
  try {
    const results = await Promise.all([getApi()?.hudOverlayGetSettings?.('sectors'), startFastStatePolling()])
    if (disposed) return
    if (!results[0]) throw new Error(t('hudSetup.sectors.settingsUnavailable'))
    settings.value = results[0]; mode.value = normalizeSectorDeltaReference(results[0].deltaReference); loaded.value = true
  } catch (cause) { if (!disposed) error.value = cause instanceof Error ? cause.message : t('hudSetup.sectors.loadFailed') }
})
onBeforeUnmount(() => {
  disposed = true; stopFastStatePolling()
  if (props.keyboardOverlay) void getApi()?.trainingOverlayKeyboardEditing?.(false)?.catch(() => {})
})
</script>

<template>
  <section class="sector-reference-setup" :class="{ 'sector-reference-setup--quick': keyboardOverlay }" data-overlay-interactive :aria-label="t('hudSetup.sectors.aria')" @keydown="onKey">
    <!-- PIP-556: Control K editor structure: ← header, choices, fields, hint, one primary action. -->
    <template v-if="keyboardOverlay">
      <ControlKViewHeader :title="t('hudSetup.sectors.quickTitle')" :subtitle="contextLine" action="sector-cancel" @back="!saving && emit('cancel')" />
      <div class="ck-editor__shortcuts" role="group" :aria-label="t('hudSetup.sectors.compareWith')">
        <button v-for="item in modes" :key="item.id" type="button" :data-overlay-wheel-action="`sector-mode-${item.id}`" :aria-pressed="mode === item.id" :disabled="saving" @click="mode = item.id">{{ t(item.labelKey) }}</button>
        <button v-if="mode === 'custom' && bestAvailable" type="button" data-overlay-wheel-action="sector-use-best" :disabled="saving || !boundKey || contextChanged" @click="useBestSectors">{{ t('hudSetup.sectors.useBest') }}</button>
      </div>
      <template v-if="mode === 'custom'">
        <div class="ck-editor__fields ck-sector-fields">
          <ControlKNumberField v-for="(_, index) in draft" :key="index" class="ck-field--sector" :value="fieldTenths(index)" :spec="SECTOR_SPEC"
            :label="`S${index + 1}`" :action="`sector-${index}`" :name="t('hudSetup.sectors.sectorName', { n: index + 1 })" suffix=" s"
            :part="editing?.index === index ? editing.part : null" :disabled="saving || !boundKey || contextChanged"
            @toggle="toggleEditing(index)" @release="editing = null" @update:value="setField(index, $event)" />
        </div>
        <p class="ck-editor__hint">{{ t('hudSetup.sectors.totalSeconds', { total }) }}<template v-if="editing"> · {{ t('hudSetup.sectors.editingHint', { part: SECTOR_SPEC.parts[editing.part]!.label }) }}</template></p>
        <p v-if="contextChanged" class="ck-editor__alert" role="alert">{{ t('hudSetup.sectors.changedGoBack') }}</p>
        <p v-else-if="draft.some(value => value !== '') && !valid" class="ck-editor__alert" role="status">{{ t('hudSetup.sectors.fillAllRange') }}</p>
      </template>
      <p v-else class="ck-editor__hint">{{ t('hudSetup.sectors.bestHint') }}</p>
      <p v-if="error" class="ck-editor__alert" role="alert">{{ error }}</p>
      <div class="ck-editor__actions">
        <button type="button" class="ck-editor__primary" data-overlay-wheel-action="sector-save" :disabled="!loaded || !valid || saving" @click="submit">{{ saving ? t('hudSetup.sectors.saving') : t('hudSetup.sectors.saveAndUse') }}</button>
      </div>
    </template>
    <template v-else>
    <header><span>{{ t('hudSetup.sectors.kicker') }}</span><h2>{{ t('hudSetup.sectors.title') }}</h2><p>{{ contextLine }}</p></header>
    <div class="sector-reference-modes" role="group" :aria-label="t('hudSetup.sectors.compareWith')">
      <button v-for="item in modes" :key="item.id" type="button" :data-overlay-wheel-action="`sector-mode-${item.id}`" :aria-pressed="mode === item.id" :disabled="saving" @click="mode = item.id">{{ t(item.labelKey) }}</button>
    </div>
    <template v-if="mode === 'custom'">
      <p v-if="!keyboardOverlay" class="sector-reference-help">{{ t('hudSetup.sectors.rangeHelp') }}</p>
      <div class="sector-reference-drums" :style="{ gridTemplateColumns: `repeat(${Math.min(draft.length, 4)},minmax(0,1fr))` }">
        <article v-for="(_, index) in draft" :key="index" class="sector-reference-drum" @wheel.prevent="!saving && boundKey && !contextChanged && $event.deltaY !== 0 && adjust(index, $event.deltaY < 0 ? 1 : -1)">
          <label :for="`sector-reference-${index}`">S{{ index + 1 }}</label>
          <div class="sector-reference-arrows">
            <button v-for="step in [10, 1]" :key="step" type="button" :disabled="saving || !boundKey || contextChanged" :data-overlay-wheel-action="`sector-${index}-plus-${step}`" :aria-label="t(step === 10 ? 'hudSetup.sectors.increaseSecond' : 'hudSetup.sectors.increaseTenth', { n: index + 1 })" @click="adjust(index, step)">▲<small>{{ step === 10 ? '1 s' : '0,1 s' }}</small></button>
          </div>
          <input v-if="!keyboardOverlay" :id="`sector-reference-${index}`" v-model="draft[index]" type="text" inputmode="decimal" maxlength="5" placeholder="—" :disabled="saving || !boundKey || contextChanged" :aria-invalid="draft[index] !== '' && parsed[index] === null" :aria-label="t('hudSetup.sectors.timeAria', { n: index + 1 })" @pointerdown="requestKeyboard" />
          <div v-if="!keyboardOverlay" class="sector-reference-arrows">
            <button v-for="step in [10, 1]" :key="step" type="button" :disabled="saving || !boundKey || contextChanged" :data-overlay-wheel-action="`sector-${index}-minus-${step}`" :aria-label="t(step === 10 ? 'hudSetup.sectors.decreaseSecond' : 'hudSetup.sectors.decreaseTenth', { n: index + 1 })" @click="adjust(index, -step)">▼<small>{{ step === 10 ? '1 s' : '0,1 s' }}</small></button>
          </div>
        </article>
      </div>
      <p class="sector-reference-help">{{ t('hudSetup.sectors.total') }} <strong>{{ total }} s</strong><span v-if="!keyboardOverlay"> · {{ t('hudSetup.sectors.targetIndependent') }}</span>
        <span v-else> · {{ editing ? t('hudSetup.sectors.fieldEditing') : t('hudSetup.sectors.fieldIdle') }}</span></p>
      <p v-if="contextChanged" role="alert">{{ t('hudSetup.sectors.changedReopen') }}</p>
      <p v-else-if="draft.some(value => value !== '') && !valid" role="status">{{ t('hudSetup.sectors.fillAllDecimal') }}</p>
    </template>
    <p v-if="error" role="alert">{{ error }}</p>
    <footer><button type="button" class="sector-reference-save" data-overlay-wheel-action="sector-save" :disabled="!loaded || !valid || saving" @click="submit">{{ saving ? t('hudSetup.sectors.saving') : t('hudSetup.sectors.saveAndUse') }}</button><button type="button" data-overlay-wheel-action="sector-cancel" :disabled="saving" @click="emit('cancel')">{{ t('common.cancel') }}</button></footer>
    </template>
  </section>
</template>

<style scoped>
.sector-reference-setup{display:grid;gap:12px;width:100%;box-sizing:border-box;padding:18px;border:1px solid #ffffff20;border-radius:22px;background:linear-gradient(145deg,#1e252a,#0f1317);color:#f8fafc;font-family:Inter,system-ui,sans-serif}
header span{color:#fb923c;font-size:11px;font-weight:900;letter-spacing:.12em}h2{font-size:24px;margin:5px 0}p{margin:0;font-size:12px;color:#aeb4bd}header p{overflow-wrap:anywhere}
button,input{font:inherit;box-sizing:border-box}button{cursor:pointer;color:inherit;border:1px solid #ffffff24;background:#ffffff04;border-radius:9px;font-weight:800}button:disabled{opacity:.4;cursor:default}button:hover:not(:disabled),button[data-overlay-selected],button:focus-visible,input:focus{outline:2px solid #fb923c;outline-offset:1px}
.sector-reference-modes{display:flex;gap:6px}.sector-reference-modes button{flex:1;padding:10px 5px;font-size:11px}.sector-reference-modes button[aria-pressed=true]{background:#fb923c30;border-color:#fb923c;color:#ffb46b}
.sector-reference-drums{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.sector-reference-drum{border:1px solid #ffffff20;border-radius:14px;background:#ffffff03;padding:10px 7px;text-align:center}.sector-reference-drum label{font-size:12px;color:#aeb4bd;font-weight:900}.sector-reference-drum input{display:block;width:100%;min-width:0;border:0;border-radius:4px;color:#fff;background:transparent;text-align:center;font-size:29px;font-weight:900;font-variant-numeric:tabular-nums;padding:7px 0}.sector-reference-drum input[aria-invalid=true]{outline:2px solid #f97316}.sector-reference-arrows{display:flex;gap:5px;margin:6px 0}.sector-reference-arrows button{flex:1;padding:4px 0;font-size:11px}.sector-reference-arrows small{display:block;font-size:9px;color:#aeb4bd}
footer{display:flex;gap:8px}footer button{padding:12px 10px;font-size:12px}.sector-reference-save{flex:1;background:#ff9136;color:#101010;border-color:#ff9136}[role=alert]{color:#ffb46b}

/* PIP-556: Ctrl+K uses the shared editor structure (.ck-editor__* in _training-overlay.scss);
   only the reset of this component's own button look stays here. */
.sector-reference-setup--quick { padding:0;gap:10px;border:0;border-radius:0;background:#0b0b0b; }
.sector-reference-setup--quick button { border-radius:0;font-weight:500; }
.sector-reference-setup--quick button:hover:not(:disabled) { outline:none; }
.sector-reference-setup--quick button[data-overlay-selected],
.sector-reference-setup--quick button:focus-visible { outline:2px solid #ffff00;outline-offset:1px; }

</style>
