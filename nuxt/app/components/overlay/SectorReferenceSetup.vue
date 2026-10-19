<script setup lang="ts">
import { hudSourcePolicy } from '~/services/sim/hudSourceAdapter'

import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useFastStatePoller } from '~/composables/useFastStatePoller'
import type { HudOverlaySettings } from '~/composables/useHudOverlay'
import { MAX_SECTOR_MS, MIN_SECTOR_MS, adjustSectorReferenceField, adjustSectorReferenceTime, formatSectorReferenceTime, parseSectorReferenceTime,
  resolveCustomSectorTimes, sectorReferenceContextKey, splitSectorReferenceTime, type SectorReferenceField } from '~/utils/customSectorReferences'
import type { NumberFieldLimits } from '~/utils/controlKNumberField'
import ControlKNumberField from '~/components/overlay/ControlKNumberField.vue'
import { normalizeSectorDeltaReference, type SectorDeltaReference } from '~/utils/sectorDeltaPresentation'

const props = withDefaults(defineProps<{ keyboardOverlay?: boolean }>(), { keyboardOverlay: false })
const emit = defineEmits<{ saved: [settings: HudOverlaySettings], cancel: [] }>()
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
const modes: { id: SectorDeltaReference, label: string }[] = [
  { id: 'bestSector', label: 'Miglior settore' }, { id: 'custom', label: 'Personalizzati' },
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
function bestSectorDraft(): string[] | null {
  const sectors = fastState.value.sectorHud?.sectors ?? []
  const count = boundContext.value?.sectorCount ?? 3
  const bests = Array.from({ length: count }, (_, index) => sectors[index]?.bestMs ?? null)
  return bests.every(ms => typeof ms === 'number' && ms > 0) ? bests.map(ms => formatSectorTime(ms!)) : null
}
const bestAvailable = computed(() => !!bestSectorDraft())
function useBestSectors() { const best = bestSectorDraft(); if (best) draft.value = best }
// PIP-556: wheel editing per field. OK on the seconds or the tenths of a
// sector edits only that field; Up/Down change it (holding repeats), OK/Back leave.
const editing = ref<{ index: number, field: SectorReferenceField } | null>(null)
const fields: { id: SectorReferenceField, label: string }[] = [{ id: 'seconds', label: 'SEC' }, { id: 'tenths', label: 'DEC' }]
function toggleEditing(index: number, field: SectorReferenceField) {
  editing.value = editing.value?.index === index && editing.value.field === field ? null : { index, field }
}
// Shared number field (wheel, mouse scroll, typed digits): seconds 10..240, tenths 0..9.
const FIELD_LIMITS: Record<SectorReferenceField, NumberFieldLimits> = {
  seconds: { min: MIN_SECTOR_MS / 1000, max: MAX_SECTOR_MS / 1000, digits: 3, wrap: false },
  tenths: { min: 0, max: 9, digits: 1, wrap: true },
}
function fieldNumber(index: number, field: SectorReferenceField): number | null {
  const parts = splitSectorReferenceTime(draft.value[index] ?? '')
  return parts ? parts[field] : null
}
function setField(index: number, field: SectorReferenceField, value: number) {
  const parts = splitSectorReferenceTime(draft.value[index] ?? '') ?? { seconds: MIN_SECTOR_MS / 1000, tenths: 0 }
  const next = { ...parts, [field]: value }
  const ms = Math.min(MAX_SECTOR_MS, Math.max(MIN_SECTOR_MS, next.seconds * 1000 + next.tenths * 100))
  draft.value[index] = formatSectorReferenceTime(ms)
}
function handleWheelCommand(command: string | undefined): boolean {
  if (!props.keyboardOverlay || editing.value === null) return false
  if (command === 'activate-action' || command === 'primary' || command === 'back') { editing.value = null; return true }
  if (command !== 'next-action' && command !== 'previous-action') return false
  const { index, field } = editing.value
  draft.value[index] = adjustSectorReferenceField(draft.value[index]!, field, command === 'next-action' ? 1 : -1)
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
  } catch { error.value = 'Tastiera non disponibile. Usa i pulsanti o apri questo pannello dalla pagina HUD.' }
}
async function submit() {
  if (!loaded.value || !valid.value || saving.value) return
  error.value = ''; saving.value = true
  try {
    const api = getApi()
    if (!api?.hudOverlaySaveSettings) throw new Error('Collegamento al programma non disponibile.')
    const next = await api.hudOverlaySaveSettings('sectors', {
      deltaReference: mode.value,
      ...(mode.value === 'custom' ? { customSectorReference: { ...boundContext.value, timesMs: parsed.value } } : {}),
    })
    if (!next || next.deltaReference !== mode.value) throw new Error('Salvataggio non riuscito. Riprova.')
    if (!disposed) emit('saved', next)
  } catch (cause) { if (!disposed) error.value = cause instanceof Error ? cause.message : 'Salvataggio non riuscito.' }
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
    if (!results[0]) throw new Error('Impostazioni non disponibili. Riapri il pannello.')
    settings.value = results[0]; mode.value = normalizeSectorDeltaReference(results[0].deltaReference); loaded.value = true
  } catch (cause) { if (!disposed) error.value = cause instanceof Error ? cause.message : 'Caricamento non riuscito.' }
})
onBeforeUnmount(() => {
  disposed = true; stopFastStatePolling()
  if (props.keyboardOverlay) void getApi()?.trainingOverlayKeyboardEditing?.(false)?.catch(() => {})
})
</script>

<template>
  <section class="sector-reference-setup" :class="{ 'sector-reference-setup--quick': keyboardOverlay }" data-overlay-interactive aria-label="Riferimenti settori" @keydown="onKey">
    <header><span v-if="!keyboardOverlay">SETTORI</span><h2>Riferimenti settori</h2><p>{{ boundContext ? `${boundContext.track} · ${boundContext.car}${boundContext.variant ? ` · ${boundContext.variant}` : ''}` : 'Avvia il gioco e seleziona pista e vettura.' }}</p></header>
    <div class="sector-reference-modes" role="group" aria-label="Confronta con">
      <button v-for="item in modes" :key="item.id" type="button" :data-overlay-wheel-action="`sector-mode-${item.id}`" :aria-pressed="mode === item.id" :disabled="saving" @click="mode = item.id">{{ item.label }}</button>
    </div>
    <template v-if="mode === 'custom'">
      <p v-if="!keyboardOverlay" class="sector-reference-help">Da 10,0 secondi a 4:00,0 per settore.</p>
      <div class="sector-reference-drums" :style="{ gridTemplateColumns: `repeat(${Math.min(draft.length, 4)},minmax(0,1fr))` }">
        <article v-for="(_, index) in draft" :key="index" class="sector-reference-drum" @wheel.prevent="!saving && boundKey && !contextChanged && $event.deltaY !== 0 && adjust(index, $event.deltaY < 0 ? 1 : -1)">
          <label :for="`sector-reference-${index}`">S{{ index + 1 }}</label>
          <div v-if="keyboardOverlay" class="sector-reference-fields">
            <ControlKNumberField v-for="field in fields" :key="field.id" :value="fieldNumber(index, field.id)"
              :label="field.label" :action="`sector-${index}-${field.id}`" :name="`S${index + 1} ${field.id === 'seconds' ? 'secondi' : 'decimi'}`"
              v-bind="FIELD_LIMITS[field.id]" :prefix="field.id === 'tenths' ? ',' : ''" :format="field.id === 'seconds' ? String : undefined"
              :editing="editing?.index === index && editing.field === field.id" :disabled="saving || !boundKey || contextChanged"
              @toggle="toggleEditing(index, field.id)" @update:value="setField(index, field.id, $event)" />
          </div>
          <div v-if="!keyboardOverlay" class="sector-reference-arrows">
            <button v-for="step in [10, 1]" :key="step" type="button" :disabled="saving || !boundKey || contextChanged" :data-overlay-wheel-action="`sector-${index}-plus-${step}`" :aria-label="`Aumenta S${index + 1} di ${step === 10 ? 'un secondo' : 'un decimo'}`" @click="adjust(index, step)">▲<small>{{ step === 10 ? '1 s' : '0,1 s' }}</small></button>
          </div>
          <input v-if="!keyboardOverlay" :id="`sector-reference-${index}`" v-model="draft[index]" type="text" inputmode="decimal" maxlength="5" placeholder="—" :disabled="saving || !boundKey || contextChanged" :aria-invalid="draft[index] !== '' && parsed[index] === null" :aria-label="`Tempo S${index + 1} in secondi`" @pointerdown="requestKeyboard" />
          <div v-if="!keyboardOverlay" class="sector-reference-arrows">
            <button v-for="step in [10, 1]" :key="step" type="button" :disabled="saving || !boundKey || contextChanged" :data-overlay-wheel-action="`sector-${index}-minus-${step}`" :aria-label="`Riduci S${index + 1} di ${step === 10 ? 'un secondo' : 'un decimo'}`" @click="adjust(index, -step)">▼<small>{{ step === 10 ? '1 s' : '0,1 s' }}</small></button>
          </div>
        </article>
      </div>
      <p class="sector-reference-help">Totale: <strong>{{ total }} s</strong><span v-if="!keyboardOverlay"> · Il target giro resta indipendente.</span>
        <span v-else> · {{ editing ? 'Su/Giù cambia solo questo campo · OK fatto' : 'OK su secondi o decimi per cambiarli' }}</span></p>
      <p v-if="contextChanged" role="alert">Gioco, pista, variante o vettura cambiati. Chiudi e riapri il pannello.</p>
      <p v-else-if="draft.some(value => value !== '') && !valid" role="status">Inserisci tutti i tempi, con al massimo un decimale.</p>
    </template>
    <p v-if="error" role="alert">{{ error }}</p>
    <footer><button v-if="keyboardOverlay && mode === 'custom' && bestAvailable" type="button" class="sector-reference-best" data-overlay-wheel-action="sector-use-best" :disabled="saving || !boundKey || contextChanged" @click="useBestSectors">Usa i migliori</button><button type="button" class="sector-reference-save" data-overlay-wheel-action="sector-save" :disabled="!loaded || !valid || saving" @click="submit">{{ saving ? 'Salvataggio…' : 'Salva e usa' }}</button><button type="button" data-overlay-wheel-action="sector-cancel" :disabled="saving" @click="emit('cancel')">Annulla</button></footer>
  </section>
</template>

<style scoped>
.sector-reference-setup{display:grid;gap:12px;width:100%;box-sizing:border-box;padding:18px;border:1px solid #ffffff20;border-radius:22px;background:linear-gradient(145deg,#1e252a,#0f1317);color:#f8fafc;font-family:Inter,system-ui,sans-serif}
header span{color:#fb923c;font-size:11px;font-weight:900;letter-spacing:.12em}h2{font-size:24px;margin:5px 0}p{margin:0;font-size:12px;color:#aeb4bd}header p{overflow-wrap:anywhere}
button,input{font:inherit;box-sizing:border-box}button{cursor:pointer;color:inherit;border:1px solid #ffffff24;background:#ffffff04;border-radius:9px;font-weight:800}button:disabled{opacity:.4;cursor:default}button:hover:not(:disabled),button[data-overlay-selected],button:focus-visible,input:focus{outline:2px solid #fb923c;outline-offset:1px}
.sector-reference-modes{display:flex;gap:6px}.sector-reference-modes button{flex:1;padding:10px 5px;font-size:11px}.sector-reference-modes button[aria-pressed=true]{background:#fb923c30;border-color:#fb923c;color:#ffb46b}
.sector-reference-drums{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.sector-reference-drum{border:1px solid #ffffff20;border-radius:14px;background:#ffffff03;padding:10px 7px;text-align:center}.sector-reference-drum label{font-size:12px;color:#aeb4bd;font-weight:900}.sector-reference-drum input{display:block;width:100%;min-width:0;border:0;border-radius:4px;color:#fff;background:transparent;text-align:center;font-size:29px;font-weight:900;font-variant-numeric:tabular-nums;padding:7px 0}.sector-reference-drum input[aria-invalid=true]{outline:2px solid #f97316}.sector-reference-arrows{display:flex;gap:5px;margin:6px 0}.sector-reference-arrows button{flex:1;padding:4px 0;font-size:11px}.sector-reference-arrows small{display:block;font-size:9px;color:#aeb4bd}
footer{display:flex;gap:8px}footer button{padding:12px 10px;font-size:12px}.sector-reference-save{flex:1;background:#ff9136;color:#101010;border-color:#ff9136}[role=alert]{color:#ffb46b}

/* PIP-556: compact Ctrl+K frame. Title and comparison mode share the first row,
   each sector shows SEC and DEC side by side, actions on one row. */
.sector-reference-setup--quick { padding:0;gap:6px;border:0;border-radius:0;background:#0b0b0b;grid-template-columns:minmax(0,1fr) auto; }
.sector-reference-setup--quick > * { grid-column:1 / -1; }
.sector-reference-setup--quick > header { grid-column:1;min-width:0; }
.sector-reference-setup--quick > .sector-reference-modes { grid-column:2;align-self:center; }
.sector-reference-setup--quick h2 { font-size:14px;font-weight:600;margin:0; }
.sector-reference-setup--quick header p { font-size:10px;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis; }
.sector-reference-setup--quick .sector-reference-fields { display:grid;grid-template-columns:minmax(0,3fr) minmax(0,2fr);gap:3px; }
.sector-reference-setup--quick .sector-reference-value--tenths { color:#d0d0d0; }
.sector-reference-setup--quick footer { display:flex;gap:4px; }
.sector-reference-setup--quick footer button { flex:1 1 0; }
.sector-reference-setup--quick button { border-radius:0;font-weight:500; }
.sector-reference-setup--quick button:hover:not(:disabled) { outline:none;background:#ffffff12; }
.sector-reference-setup--quick button[data-overlay-selected],
.sector-reference-setup--quick button:focus-visible,
.sector-reference-setup--quick input:focus { outline:1px solid #fff;outline-offset:-2px; }
.sector-reference-setup--quick .sector-reference-modes button { padding:4px 8px;min-height:28px;font-size:11px; }
.sector-reference-setup--quick .sector-reference-modes button[aria-pressed=true] { color:#fff;border-color:#ffffff70;background:#ffffff12;box-shadow:inset 0 -2px #ff0024; }
.sector-reference-setup--quick .sector-reference-help { font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis; }
.sector-reference-setup--quick .sector-reference-value { display:block;width:100%;margin-top:3px;padding:4px 0;border:1px solid #ffffff30;background:transparent;font-size:20px;font-weight:600;font-variant-numeric:tabular-nums; }
.sector-reference-setup--quick .sector-reference-value.is-editing { outline:2px solid #00e5ff;outline-offset:2px;background:#00e5ff18; }
.sector-reference-setup--quick .sector-reference-best { min-height:32px;font-size:11px; }
.sector-reference-setup--quick .sector-reference-drum { border-radius:0;padding:6px 4px; }
.sector-reference-setup--quick .sector-reference-drum label { font-size:10px;font-weight:600; }
.sector-reference-setup--quick .sector-reference-drum input { border-radius:0;font-size:22px;font-weight:600;padding:4px 0; }
.sector-reference-setup--quick .sector-reference-arrows { gap:4px;margin:4px 0; }
.sector-reference-setup--quick .sector-reference-arrows button { padding:3px 0; }
.sector-reference-setup--quick footer button { padding:6px;min-height:30px;font-size:11px; }
.sector-reference-setup--quick .sector-reference-save { color:#fff;border:1px solid #ff002480;background:#ff00241a; }
.sector-reference-setup--quick .sector-reference-save:hover:not(:disabled) { background:#ff002430; }

</style>
