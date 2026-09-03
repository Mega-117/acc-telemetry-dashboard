<script setup lang="ts">
// La decisione da mandare alla macchina (PIP-369): tutto il Pit MFD tranne il
// limitatore, che e' il limite dei 50 km/h e non una scelta del muretto.
//
// Due principi che vengono dal Pit Wall reale e non si perdono nel prototipo:
// l'invio non finge mai (se e' bloccato, dice **quale** cosa lo blocca) e
// l'esito resta distinto campo per campo, perche' ACC rilegge solo una parte
// dei campi e appiattirli sarebbe un falso verde.
import { computed, onBeforeUnmount, reactive, ref } from "vue";
// Il controllo a tre stati e' quello vero della Classica, non una copia: la
// distinzione fra "spegni" e "non toccare" e' logica di prodotto, e averla in
// due posti vorrebbe dire vederla divergere.
import PitwallToggleField from "~/components/pitwall/PitwallToggleField.vue";
import PitwallConceptOrder from "~/components/pitwall/concept/PitwallConceptOrder.vue";
import {
  PITWALL_CONCEPT_DEFAULT_PRESSURES,
  PITWALL_CONCEPT_SOURCE_LABELS,
  pitwallConceptFreshness,
  pitwallConceptSendBlock,
  stepPitwallConceptPressure,
} from "~/utils/pitwallConcept";
import type {
  PitwallConceptOrderStatus,
  PitwallConceptRace,
  PitwallConceptSource,
} from "~/utils/pitwallConcept";
// Il tempo della sosta non si ricalcola qui: e' la stessa funzione pura della
// vista classica, e `formatToggle` e' la stessa che scrive le tre risposte di
// una casella. Restano senza I/O: il prototipo non tocca servizi reali.
import {
  estimatePitStop,
  formatStopDuration,
  formatToggle,
  type PitwallPlan,
} from "~/utils/pitwallPresentation";

const props = defineProps<{ race: PitwallConceptRace | null }>();

const pressures = reactive<Record<"FL" | "FR" | "RL" | "RR", number>>({
  ...PITWALL_CONCEPT_DEFAULT_PRESSURES,
});

/**
 * `null` vuol dire **non toccare**, ed e' un terzo stato, non un "no".
 *
 * Con una casella booleana, vuota significava "non toccare" e non esisteva
 * nessun modo di **spegnere** una riparazione gia' attiva: cio' che l'ingegnere
 * impostava non era riportato fedelmente in macchina. Vale anche per il preset
 * di strategia, che parte da "Off" perche' quella riga riscrive carburante,
 * gomme e pressioni in blocco e non si tocca per sbaglio.
 */
const strategy = reactive({
  preset: null as number | null,
  fuel: 0,
  tyres: null as boolean | null,
  tyreSet: 1,
  compound: "Dry",
  brakes: null as boolean | null,
  driver: "Nessun cambio",
  suspension: null as boolean | null,
  bodywork: null as boolean | null,
});

/** Com'e' messa la macchina adesso: una fonte sola per la colonna "In macchina". */
const car = Object.freeze({
  preset: null as number | null,
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

/**
 * Da dove viene ogni riga della colonna "In macchina".
 *
 * Non e' decorazione: ACC rilegge carburante, set, mescola e pressioni, e
 * basta. Tutto il resto lo sappiamo solo perche' l'abbiamo chiesto noi, e il
 * preset non lo sappiamo affatto. Le stesse quattro parole della Classica.
 */
const carAgeSeconds = ref(4);
const observed = computed<PitwallConceptSource>(() => pitwallConceptFreshness(carAgeSeconds.value));

const yesNo = (value: boolean | null) => formatToggle(value);

/**
 * Cosa e' stato cambiato rispetto alla macchina: e' anche l'elenco dei campi
 * che l'ordine dichiarera' uno per uno. Un campo lasciato a "non toccare" non
 * e' una differenza, quindi non si dichiara.
 */
const changed = computed(() => {
  const fields: string[] = [];
  if (strategy.preset != null) fields.push("Strategia");
  if (strategy.fuel !== car.fuel) fields.push("Carburante");
  if (strategy.tyres != null && strategy.tyres !== car.tyres) fields.push("Cambio gomme");
  if (strategy.tyreSet !== car.tyreSet) fields.push("Set");
  if (strategy.compound !== car.compound) fields.push("Mescola");
  for (const wheel of ["FL", "FR", "RL", "RR"] as const) {
    if (pressures[wheel] !== car.pressure) fields.push(wheel);
  }
  if (strategy.brakes != null && strategy.brakes !== car.brakes) fields.push("Freni");
  if (strategy.driver !== car.driver) fields.push("Pilota");
  if (strategy.suspension != null && strategy.suspension !== car.suspension) fields.push("Sospensioni");
  if (strategy.bodywork != null && strategy.bodywork !== car.bodywork) fields.push("Carrozzeria");
  return fields;
});

const blocked = computed(() => pitwallConceptSendBlock(props.race, changed.value.length > 0));

/** I campi che ACC rilegge: solo questi possono dirsi verificati. */
const READ_BACK = new Set(["Carburante", "Set", "Mescola", "FL", "FR", "RL", "RR"]);
const outcome = ref<{ field: string; verified: boolean }[] | null>(null);
const orderStatus = ref<PitwallConceptOrderStatus>("idle");
let settleTimer: ReturnType<typeof setTimeout> | null = null;

onBeforeUnmount(() => { if (settleTimer) clearTimeout(settleTimer); });

/**
 * Inviare non e' finire.
 *
 * L'ordine passa da "in corso", e da li' puo' finire applicato, applicato in
 * parte, oppure rifiutato perche' un altro membro del muretto ha vinto la
 * corsa - "prima accettata vince", e le due strategie non si fondono mai.
 * Premere di nuovo mentre e' in corso e' esattamente quel caso.
 */
function send() {
  if (blocked.value) return;
  if (orderStatus.value === "applying") {
    orderStatus.value = "rejected";
    return;
  }
  outcome.value = changed.value.map(field => ({ field, verified: READ_BACK.has(field) }));
  orderStatus.value = "applying";
  settleTimer = setTimeout(() => {
    // Se qualcosa che ACC non rilegge era nell'ordine, l'esito onesto e'
    // "in parte": l'abbiamo premuto, non l'abbiamo visto arrivare.
    const everythingVerified = outcome.value?.every(entry => entry.verified) ?? true;
    orderStatus.value = everythingVerified ? "applied" : "partial";
  }, 1200);
}

/** Lo stato mock nella forma che la logica pura della sosta si aspetta. */
function toPlan(
  source: typeof strategy | typeof car,
  wheels: Record<"FL" | "FR" | "RL" | "RR", number>,
): PitwallPlan {
  return {
    // Il preset resta fuori dalla stima della sosta: carica valori altrui, e
    // quanto durera' la sosta lo dicono i campi che si vedono qui sotto.
    pitStrategy: null,
    brakes: source.brakes,
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
      <!-- La freschezza non e' un dettaglio estetico: un valore vecchio
           mostrato come attuale e' un falso verde con un altro nome. Qui si
           puo' alternare, perche' e' l'unico modo di vedere lo stato "vecchio". -->
      <button
        type="button"
        class="pwc-fresh"
        :class="`is-${observed}`"
        title="Prototipo: alterna dato fresco e dato vecchio"
        @click="carAgeSeconds = carAgeSeconds > 90 ? 4 : 140"
      >
        Finestra giri 45–49 · dati macchina di {{ carAgeSeconds }}s fa
      </button>
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
          @click="strategy.preset = strategy.preset && strategy.preset > 1 ? strategy.preset - 1 : null"
        >
          −
        </button>
        <b>{{ strategy.preset ?? "Off" }}</b>
        <button
          type="button"
          aria-label="Preset successivo"
          @click="strategy.preset = (strategy.preset ?? 0) + 1"
        >
          +
        </button>
      </div>
      <span class="pwc-pit-car">
        <b>{{ car.preset ?? "—" }}</b>
        <em class="pwc-src is-unavailable">{{ PITWALL_CONCEPT_SOURCE_LABELS.unavailable }}</em>
      </span>
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
      <span class="pwc-pit-car">
        <b>{{ car.fuel }} L</b>
        <em
          class="pwc-src"
          :class="`is-${observed}`"
        >{{ PITWALL_CONCEPT_SOURCE_LABELS[observed] }}</em>
      </span>
    </div>

    <div class="pwc-pit-row">
      <span>Cambio gomme</span>
      <PitwallToggleField
        v-model="strategy.tyres"
        label="Cambio gomme"
        hide-label
      />
      <span class="pwc-pit-car">
        <b>{{ yesNo(car.tyres) }}</b>
        <em class="pwc-src is-order">{{ PITWALL_CONCEPT_SOURCE_LABELS.order }}</em>
      </span>
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
      <span class="pwc-pit-car">
        <b>{{ car.tyreSet }}</b>
        <em
          class="pwc-src"
          :class="`is-${observed}`"
        >{{ PITWALL_CONCEPT_SOURCE_LABELS[observed] }}</em>
      </span>
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
      <span class="pwc-pit-car">
        <b>{{ car.compound }}</b>
        <em
          class="pwc-src"
          :class="`is-${observed}`"
        >{{ PITWALL_CONCEPT_SOURCE_LABELS[observed] }}</em>
      </span>
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
      <span class="pwc-pit-car">
        <b>{{ car.pressure.toFixed(1) }}</b>
        <em
          class="pwc-src"
          :class="`is-${observed}`"
        >{{ PITWALL_CONCEPT_SOURCE_LABELS[observed] }}</em>
      </span>
    </div>

    <div class="pwc-pit-row">
      <span>Sostituisci freni</span>
      <PitwallToggleField
        v-model="strategy.brakes"
        label="Sostituisci freni"
        hide-label
      />
      <span class="pwc-pit-car">
        <b>{{ yesNo(car.brakes) }}</b>
        <em class="pwc-src is-order">{{ PITWALL_CONCEPT_SOURCE_LABELS.order }}</em>
      </span>
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
      <span class="pwc-pit-car">
        <b>{{ car.driver }}</b>
        <em class="pwc-src is-order">{{ PITWALL_CONCEPT_SOURCE_LABELS.order }}</em>
      </span>
    </div>

    <div class="pwc-pit-row is-group">
      <span>Riparazioni</span>
    </div>

    <div class="pwc-pit-row is-sub">
      <span>Sospensioni</span>
      <PitwallToggleField
        v-model="strategy.suspension"
        label="Sospensioni"
        hide-label
      />
      <span class="pwc-pit-car">
        <b>{{ yesNo(car.suspension) }}</b>
        <em class="pwc-src is-order">{{ PITWALL_CONCEPT_SOURCE_LABELS.order }}</em>
      </span>
    </div>

    <div class="pwc-pit-row is-sub">
      <span>Carrozzeria</span>
      <PitwallToggleField
        v-model="strategy.bodywork"
        label="Carrozzeria"
        hide-label
      />
      <span class="pwc-pit-car">
        <b>{{ yesNo(car.bodywork) }}</b>
        <em class="pwc-src is-order">{{ PITWALL_CONCEPT_SOURCE_LABELS.order }}</em>
      </span>
    </div>

    <div class="pwc-pit-row is-total">
      <span>Tempo stop stimato</span>
      <b>{{ stopTime }}</b>
      <span class="pwc-pit-car">
        <b>—</b>
        <em class="pwc-src is-calculated">CALCOLATO</em>
      </span>
    </div>

    <PitwallConceptOrder
      :status="orderStatus"
      :outcome="outcome"
      :blocked="blocked"
      @send="send()"
    />
  </section>
</template>

<style lang="scss">
@use "@/assets/scss/variables" as *;

/* Righe e intestazione condividono le stesse tre colonne: i valori restano
   incolonnati sotto Campo / Strategia / In macchina. */
.pwc-pit-head,
.pwc-pit-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 180px 150px;
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

/* La colonna "In macchina" porta il valore e da dove viene. Senza la seconda
   riga, un dato dedotto dall'ultimo ordine si legge come se fosse letto
   adesso, che e' la bugia che questa colonna esiste per non dire. */
.pwc-pit-car {
  display: grid;
  justify-items: end;
  gap: 2px;
  text-align: right;
}
.pwc-pit-car > b {
  color: $text-secondary;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.pwc-src {
  padding: 1px 6px;
  border: 1px solid var(--pwc-line);
  border-radius: 4px;
  color: $text-muted;
  font-size: 9px;
  font-style: normal;
  font-weight: 700;
  letter-spacing: 0.06em;
  white-space: nowrap;
}
.pwc-src.is-live { border-color: rgba(74, 222, 128, 0.4); color: #4ade80; }
.pwc-src.is-stale { border-color: rgba(245, 158, 11, 0.45); color: #f59e0b; }
.pwc-src.is-order { border-color: rgba(96, 165, 250, 0.4); color: #60a5fa; }

/* La freschezza si legge in cima e si puo' alternare: e' l'unico modo di
   guardare lo stato "dato vecchio" in un prototipo senza telemetria. */
.pwc-fresh {
  padding: 2px 8px;
  border: 1px solid var(--pwc-line);
  border-radius: 6px;
  background: none;
  color: $text-secondary;
  font-size: 12px;
  cursor: pointer;
}
.pwc-fresh.is-stale { border-color: rgba(245, 158, 11, 0.45); color: #f59e0b; }

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


@media (max-width: 760px) {
  .pwc-pit-head,
  .pwc-pit-row {
    grid-template-columns: minmax(0, 1fr) 132px 92px;
    gap: 10px;
    padding: 0 14px;
  }
}
</style>
