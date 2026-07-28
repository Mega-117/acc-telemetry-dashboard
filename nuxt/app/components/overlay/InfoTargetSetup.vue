<script setup lang="ts">
import { computed } from 'vue'
import { formatInfoLapTime } from '~/utils/infoPresentation'
import {
  adjustInfoTargetTime,
  adjustInfoTargetTolerance,
  splitInfoTargetTime,
  type InfoTargetTimeUnit,
} from '~/utils/infoTargetPicker'

const props = withDefaults(defineProps<{
  targetTimeMs: number
  toleranceMs: number
  keepBetweenSessions: boolean
  contextLabel?: string
  appearance?: 'default' | 'sectors'
}>(), {
  contextLabel: 'HUD Info',
  appearance: 'default',
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

function adjustControl(control: PickerControl, direction: number) {
  if (control.id === 'tolerance') {
    emit('select-tolerance', adjustInfoTargetTolerance(props.toleranceMs, direction))
    return
  }
  emit('set-target-time', adjustInfoTargetTime(props.targetTimeMs, control.id, direction))
}

function onWheel(control: PickerControl, event: WheelEvent) {
  if (event.deltaY === 0) return
  adjustControl(control, event.deltaY < 0 ? 1 : -1)
}
</script>

<template>
  <section
    class="info-target-setup"
    :class="{ 'info-target-setup--sectors': appearance === 'sectors' }"
    data-overlay-interactive
    aria-label="Configura Target giro"
  >
    <header>
      <span>{{ contextLabel }}</span>
      <strong>Target giro</strong>
      <p>Imposta il riferimento del giro completo.</p>
    </header>

    <div class="target-preview" aria-live="polite">
      <span>Tempo target</span>
      <strong>{{ formatInfoLapTime(targetTimeMs) }}</strong>
    </div>

    <div class="target-picker" role="group" aria-label="Tempo target">
      <article
        v-for="control in timeControls"
        :key="control.id"
        class="target-drum"
        tabindex="0"
        :aria-label="`${control.ariaLabel}: ${control.value}. Usa la rotella o le frecce.`"
        @wheel.prevent="onWheel(control, $event)"
      >
        <span>{{ control.label }}</span>
        <button
          type="button"
          class="target-drum__arrow"
          :aria-label="`Aumenta ${control.ariaLabel}`"
          @click="adjustControl(control, 1)"
        >
          ▲
        </button>
        <strong>{{ control.value }}</strong>
        <button
          type="button"
          class="target-drum__arrow"
          :aria-label="`Diminuisci ${control.ariaLabel}`"
          @click="adjustControl(control, -1)"
        >
          ▼
        </button>
      </article>
    </div>

    <section class="target-tolerance" aria-labelledby="target-tolerance-title">
      <div class="target-tolerance__copy">
        <strong id="target-tolerance-title">Tolleranza</strong>
        <p>Margine concesso oltre il target. I giri più veloci restano validi.</p>
      </div>
      <div
        class="target-tolerance__control"
        tabindex="0"
        :aria-label="`${toleranceControl.ariaLabel}: ${toleranceControl.value}. Usa la rotella o i pulsanti meno e più.`"
        @wheel.prevent="onWheel(toleranceControl, $event)"
      >
        <button
          type="button"
          aria-label="Diminuisci Tolleranza massima"
          @click="adjustControl(toleranceControl, -1)"
        >
          −
        </button>
        <strong>{{ toleranceControl.value }}</strong>
        <button
          type="button"
          aria-label="Aumenta Tolleranza massima"
          @click="adjustControl(toleranceControl, 1)"
        >
          +
        </button>
      </div>
    </section>

    <button
      type="button"
      class="target-keep"
      :class="{ 'is-active': keepBetweenSessions }"
      :aria-pressed="keepBetweenSessions"
      @click="emit('toggle-keep')"
    >
      <i aria-hidden="true">{{ keepBetweenSessions ? '✓' : '' }}</i>
      <span>Mantieni tra sessioni dello stesso server</span>
    </button>

    <div class="target-actions">
      <button type="button" class="target-confirm" @click="emit('confirm')">Conferma</button>
      <button type="button" class="target-cancel" @click="emit('cancel')">Annulla</button>
    </div>
  </section>
</template>

<style scoped>
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

@media (prefers-reduced-motion: reduce) {
  .info-target-setup *,
  .info-target-setup *::before,
  .info-target-setup *::after {
    transition: none !important;
  }
}
</style>
