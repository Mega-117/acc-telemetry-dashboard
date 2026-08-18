<script setup lang="ts">
// ============================================
// PitwallValueField - una voce dell'ordine.
// Il numero grande e' quello che sto per mandare. Il valore in macchina
// compare solo quando differisce: quando coincide ripeterebbe la cifra
// scritta sopra, e lo stato normale della schermata e' proprio "coincide".
// ============================================

import { computed } from 'vue'
import type { PitwallEchoCell } from '~/utils/pitwallPresentation'

const props = withDefaults(defineProps<{
  title?: string
  inputLabel: string
  value: number
  min: number
  max: number
  step?: number
  unit?: string
  decimals?: number
  echo: PitwallEchoCell
  /** sm per le voci che si toccano di rado, lg per il carburante. */
  size?: 'sm' | 'md' | 'lg'
}>(), {
  title: '',
  step: 1,
  unit: '',
  decimals: 0,
  size: 'md',
})

const emit = defineEmits<{
  step: [direction: 1 | -1]
  'update:value': [value: number]
}>()

const displayValue = computed(() => props.value.toFixed(props.decimals))

function onInput(event: Event) {
  emit('update:value', Number((event.target as HTMLInputElement).value))
}
</script>

<template>
  <article
    class="field"
    :class="[`field--${size}`, { 'field--changed': echo.changed }]"
  >
    <header
      v-if="title"
      class="field__head"
    >
      <strong>{{ title }}</strong>
    </header>

    <div class="stepper">
      <button
        type="button"
        :aria-label="`Diminuisci ${inputLabel}`"
        :disabled="value <= min"
        @click="emit('step', -1)"
      >
        −
      </button>

      <label class="value">
        <span class="sr-only">{{ inputLabel }}</span>
        <input
          type="number"
          :step="step"
          :min="min"
          :max="max"
          :value="displayValue"
          @change="onInput"
        />
        <em v-if="unit">{{ unit }}</em>
      </label>

      <button
        type="button"
        :aria-label="`Aumenta ${inputLabel}`"
        :disabled="value >= max"
        @click="emit('step', 1)"
      >
        +
      </button>
    </div>

    <p
      v-if="echo.changed"
      class="echo"
    >
      <span class="echo__car">in auto {{ echo.carValue }}</span>
      <span
        v-if="echo.delta"
        class="echo__delta"
      >{{ echo.delta }}</span>
    </p>
  </article>
</template>

<style lang="scss" scoped>
.field {
  display: grid;
  gap: 8px;
  padding: 10px;
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.04);
}

/* L'accento esiste solo qui: ordine diverso da cio' che ha la macchina. */
.field--changed {
  border-color: rgba(var(--accent-rgb), 0.55);
  background: rgba(var(--accent-rgb), 0.08);
}

.field__head {
  display: flex;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
}

.field__head strong {
  color: #fff;
  font-size: 13px;
  font-weight: 900;
  letter-spacing: 0.06em;
}

/*
  Flex e non grid a 3 colonne: con `1fr` al centro il campo si stirava a
  riempire qualunque larghezza gli desse la colonna (238px per scrivere "24,4",
  658px per scrivere "42"). Qui i tre pezzi restano attaccati e centrati, e il
  campo valore ha una larghezza propria legata a quanto testo deve contenere.
*/
.stepper {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.stepper > button {
  flex: none;
  width: 40px;
}

.field--lg .stepper > button {
  width: 48px;
}

/*
  lg e sm stanno in riga: etichetta a sinistra, stepper a destra.
  Impilati verticalmente lascerebbero il controllo a galleggiare al centro
  di una scheda larga, con aria inutile ai due lati.
*/
.field--lg,
.field--sm {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 6px 12px;
}

.field--lg .field__head,
.field--sm .field__head {
  flex: 1 1 auto;
}

.field--lg .stepper,
.field--sm .stepper {
  flex: none;
}

.field--lg .echo,
.field--sm .echo {
  flex: 1 0 100%;
}

/* sm: bersaglio 34px come i chip, per cio' che si tocca di rado. */
.field--sm {
  gap: 6px;
  padding: 8px;
}

.field--sm .stepper > button {
  width: 34px;
  min-height: 34px;
  font-size: 17px;
}

.field--sm .value {
  max-width: 96px;
}

.field--sm .value input {
  font-size: 18px;
}

.stepper > button {
  min-height: 40px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.06);
  color: #fff;
  font-size: 20px;
  font-weight: 900;
  line-height: 1;
  cursor: pointer;
  transition: background 0.16s ease, border-color 0.16s ease;
}

.stepper > button:hover:not(:disabled),
.stepper > button:focus-visible:not(:disabled) {
  border-color: rgba(255, 255, 255, 0.4);
  background: rgba(255, 255, 255, 0.12);
}

.stepper > button:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.value {
  display: flex;
  flex: 1 1 auto;
  align-items: baseline;
  justify-content: center;
  gap: 4px;
  padding: 4px 6px;
  /* Larghezza dettata dal testo, non dalla colonna che la contiene. */
  min-width: 78px;
  max-width: 132px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.28);
}

.field--lg .value {
  min-width: 104px;
  max-width: 168px;
}

.value input {
  width: 100%;
  min-width: 0;
  border: 0;
  background: transparent;
  color: #fff;
  font-size: 22px;
  font-weight: 800;
  /* A destra: le cifre restano incolonnate tra le quattro ruote. */
  text-align: right;
  /* Niente frecce native del browser: il campo ha gia' i suoi due bersagli
     grandi, e le freccine comparivano al passaggio del mouse spostando
     il numero e offrendo un secondo modo, minuscolo, di fare la stessa cosa. */
  appearance: textfield;
  -moz-appearance: textfield;
}

.value input::-webkit-outer-spin-button,
.value input::-webkit-inner-spin-button {
  margin: 0;
  -webkit-appearance: none;
  appearance: none;
}

.field--lg .value input {
  font-size: 30px;
}

.value input:focus-visible {
  outline: 2px solid rgba(var(--accent-rgb), 0.6);
  outline-offset: 2px;
}

.value em {
  color: rgba(255, 255, 255, 0.45);
  font-size: 11px;
  font-style: normal;
  font-weight: 900;
  letter-spacing: 0.06em;
}

.echo {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin: 0;
  min-width: 0;
}

.echo__car {
  overflow: hidden;
  color: rgba(255, 255, 255, 0.4);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.echo__delta {
  color: var(--accent);
  font-size: 11px;
  font-weight: 900;
  white-space: nowrap;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>
