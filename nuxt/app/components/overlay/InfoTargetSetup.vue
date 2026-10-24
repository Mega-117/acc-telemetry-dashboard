<script setup lang="ts">
import { computed, ref } from 'vue'
import { formatInfoLapTime } from '~/utils/infoPresentation'
import {
  INFO_TARGET_MAX_MS,
  INFO_TARGET_MIN_MS,
  adjustInfoTargetField,
  adjustInfoTargetTolerance,
  normalizeInfoTargetTime,
  splitInfoTargetTime,
  type InfoTargetTimeUnit,
} from '~/utils/infoTargetPicker'
import { fieldStartPart, fieldWheelCommand, singleField, type NumberFieldSpec } from '~/utils/controlKNumberField'
import ControlKNumberField from '~/components/overlay/ControlKNumberField.vue'
import ControlKViewHeader from '~/components/overlay/ControlKViewHeader.vue'

const props = withDefaults(defineProps<{
  targetTimeMs: number
  toleranceMs: number
  keepBetweenSessions: boolean
  contextLabel?: string
  appearance?: 'default' | 'sectors' | 'quick-panel'
  // PIP-526: Ctrl+K starts from real laps instead of three separate digits.
  bestLapMs?: number | null
  lastLapMs?: number | null
}>(), {
  contextLabel: 'HUD Info',
  appearance: 'default',
  bestLapMs: null,
  lastLapMs: null,
})

const emit = defineEmits<{
  'set-target-time': [valueMs: number]
  'select-tolerance': [valueMs: number]
  'toggle-keep': []
  confirm: []
  cancel: []
}>()

type PickerControl = {
  id: InfoTargetTimeUnit | 'tolerance'
  label: string
  value: string
  ariaLabel: string
}

const timeParts = computed(() => splitInfoTargetTime(props.targetTimeMs))
const timeControls = computed<PickerControl[]>(() => [
  { id: 'minutes', label: 'MIN', value: String(timeParts.value.minutes).padStart(2, '0'), ariaLabel: 'Minuti target' },
  { id: 'seconds', label: 'SEC', value: String(timeParts.value.seconds).padStart(2, '0'), ariaLabel: 'Secondi target' },
  { id: 'tenths', label: 'DEC', value: `.${timeParts.value.tenths}`, ariaLabel: 'Decimi target' },
])
const toleranceControl = computed<PickerControl>(() => ({
  id: 'tolerance',
  label: 'Tolleranza',
  value: `${(props.toleranceMs / 1000).toFixed(1).replace('.', ',')} s`,
  ariaLabel: 'Tolleranza massima',
}))

const editingControl = ref<PickerControl['id'] | null>(null)
const usableLap = (value: number | null | undefined) => typeof value === 'number' && value >= 1_000 ? value : null
function useLap(valueMs: number) {
  emit('set-target-time', Math.round(valueMs / 100) * 100)
}
function toggleEditing(id: PickerControl['id']) {
  editingControl.value = editingControl.value === id ? null : id
}

// PIP-611: Ctrl+K has two fields, the lap time (1:30,5, one field in tenths) and the
// tolerance. Typed digits enter from the right; from the wheel OK engages the
// seconds, Up/Down change them, OK moves to tenths, then minutes, then leaves.
// The parts never carry into each other while stepping.
type QuickFieldId = 'time' | 'tolerance'
const LAP_SPEC: NumberFieldSpec = {
  parts: [
    { label: 'MIN', min: 0, max: 9, wrap: false, digits: 1, unit: 600 },
    { label: 'SEC', min: 0, max: 59, wrap: true, digits: 2, unit: 10, separator: ':' },
    { label: 'DEC', min: 0, max: 9, wrap: true, digits: 1, unit: 1, separator: ',' },
  ],
  min: INFO_TARGET_MIN_MS / 100, max: INFO_TARGET_MAX_MS / 100, start: 1,
}
const TOLERANCE_SPEC = singleField(1, 10, 2, tenths => (tenths / 10).toFixed(1).replace('.', ','))
const quickFields = computed(() => [
  { id: 'time' as const, label: 'TEMPO', ariaLabel: 'Tempo obiettivo', value: Math.round(props.targetTimeMs / 100), spec: LAP_SPEC, suffix: '' },
  { id: 'tolerance' as const, label: 'TOLLERANZA', ariaLabel: 'Tolleranza massima', value: Math.round(props.toleranceMs / 100), spec: TOLERANCE_SPEC, suffix: ' s' },
])
const editingPart = ref<{ id: QuickFieldId, part: number } | null>(null)
function toggleQuickField(id: QuickFieldId, spec: NumberFieldSpec) {
  editingPart.value = editingPart.value?.id === id ? null : { id, part: fieldStartPart(spec) }
}
function setQuickField(id: QuickFieldId, tenths: number | null) {
  if (tenths === null) return
  if (id === 'tolerance') emit('select-tolerance', tenths * 100)
  else emit('set-target-time', normalizeInfoTargetTime(tenths * 100))
}
function handleWheelCommand(command: string | undefined): boolean {
  if (!editingPart.value || props.appearance !== 'quick-panel') return false
  const field = quickFields.value.find(value => value.id === editingPart.value!.id)!
  const result = fieldWheelCommand(editingPart.value.part, field.value, command, field.spec)
  if (!result.handled) return false
  if (result.value !== null && result.value !== field.value) setQuickField(field.id, result.value)
  editingPart.value = result.part === null ? null : { id: field.id, part: result.part }
  return true
}
const editingHint = computed(() => {
  if (!editingPart.value) return ''
  const field = quickFields.value.find(value => value.id === editingPart.value!.id)!
  return field.spec.parts.length > 1
    ? `Su/Giù cambiano ${field.spec.parts[editingPart.value.part]!.label} · OK passa al successivo · Indietro fatto`
    : 'Su/Giù cambiano il valore · OK fatto'
})
defineExpose({ handleWheelCommand })

function adjustControl(control: PickerControl, direction: number) {
  if (control.id === 'tolerance') {
    emit('select-tolerance', adjustInfoTargetTolerance(props.toleranceMs, direction))
    return
  }
  emit('set-target-time', adjustInfoTargetField(props.targetTimeMs, control.id, direction))
}

function onWheel(control: PickerControl, event: WheelEvent) {
  if (event.deltaY === 0) return
  adjustControl(control, event.deltaY < 0 ? 1 : -1)
}
</script>

<template>
  <section
    class="info-target-setup"
    :class="{ 'info-target-setup--sectors': appearance === 'sectors', 'info-target-setup--quick': appearance === 'quick-panel' }"
    data-overlay-interactive
    aria-label="Configura Target giro"
  >
    <!-- PIP-556: Control K editors share one structure: ← header, fields, shortcuts, hint, one primary action. -->
    <ControlKViewHeader v-if="appearance === 'quick-panel'" title="Giro obiettivo" action="target-cancel" @back="emit('cancel')" />
    <header v-else>
      <span>{{ contextLabel }}</span>
      <strong>Target giro</strong>
      <p>Imposta il riferimento del giro completo.</p>
    </header>

    <template v-if="appearance === 'quick-panel'">
      <div class="ck-editor__fields" role="group" aria-label="Tempo obiettivo">
        <ControlKNumberField v-for="field in quickFields" :key="field.id" :value="field.value" :spec="field.spec" :label="field.label"
          :action="`target-${field.id}`" :name="field.ariaLabel" :suffix="field.suffix"
          :part="editingPart?.id === field.id ? editingPart.part : null" :class="`ck-field--${field.id}`"
          @toggle="toggleQuickField(field.id, field.spec)" @release="editingPart = null" @update:value="setQuickField(field.id, $event)" />
      </div>
      <div v-if="usableLap(bestLapMs) || usableLap(lastLapMs)" class="ck-editor__shortcuts">
        <button v-if="usableLap(bestLapMs)" type="button" data-overlay-wheel-action="target-use-best" @click="useLap(bestLapMs!)">Usa best {{ formatInfoLapTime(Math.round(bestLapMs! / 100) * 100) }}</button>
        <button v-if="usableLap(lastLapMs)" type="button" data-overlay-wheel-action="target-use-last" @click="useLap(lastLapMs!)">Usa ultimo {{ formatInfoLapTime(Math.round(lastLapMs! / 100) * 100) }}</button>
      </div>
      <!-- Only while the wheel adjusts a field: how to move on. -->
      <p v-if="editingHint" class="ck-editor__hint" role="status">{{ editingHint }}</p>
      <div class="ck-editor__actions">
        <button type="button" class="ck-editor__primary" data-overlay-wheel-action="target-confirm" @click="emit('confirm')">Conferma</button>
      </div>
    </template>

    <div v-if="appearance !== 'quick-panel'" class="target-preview" aria-live="polite">
      <span>Tempo target</span>
      <strong>{{ formatInfoLapTime(targetTimeMs) }}</strong>
    </div>

    <div v-if="appearance !== 'quick-panel'" class="target-picker" role="group" aria-label="Tempo target">
      <article
        v-for="control in timeControls"
        :key="control.id"
        class="target-drum"
        :class="{ 'is-editing': editingControl === control.id }"
        tabindex="0"
        :aria-label="`${control.ariaLabel}: ${control.value}. Usa la rotella o le frecce.`"
        @wheel.prevent="onWheel(control, $event)"
      >
        <span>{{ control.label }}</span>
        <button
          type="button"
          class="target-drum__arrow"
          :data-overlay-wheel-action="`target-${control.id}-increase`"
          :aria-label="`Aumenta ${control.ariaLabel}`"
          @click="adjustControl(control, 1)"
        >
          ▲
        </button>
        <!-- PIP-526: Ctrl+K edits one time value instead (target-quick above). -->
        <strong>{{ control.value }}</strong>
        <button
          type="button"
          class="target-drum__arrow"
          :aria-label="`Diminuisci ${control.ariaLabel}`"
          :data-overlay-wheel-action="`target-${control.id}-decrease`"
          @click="adjustControl(control, -1)"
        >
          ▼
        </button>
      </article>
    </div>

    <section v-if="appearance !== 'quick-panel'" class="target-tolerance" aria-labelledby="target-tolerance-title">
      <div class="target-tolerance__copy">
        <strong id="target-tolerance-title" title="Margine concesso oltre il target. I giri più veloci restano validi.">Tolleranza</strong>
        <p>Margine concesso oltre il target. I giri più veloci restano validi.</p>
      </div>
      <div
        class="target-tolerance__control"
        :class="{ 'is-editing': editingControl === 'tolerance' }"
        tabindex="0"
        :aria-label="`${toleranceControl.ariaLabel}: ${toleranceControl.value}. Usa la rotella o i pulsanti meno e più.`"
        @wheel.prevent="onWheel(toleranceControl, $event)"
      >
        <button
          type="button"
          aria-label="Diminuisci Tolleranza massima"
          data-overlay-wheel-action="target-tolerance-decrease"
          @click="adjustControl(toleranceControl, -1)"
        >
          −
        </button>
        <strong>{{ toleranceControl.value }}</strong>
        <button
          type="button"
          aria-label="Aumenta Tolleranza massima"
          data-overlay-wheel-action="target-tolerance-increase"
          @click="adjustControl(toleranceControl, 1)"
        >
          +
        </button>
      </div>
    </section>


    <button
      type="button"
      class="target-keep"
      v-if="appearance !== 'quick-panel'"
      title="Mantieni tra sessioni dello stesso server"
      data-overlay-wheel-action="target-keep"
      :class="{ 'is-active': keepBetweenSessions }"
      :aria-pressed="keepBetweenSessions"
      @click="emit('toggle-keep')"
    >
      <i aria-hidden="true">{{ keepBetweenSessions ? '✓' : '' }}</i>
      <span>Mantieni tra sessioni dello stesso server</span>
    </button>

    <div v-if="appearance !== 'quick-panel'" class="target-actions">
      <button type="button" class="target-confirm" data-overlay-wheel-action="target-confirm" @click="emit('confirm')">Conferma</button>
      <button type="button" class="target-cancel" data-overlay-wheel-action="target-cancel" @click="emit('cancel')">Annulla</button>
    </div>
  </section>
</template>

<style scoped>
.target-field-value { border: 0; background: transparent; color: inherit; font: inherit; font-size: 22px; font-weight: 600; cursor: pointer; }
.target-tolerance__control .target-field-value { font-size: 14px; }
.info-target-setup {
  display: grid;
  gap: 9px;
  width: 100%;
  padding: 14px;
  box-sizing: border-box;
  border: 1px solid rgba(255,255,255,.12);
  border-radius: 22px;
  color: #f8fafc;
  background: linear-gradient(145deg, rgba(30,37,42,.98), rgba(15,19,23,.98));
  box-shadow: 0 18px 46px rgba(0,0,0,.34);
  font-family: Inter, system-ui, sans-serif;
}
header span { color: #fb923c; font-size: 11px; font-weight: 900; letter-spacing: .12em; text-transform: uppercase; }
header strong { display: block; margin-top: 3px; font-size: 25px; }
header p { margin: 4px 0 0; color: rgba(255,255,255,.62); font-size: 13px; }
.target-preview {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 14px;
  padding: 8px 14px;
  border: 1px solid rgba(251,146,60,.38);
  border-radius: 14px;
  background: #0b0e11;
}
.target-preview span {
  color: rgba(255,255,255,.58);
  font-size: 11px;
  font-weight: 900;
  letter-spacing: .08em;
  text-transform: uppercase;
}
.target-preview strong {
  color: #fff;
  font-size: 31px;
  font-weight: 900;
  font-variant-numeric: tabular-nums;
}
.target-picker {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}
.target-drum {
  display: grid;
  grid-template-rows: auto 23px 35px 23px;
  align-items: center;
  min-width: 0;
  overflow: hidden;
  border: 1px solid rgba(255,255,255,.13);
  border-radius: 13px;
  outline: none;
  background: #151a1f;
  transition: border-color 120ms ease, box-shadow 120ms ease;
}
.target-drum:hover,
.target-drum:focus-within,
.target-drum:focus {
  border-color: rgba(251,146,60,.78);
  box-shadow: inset 0 0 0 1px rgba(251,146,60,.18);
}
.target-drum > span {
  padding-top: 7px;
  color: rgba(255,255,255,.48);
  text-align: center;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: .11em;
}
.target-drum > strong {
  color: #fff;
  text-align: center;
  font-size: 25px;
  font-weight: 900;
  font-variant-numeric: tabular-nums;
}
.target-drum__arrow {
  border: 0;
  color: rgba(255,255,255,.58);
  background: transparent;
  font-size: 12px;
  cursor: pointer;
}
.target-drum__arrow:hover { color: #fb923c; background: rgba(251,146,60,.08); }
.target-tolerance {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  padding: 8px 10px;
  border: 1px solid rgba(251,146,60,.2);
  border-radius: 13px;
  background: rgba(251,146,60,.045);
}
.target-tolerance__copy strong {
  color: #f8fafc;
  font-size: 12px;
  font-weight: 900;
  letter-spacing: .04em;
}
.target-tolerance__copy p {
  max-width: 235px;
  margin: 3px 0 0;
  color: rgba(255,255,255,.5);
  font-size: 10.5px;
  line-height: 1.35;
}
.target-tolerance__control {
  display: grid;
  grid-template-columns: 30px minmax(54px, auto) 30px;
  align-items: center;
  min-height: 38px;
  overflow: hidden;
  border: 1px solid rgba(255,255,255,.15);
  border-radius: 11px;
  outline: none;
  background: #11161a;
  transition: border-color 120ms ease, box-shadow 120ms ease;
}
.target-tolerance__control:hover,
.target-tolerance__control:focus-within,
.target-tolerance__control:focus {
  border-color: rgba(251,146,60,.78);
  box-shadow: inset 0 0 0 1px rgba(251,146,60,.18);
}
.target-tolerance__control button {
  align-self: stretch;
  border: 0;
  color: rgba(255,255,255,.65);
  background: transparent;
  font-size: 18px;
  cursor: pointer;
}
.target-tolerance__control button:hover {
  color: #fb923c;
  background: rgba(251,146,60,.09);
}
.target-tolerance__control strong {
  color: #fff;
  text-align: center;
  font-size: 16px;
  font-weight: 900;
  font-variant-numeric: tabular-nums;
}
.target-keep {
  display: grid;
  grid-template-columns: 24px 1fr;
  gap: 9px;
  align-items: center;
  padding: 8px;
  border: 1px solid rgba(255,255,255,.12);
  border-radius: 12px;
  color: rgba(255,255,255,.8);
  background: rgba(255,255,255,.04);
  text-align: left;
  cursor: pointer;
}
.target-keep i { display: grid; width: 22px; height: 22px; place-items: center; border: 1px solid rgba(255,255,255,.3); border-radius: 6px; font-style: normal; }
.target-keep.is-active i { border-color: #fb923c; color: #111; background: #fb923c; }
.target-keep span { font-size: 12px; font-weight: 800; line-height: 1.25; }
.target-actions { display: grid; grid-template-columns: 1fr auto; gap: 8px; }
.target-actions button { min-height: 40px; border-radius: 11px; font-weight: 900; cursor: pointer; }
.target-confirm { border: 0; color: #111; background: #fb923c; }
.target-cancel { padding-inline: 16px; border: 1px solid rgba(255,255,255,.15); color: #e5e7eb; background: transparent; }
.info-target-setup--sectors {
  height: 100%;
  min-height: 0;
  border-color: rgba(255, 255, 255, .18);
  border-radius: 14px;
  background: #0b0e11;
  box-shadow: none;
  -webkit-app-region: no-drag;
}


/* PIP-556: Ctrl+K uses the shared editor structure (.ck-editor__* in _training-overlay.scss). */
.info-target-setup--quick { padding: 0; gap: 10px; border: 0; border-radius: 0; background: #0b0b0b; box-shadow: none; }

@media (prefers-reduced-motion: reduce) {
  .info-target-setup *,
  .info-target-setup *::before,
  .info-target-setup *::after {
    transition: none !important;
  }
}
</style>
