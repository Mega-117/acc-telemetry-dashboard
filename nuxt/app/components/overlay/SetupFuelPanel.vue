<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
const props = defineProps<{ api: any }>()
const open = ref(false), minutes = ref(10), pending = ref(false), error = ref('')
const state = ref<any>(null)
const previewPending = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined
let generation = 0
let disposed = false
const plan = computed(() => state.value?.plan)
const statusMessage = computed(() => pending.value ? 'Applicazione in corso…'
  : error.value || state.value?.conflict || state.value?.unavailableReason
  || (plan.value && !plan.value.ok ? plan.value.reason : '')
  || state.value?.result?.reason || (state.value?.available ? 'Pronto: premi Applica dal menu Pausa; la schermata verrà verificata.' : 'Verifica delle condizioni…'))
async function refresh(background = false) {
  if (disposed || pending.value) return
  const token = ++generation
  if (!background) previewPending.value = true
  clearTimeout(timer)
  try {
    const value = await props.api?.trainingOverlayPreviewSetupFuel?.({ mode: 'minutes', minutes: minutes.value })
    if (token !== generation) return
    state.value = value
    if (value && error.value.startsWith('Anteprima carburante')) error.value = ''
    if (!value) error.value = 'Riavvia Racer Core per attivare il comando carburante.'
  } catch { if (token === generation) { state.value = null; error.value = 'Anteprima carburante non disponibile. Riprovo automaticamente.' } }
  finally { if (token === generation) previewPending.value = false }
  if (token === generation && open.value) timer = setTimeout(() => refresh(true), 1500)
}
// Keep the displayed estimate mounted while recalculating; only a fresh preview can be applied.
watch([open, minutes], () => { error.value = ''; if (open.value) void refresh(); else { generation++; clearTimeout(timer); state.value = null; previewPending.value = false } }, { flush: 'sync' })
function adjust(amount: number) {
  if (pending.value) return
  const current = Number(minutes.value)
  minutes.value = Math.max(1, Math.min(180, (Number.isFinite(current) ? Math.round(current) : 10) + amount))
}
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
function beginApplication() {
  pending.value = true; error.value = ''; generation++; clearTimeout(timer)
  previewPending.value = false
}
async function applyPlan(mode: 'auto' | 'minutes', expected: any) {
  const result = await props.api.trainingOverlayApplySetupFuel({ mode, minutes: Number(minutes.value), contextKey: expected.contextKey, totalLitres: expected.totalLitres })
  error.value = result?.reason || 'Esito non disponibile.'
}
function finishApplication() {
  pending.value = false
  if (open.value) void refresh()
}
async function applySession() {
  if (pending.value) return
  beginApplication()
  try {
    // Obtain a fresh session plan on click; never reuse the custom stint preview.
    const value = await props.api?.trainingOverlayPreviewSetupFuel?.({ mode: 'auto', minutes: Number(minutes.value) })
    if (disposed) return
    if (!value?.available || !value?.plan?.ok) {
      error.value = value?.conflict || value?.unavailableReason || value?.plan?.reason || 'Carburante sessione non disponibile.'
      return
    }
    await applyPlan('auto', value.plan)
  } catch { error.value = 'Applicazione interrotta: controlla il carburante nel setup.' }
  finally { finishApplication() }
}
async function apply() {
  if (!state.value?.available || pending.value || previewPending.value) return
  const expected = plan.value
  beginApplication()
  try { await applyPlan('minutes', expected) }
  catch { error.value = 'Applicazione interrotta: controlla il carburante nel setup.' }
  finally { finishApplication() }
}
onBeforeUnmount(() => { disposed = true; generation++; clearTimeout(timer); void props.api?.trainingOverlayKeyboardEditing?.(false) })
</script>

<template>
  <section class="fuel-panel">
    <button class="fuel-open" type="button" data-overlay-wheel-action="fuel-session" :disabled="pending" @click="applySession">{{ pending ? 'Applicazione carburante…' : 'Carburante intera sessione' }}</button>
    <div v-if="!open && (pending || error)" class="fuel-status" role="status" aria-live="polite"><strong>Stato carburante</strong><p>{{ statusMessage }}</p></div>
    <button class="fuel-open" type="button" data-overlay-wheel-action="fuel" :aria-expanded="open" :disabled="pending" @click="open = !open">Carburante durata stint</button>
    <div v-if="open" class="fuel-body">
      <strong>Prepara il carburante per lo stint</strong>
      <div class="fuel-duration" :inert="pending || undefined">
        <button type="button" data-overlay-wheel-action="fuel-minus" aria-label="Un minuto in meno" @click="adjust(-1)">−</button>
        <label><input v-model.number="minutes" type="number" min="1" max="180" step="1" aria-label="Minuti stint" :disabled="pending" @wheel="wheelMinutes" @pointerdown="keyboard" @keydown.stop @blur="api?.trainingOverlayKeyboardEditing?.(false)"> min</label>
        <button type="button" data-overlay-wheel-action="fuel-plus" aria-label="Un minuto in più" @click="adjust(1)">+</button>
      </div>
      <template v-if="plan?.totalLitres">
        <p class="fuel-total">{{ plan.totalLitres }} <small>L totali</small></p>
        <p>Stint richiesto: {{ (plan.durationMs / 60000).toFixed(1) }} min</p>
        <p v-if="plan.nominalAutonomyMs">Autonomia stimata con riserva: {{ (plan.nominalAutonomyMs / 60000).toFixed(1) }} min</p>
        <p> {{ plan.consumption }} L/giro · riferimento {{ (plan.referenceLapMs / 1000).toFixed(1) }} s</p>
        <details><summary>Come è calcolato</summary><p>{{ plan.consumptionSource }}. {{ plan.paceSource }}.</p><p v-for="note in plan.notes" :key="note">{{ note }}</p></details>
      </template>

      <button class="fuel-apply" type="button" data-overlay-wheel-action="fuel-apply" :disabled="!state?.available || pending || previewPending" @click="apply">{{ pending ? 'Applicazione…' : `Applica carburante${plan?.ok ? ` · ${plan.totalLitres} L` : ''}` }}</button>
      <div class="fuel-status" role="status" aria-live="polite"><strong>Stato carburante</strong><p>{{ statusMessage }}</p></div>
    </div>
  </section>
</template>

<style scoped>
.fuel-status{padding:10px;border:1px solid #6d604b;border-radius:8px;background:#24211c}.fuel-status strong{display:block;margin-bottom:4px}.fuel-panel{width:100%;text-align:left;display:grid;gap:8px}.fuel-open,.fuel-apply{width:100%;min-height:34px;border:1px solid #805126;border-radius:8px;background:#252019;color:#fff;font-weight:800}.fuel-body{padding:12px;border:1px solid #48423b;border-radius:10px;background:#131819;display:grid;gap:10px;font-size:12px;color:#d9e1e5}.fuel-body p{margin:0;line-height:1.4}.fuel-modes,.fuel-duration{display:flex;gap:8px;align-items:center}.fuel-body button{cursor:pointer;min-height:32px}.fuel-modes button,.fuel-duration button{background:#222b30;color:white;border:1px solid #526069;border-radius:6px;padding:5px 10px}.fuel-modes button[aria-pressed=true]{border-color:#ff9638;color:#ffae62}.fuel-duration input{width:62px;font-size:22px;text-align:center;color:white;background:#101516;border:1px solid #526069;border-radius:6px}.fuel-total{font-size:30px;font-weight:900}.fuel-total small{font-size:13px}.fuel-apply{background:#ff9638;color:#111}.fuel-open:disabled,.fuel-apply:disabled{opacity:.45;cursor:default}.fuel-body summary{cursor:pointer;color:#aeb9c0}button:focus-visible,input:focus-visible{outline:2px solid #ffb257;outline-offset:2px}
</style>
