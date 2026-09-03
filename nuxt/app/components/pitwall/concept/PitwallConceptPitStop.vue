<script setup lang="ts">
// La decisione da mandare alla macchina (PIP-369): tutto il Pit MFD tranne il
// limitatore, che e' il limite dei 50 km/h e non una scelta del muretto.
//
// Due principi che vengono dal Pit Wall reale e non si perdono nel prototipo:
// l'invio non finge mai (se e' bloccato, dice **quale** cosa lo blocca) e
// l'esito resta distinto campo per campo, perche' ACC rilegge solo una parte
// dei campi e appiattirli sarebbe un falso verde.
import { computed, reactive, ref } from "vue";
import {
  PITWALL_CONCEPT_DEFAULT_PRESSURES,
  pitwallConceptSendBlock,
  stepPitwallConceptPressure,
} from "~/utils/pitwallConcept";
import type { PitwallConceptRace } from "~/utils/pitwallConcept";
// Il tempo della sosta non si ricalcola qui: e' la stessa funzione pura della
// vista classica. Resta senza I/O, quindi il prototipo non tocca servizi reali.
import { estimatePitStop, formatStopDuration, type PitwallPlan } from "~/utils/pitwallPresentation";

const props = defineProps<{ race: PitwallConceptRace | null }>();

const sent = ref(false);

const pressures = reactive<Record<"FL" | "FR" | "RL" | "RR", number>>({
  ...PITWALL_CONCEPT_DEFAULT_PRESSURES,
});
const strategy = reactive({
  preset: 1,
  fuel: 0,
  tyres: false,
  tyreSet: 1,
  compound: "Dry",
  brakes: false,
  driver: "Nessun cambio",
  suspension: false,
  bodywork: false,
});

/** Com'e' messa la macchina adesso: una fonte sola per la colonna "In macchina". */
const car = Object.freeze({
  preset: 1,
  fuel: 0,
  tyres: false,
  tyreSet: 1,
  compound: "Dry",
  pressure: 25,
  brakes: false,
  driver: "Nessun cambio",
  suspension: false,
  bodywork: false,
});

const yesNo = (value: boolean) => (value ? "Sì" : "No");

/**
 * Cosa e' stato cambiato rispetto alla macchina: e' anche l'elenco dei campi
 * che l'ordine dichiarera' uno per uno. Un campo non toccato non si dichiara.
 */
const changed = computed(() => {
  const fields: string[] = [];
  if (strategy.preset !== car.preset) fields.push("Strategia");
  if (strategy.fuel !== car.fuel) fields.push("Carburante");
  if (strategy.tyres !== car.tyres) fields.push("Cambio gomme");
  if (strategy.tyreSet !== car.tyreSet) fields.push("Set");
  if (strategy.compound !== car.compound) fields.push("Mescola");
  for (const wheel of ["FL", "FR", "RL", "RR"] as const) {
    if (pressures[wheel] !== car.pressure) fields.push(wheel);
  }
  if (strategy.brakes !== car.brakes) fields.push("Freni");
  if (strategy.driver !== car.driver) fields.push("Pilota");
  if (strategy.suspension !== car.suspension) fields.push("Sospensioni");
  if (strategy.bodywork !== car.bodywork) fields.push("Carrozzeria");
  return fields;
});

const blocked = computed(() => pitwallConceptSendBlock(props.race, changed.value.length > 0));

/** I campi che ACC rilegge: solo questi possono dirsi verificati. */
const READ_BACK = new Set(["Carburante", "Set", "Mescola", "FL", "FR", "RL", "RR"]);
const outcome = ref<{ field: string; verified: boolean }[] | null>(null);

function send() {
  if (blocked.value) return;
  outcome.value = changed.value.map(field => ({ field, verified: READ_BACK.has(field) }));
  sent.value = true;
}

/** Lo stato mock nella forma che la logica pura della sosta si aspetta. */
function toPlan(
  source: typeof strategy | typeof car,
  wheels: Record<"FL" | "FR" | "RL" | "RR", number>,
): PitwallPlan {
  return {
    // Il mock non simula preset e freni: restano fuori dalla stima della
    // sosta, che e' l'unica cosa per cui questa forma serve qui.
    pitStrategy: null,
    brakes: false,
    pressures: { ...wheels },
    fuelLiters: source.fuel,
    compound: source.compound === "Wet" ? "wet" : "dry",
    tyreSet: source.tyreSet,
    changeTyres: source.tyres,
    driverId: source.driver === "Nessun cambio" ? null : source.driver,
    repairBodywork: source.bodywork,
    repairSuspension: source.suspension,
  };
}

/** Il "Tempo richiesto" del MFD: cambia mentre si compone la strategia. */
const stopTime = computed(() => {
  const carWheels = { FL: car.pressure, FR: car.pressure, RL: car.pressure, RR: car.pressure };
  const estimate = estimatePitStop(toPlan(strategy, pressures), toPlan(car, carWheels));
  return formatStopDuration(estimate.seconds);
});

function stepAll(step: 1 | -1) {
  for (const wheel of ["FL", "FR", "RL", "RR"] as const) {
    pressures[wheel] = stepPitwallConceptPressure(pressures[wheel], step);
  }
}
</script>

<template>
  <section class="pwc-panel">
    <header class="pwc-panel__head">
      <h2>Pit stop</h2>
      <small>Finestra giri 45–49 · dati macchina di 4s fa</small>
    </header>

    <div class="pwc-pit-head">
      <b>Campo</b><b>Strategia</b><b>In macchina</b>
    </div>

    <div class="pwc-pit-row">
      <span>Preset strategia</span>
      <div class="pwc-step">
        <button
          type="button"
          aria-label="Preset precedente"
          @click="strategy.preset = Math.max(1, strategy.preset - 1)"
        >
          −
        </button>
        <b>{{ strategy.preset }}</b>
        <button
          type="button"
          aria-label="Preset successivo"
          @click="strategy.preset++"
        >
          +
        </button>
      </div>
      <b>{{ car.preset }}</b>
    </div>

    <div class="pwc-pit-row">
      <span>Carburante</span>
      <div class="pwc-step">
        <button
          type="button"
          aria-label="Meno carburante"
          @click="strategy.fuel = Math.max(0, strategy.fuel - 1)"
        >
          −
        </button>
        <b>{{ strategy.fuel }} L</b>
        <button
          type="button"
          aria-label="Più carburante"
          @click="strategy.fuel++"
        >
          +
        </button>
      </div>
      <b>{{ car.fuel }} L</b>
    </div>

    <div class="pwc-pit-row">
      <span>Cambio gomme</span>
      <label>
        <input
          v-model="strategy.tyres"
          type="checkbox"
        />{{ yesNo(strategy.tyres) }}
      </label>
      <b>{{ yesNo(car.tyres) }}</b>
    </div>

    <div class="pwc-pit-row">
      <span>Set pneumatici</span>
      <div class="pwc-step">
        <button
          type="button"
          aria-label="Set precedente"
          @click="strategy.tyreSet = Math.max(1, strategy.tyreSet - 1)"
        >
          −
        </button>
        <b>{{ strategy.tyreSet }}</b>
        <button
          type="button"
          aria-label="Set successivo"
          @click="strategy.tyreSet++"
        >
          +
        </button>
      </div>
      <b>{{ car.tyreSet }}</b>
    </div>

    <div class="pwc-pit-row">
      <span>Mescola</span>
      <select
        v-model="strategy.compound"
        aria-label="Mescola"
      >
        <option>Dry</option>
        <option>Wet</option>
      </select>
      <b>{{ car.compound }}</b>
    </div>

    <div class="pwc-pit-row">
      <span>Pressioni</span>
      <div class="pwc-step">
        <button
          type="button"
          aria-label="Abbassa tutte le pressioni"
          @click="stepAll(-1)"
        >
          −
        </button>
        <b>Tutte</b>
        <button
          type="button"
          aria-label="Alza tutte le pressioni"
          @click="stepAll(1)"
        >
          +
        </button>
      </div>
      <b>—</b>
    </div>

    <div
      v-for="wheel in ['FL', 'FR', 'RL', 'RR'] as const"
      :key="wheel"
      class="pwc-pit-row is-sub"
    >
      <span>{{ wheel }}</span>
      <div class="pwc-step">
        <button
          type="button"
          :aria-label="`Abbassa ${wheel}`"
          @click="pressures[wheel] = stepPitwallConceptPressure(pressures[wheel], -1)"
        >
          −
        </button>
        <b>{{ pressures[wheel].toFixed(1) }}</b>
        <button
          type="button"
          :aria-label="`Alza ${wheel}`"
          @click="pressures[wheel] = stepPitwallConceptPressure(pressures[wheel], 1)"
        >
          +
        </button>
      </div>
      <b>{{ car.pressure.toFixed(1) }}</b>
    </div>

    <div class="pwc-pit-row">
      <span>Sostituisci freni</span>
      <label>
        <input
          v-model="strategy.brakes"
          type="checkbox"
        />{{ yesNo(strategy.brakes) }}
      </label>
      <b>{{ yesNo(car.brakes) }}</b>
    </div>

    <div class="pwc-pit-row">
      <span>Prossimo pilota</span>
      <select
        v-model="strategy.driver"
        aria-label="Prossimo pilota"
      >
        <option>Nessun cambio</option>
        <option>lucab</option>
      </select>
      <b>{{ car.driver }}</b>
    </div>

    <div class="pwc-pit-row is-group">
      <span>Riparazioni</span>
    </div>

    <div class="pwc-pit-row is-sub">
      <span>Sospensioni</span>
      <label>
        <input
          v-model="strategy.suspension"
          type="checkbox"
        />{{ yesNo(strategy.suspension) }}
      </label>
      <b>{{ yesNo(car.suspension) }}</b>
    </div>

    <div class="pwc-pit-row is-sub">
      <span>Carrozzeria</span>
      <label>
        <input
          v-model="strategy.bodywork"
          type="checkbox"
        />{{ yesNo(strategy.bodywork) }}
      </label>
      <b>{{ yesNo(car.bodywork) }}</b>
    </div>

    <div class="pwc-pit-row is-total">
      <span>Tempo stop stimato</span>
      <b>{{ stopTime }}</b>
      <b>—</b>
    </div>

    <!-- L'esito arriva campo per campo: quello che ACC rilegge e' verificato,
         il resto e' solo selezionato. -->
    <div
      v-if="outcome"
      class="pwc-outcome"
    >
      <span
        v-for="entry in outcome"
        :key="entry.field"
        class="pwc-outcome__chip"
        :class="entry.verified ? 'is-verified' : 'is-selected'"
      >
        {{ entry.verified ? "✓" : "→" }} {{ entry.field }}
      </span>
    </div>

    <p
      v-if="blocked"
      class="pwc-blocked"
    >
      {{ blocked }}
    </p>

    <button
      type="button"
      class="pwc-send"
      :class="{ 'is-sent': sent }"
      :disabled="Boolean(blocked)"
      @click="send()"
    >
      {{ sent ? "Strategia inviata" : "Invia strategia" }}
    </button>
  </section>
</template>

<style lang="scss">
@use "@/assets/scss/variables" as *;

/* Righe e intestazione condividono le stesse tre colonne: i valori restano
   incolonnati sotto Campo / Strategia / In macchina. */
.pwc-pit-head,
.pwc-pit-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 180px 116px;
  align-items: center;
  gap: 16px;
  min-height: 42px;
  padding: 0 20px;
  border-top: 1px solid rgba(255, 255, 255, 0.07);
  font-size: 14px;
}
.pwc-pit-head {
  min-height: 32px;
  color: $text-secondary;
  font-size: 10px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.pwc-pit-head > b:last-child { text-align: right; }
.pwc-pit-row.is-sub { min-height: 38px; }
.pwc-pit-row.is-sub > span { padding-left: 20px; color: $text-secondary; }
/* "Riparazioni" e' solo il cappello delle due righe sotto: stessa griglia, ma
   letto come intestazione e non come campo da impostare. */
.pwc-pit-row.is-group {
  min-height: 30px;
  color: $text-secondary;
  font-size: 10px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
/* Il tempo non si imposta: si legge. Chiude la tabella come nel MFD, ma resta
   incolonnato con i controlli sopra invece di partire dal bordo sinistro. */
.pwc-pit-row.is-total > b {
  text-align: center;
  font-variant-numeric: tabular-nums;
}
.pwc-pit-row > b:last-child {
  text-align: right;
  color: $text-secondary;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.pwc-pit-row select,
.pwc-pit-row label {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  height: 32px;
  padding: 0 10px;
  border: 1px solid var(--pwc-line);
  border-radius: 6px;
  background: #0b1119;
  color: #fff;
}

.pwc-step {
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr) 36px;
  height: 32px;
  border: 1px solid var(--pwc-line);
  border-radius: 6px;
  overflow: hidden;
}
.pwc-step button { border: 0; background: rgba(255, 255, 255, 0.05); color: #fff; cursor: pointer; }
.pwc-step button:hover { background: rgba(255, 107, 0, 0.16); }
.pwc-step b {
  display: grid;
  place-items: center;
  border-inline: 1px solid rgba(255, 255, 255, 0.07);
  font-variant-numeric: tabular-nums;
}

/* L'esito per campo: due segni diversi perche' sono due cose diverse. */
.pwc-outcome {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 16px 20px 0;
}
.pwc-outcome__chip {
  padding: 4px 10px;
  border: 1px solid var(--pwc-line);
  border-radius: 99px;
  color: $text-secondary;
  font-size: 12px;
  font-weight: 700;
}
.pwc-outcome__chip.is-verified { border-color: rgba(74, 222, 128, 0.45); color: #4ade80; }
.pwc-outcome__chip.is-selected { border-color: rgba(167, 139, 250, 0.45); color: #a78bfa; }

.pwc-blocked {
  margin: 16px 20px 0;
  padding: 10px 14px;
  border: 1px solid rgba(245, 158, 11, 0.4);
  border-radius: 8px;
  color: #f59e0b;
  font-size: 13px;
}

.pwc-send {
  width: calc(100% - 40px);
  min-height: 48px;
  margin: 20px;
  border: 0;
  border-radius: 8px;
  background: #e0210b;
  color: #fff;
  font-family: $font-display;
  font-size: 14px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  cursor: pointer;
}
.pwc-send:hover { background: #f5290f; }
.pwc-send:disabled { background: rgba(255, 255, 255, 0.06); color: $text-muted; cursor: not-allowed; }
.pwc-send.is-sent { background: rgba(74, 222, 128, 0.18); color: #4ade80; }

@media (max-width: 760px) {
  .pwc-pit-head,
  .pwc-pit-row {
    grid-template-columns: minmax(0, 1fr) 132px 72px;
    gap: 10px;
    padding: 0 14px;
  }
  .pwc-send { width: calc(100% - 28px); margin: 14px; }
}
</style>
