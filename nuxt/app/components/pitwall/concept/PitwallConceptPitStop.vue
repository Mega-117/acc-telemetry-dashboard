<script setup lang="ts">
// La decisione da mandare alla macchina (PIP-369, PIP-360): tutto il Pit MFD
// tranne il limitatore, che e' il limite dei 50 km/h e non una scelta del
// muretto.
//
// Non ha stato proprio: legge e scrive il pit stop dello store, che nel vero
// e' `usePitwallController` - la stessa logica della vista Legacy, in un posto
// solo. `null` vuol dire **non toccare**, ed e' un terzo stato, non un "no":
// con una casella booleana non esisteva modo di spegnere una riparazione gia'
// attiva. Il preset parte da "Off" perche' quella riga riscrive carburante,
// gomme e pressioni in blocco.
import { computed } from "vue";
// Il controllo a tre stati e' quello vero della Classica, non una copia: la
// distinzione fra "spegni" e "non toccare" e' logica di prodotto, e averla in
// due posti vorrebbe dire vederla divergere.
import PitwallToggleField from "~/components/pitwall/PitwallToggleField.vue";
import PitwallConceptOrder from "~/components/pitwall/concept/PitwallConceptOrder.vue";
import { usePitwallStore } from "~/composables/usePitwallStore";
import {
  PITWALL_CONCEPT_SOURCE_LABELS,
  pitwallConceptFreshness,
} from "~/utils/pitwallConcept";
import type { PitwallConceptSource } from "~/utils/pitwallConcept";
// Le stesse funzioni pure della vista Legacy: il tempo della sosta e le tre
// risposte di una casella non hanno una seconda formula qui.
import {
  PITWALL_WHEELS,
  clampFuel,
  clampTyreSet,
  formatStopDuration,
  formatToggle,
  stepFuel,
  stepTyreSet,
} from "~/utils/pitwallPresentation";

const { stop } = usePitwallStore();

/**
 * Le due righe che "Sostituisci freni" apre: davanti e dietro, da 1 a 4.
 * Stanno in una lista sola perche' sono la stessa riga due volte.
 */
const BRAKE_ROWS = [
  { field: "brakeFront", which: "front", label: "Freno anteriore" },
  { field: "brakeRear", which: "rear", label: "Freno posteriore" },
] as const;

/**
 * Da dove viene ogni riga della colonna "In macchina".
 *
 * Non e' decorazione: ACC rilegge carburante, set, mescola e pressioni, e
 * basta. Tutto il resto lo sappiamo solo perche' l'abbiamo chiesto noi, e il
 * preset non lo sappiamo affatto. Le stesse quattro parole della Legacy.
 */
const observed = computed<PitwallConceptSource>(() => {
  if (!stop.hasCarSnapshot.value) return "unavailable";
  return pitwallConceptFreshness(stop.presenceAgeSeconds.value ?? Number.POSITIVE_INFINITY);
});
const freshness = computed(() => (
  stop.presenceAgeSeconds.value == null
    ? "In attesa dei dati macchina"
    : `Dati macchina di ${stop.presenceAgeSeconds.value}s fa`
));

/**
 * Le due righe delle mescole esistono nel menu finche' la casella e' accesa,
 * e la casella resta accesa dopo un ordine: non e' una richiesta che si
 * consuma. Quindi si mostrano anche quando la richiesta e' tornata a "non
 * toccare", purche' l'ultimo ordine le avesse accese - altrimenti per
 * ritoccare una mescola bisognerebbe rimandare i freni ogni volta.
 */
const brakeRowsVisible = computed(() => (
  stop.brakes.value === true || (stop.brakes.value == null && last.value?.brakes === true)
));

const yesNo = (value: boolean | null | undefined) => formatToggle(value ?? null);
/** Le caselle che ACC non rilegge: in macchina c'e' cio' che abbiamo chiesto l'ultima volta. */
const last = computed(() => stop.lastOrder.value);
const stopTime = computed(() => formatStopDuration(stop.stopEstimate.value.seconds));
/** L'ultimo pilota chiesto, per nome; senza un ordine non si inventa nulla. */
const carDriver = computed(() => (
  last.value?.driverId == null
    ? "—"
    : stop.drivers.value.find(driver => driver.id === last.value?.driverId)?.name ?? `Pilota ${last.value.driverId}`
));

function stepAll(direction: 1 | -1) {
  for (const wheel of PITWALL_WHEELS) stop.adjustPressure(wheel, direction);
}
</script>

<template>
  <section class="pwc-panel">
    <header class="pwc-panel__head">
      <h2>Pit stop</h2>
      <span
        class="pwc-fresh"
        :class="`is-${observed}`"
      >
        {{ freshness }}
      </span>
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
          @click="stop.stepPitStrategy(-1)"
        >
          −
        </button>
        <b>{{ stop.pitStrategy.value ?? "Off" }}</b>
        <button
          type="button"
          aria-label="Preset successivo"
          @click="stop.stepPitStrategy(1)"
        >
          +
        </button>
      </div>
      <span class="pwc-pit-car">
        <b>{{ stop.car.value.pitStrategy ?? "—" }}</b>
        <em class="pwc-src is-unavailable">{{ PITWALL_CONCEPT_SOURCE_LABELS.unavailable }}</em>
      </span>
    </div>

    <div class="pwc-pit-row">
      <span>Carburante</span>
      <div class="pwc-step">
        <button
          type="button"
          aria-label="Meno carburante"
          @click="stop.fuelLiters.value = stepFuel(stop.fuelLiters.value, -1)"
        >
          −
        </button>
        <b>{{ stop.fuelLiters.value }} L</b>
        <button
          type="button"
          aria-label="Più carburante"
          @click="stop.fuelLiters.value = stepFuel(stop.fuelLiters.value, 1)"
        >
          +
        </button>
      </div>
      <span class="pwc-pit-car">
        <b>{{ clampFuel(stop.car.value.fuelLiters) }} L</b>
        <em
          class="pwc-src"
          :class="`is-${observed}`"
        >{{ PITWALL_CONCEPT_SOURCE_LABELS[observed] }}</em>
      </span>
    </div>

    <div class="pwc-pit-row">
      <span>Cambio gomme</span>
      <PitwallToggleField
        v-model="stop.changeTyres.value"
        label="Cambio gomme"
        hide-label
      />
      <span class="pwc-pit-car">
        <b>{{ yesNo(last?.changeTyres) }}</b>
        <em class="pwc-src is-order">{{ PITWALL_CONCEPT_SOURCE_LABELS.order }}</em>
      </span>
    </div>

    <div class="pwc-pit-row">
      <span>Set pneumatici</span>
      <div class="pwc-step">
        <button
          type="button"
          aria-label="Set precedente"
          @click="stop.tyreSet.value = stepTyreSet(stop.tyreSet.value, -1)"
        >
          −
        </button>
        <b>{{ stop.tyreSet.value }}</b>
        <button
          type="button"
          aria-label="Set successivo"
          @click="stop.tyreSet.value = stepTyreSet(stop.tyreSet.value, 1)"
        >
          +
        </button>
      </div>
      <span class="pwc-pit-car">
        <b>{{ clampTyreSet(stop.car.value.tyreSet) }}</b>
        <em
          class="pwc-src"
          :class="`is-${observed}`"
        >{{ PITWALL_CONCEPT_SOURCE_LABELS[observed] }}</em>
      </span>
    </div>

    <div class="pwc-pit-row">
      <span>Mescola</span>
      <select
        :value="stop.compound.value"
        aria-label="Mescola"
        @change="stop.setCompound(($event.target as HTMLSelectElement).value)"
      >
        <option value="dry">Dry</option>
        <option value="wet">Wet</option>
      </select>
      <span class="pwc-pit-car">
        <b>{{ stop.car.value.compound === "wet" ? "Wet" : "Dry" }}</b>
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
      v-for="wheel in PITWALL_WHEELS"
      :key="wheel"
      class="pwc-pit-row is-sub"
    >
      <span>{{ wheel }}</span>
      <div class="pwc-step">
        <button
          type="button"
          :aria-label="`Abbassa ${wheel}`"
          @click="stop.adjustPressure(wheel, -1)"
        >
          −
        </button>
        <b>{{ stop.pressures.value[wheel].toFixed(1) }}</b>
        <button
          type="button"
          :aria-label="`Alza ${wheel}`"
          @click="stop.adjustPressure(wheel, 1)"
        >
          +
        </button>
      </div>
      <span class="pwc-pit-car">
        <b>{{ stop.car.value.pressures[wheel].toFixed(1) }}</b>
        <em
          class="pwc-src"
          :class="`is-${observed}`"
        >{{ PITWALL_CONCEPT_SOURCE_LABELS[observed] }}</em>
      </span>
    </div>

    <div class="pwc-pit-row">
      <span>Sostituisci freni</span>
      <PitwallToggleField
        v-model="stop.brakes.value"
        label="Sostituisci freni"
        hide-label
      />
      <span class="pwc-pit-car">
        <b>{{ yesNo(last?.brakes) }}</b>
        <em class="pwc-src is-order">{{ PITWALL_CONCEPT_SOURCE_LABELS.order }}</em>
      </span>
    </div>

    <!-- Le due mescole dei freni compaiono solo con la sostituzione accesa:
         sono le righe che quella casella apre nel Pit MFD, e senza di lei nel
         menu non esistono. Mostrarle sempre inviterebbe a impostare una cosa
         che non si puo' mandare. -->
    <template v-if="brakeRowsVisible">
      <div
        v-for="brake in BRAKE_ROWS"
        :key="brake.field"
        class="pwc-pit-row is-sub"
      >
        <span>{{ brake.label }}</span>
        <div class="pwc-step">
          <button
            type="button"
            :aria-label="`${brake.label}: mescola precedente`"
            @click="stop.stepBrakeCompound(brake.which, -1)"
          >
            −
          </button>
          <b>{{ stop[brake.field].value ?? "Non toccare" }}</b>
          <button
            type="button"
            :aria-label="`${brake.label}: mescola successiva`"
            @click="stop.stepBrakeCompound(brake.which, 1)"
          >
            +
          </button>
        </div>
        <span class="pwc-pit-car">
          <b>{{ last?.[brake.field] ?? "—" }}</b>
          <em class="pwc-src is-order">{{ PITWALL_CONCEPT_SOURCE_LABELS.order }}</em>
        </span>
      </div>
    </template>

    <div class="pwc-pit-row">
      <span>Prossimo pilota</span>
      <select
        v-model="stop.driverId.value"
        aria-label="Prossimo pilota"
      >
        <option :value="null">Nessun cambio</option>
        <option
          v-for="driver in stop.drivers.value"
          :key="driver.id"
          :value="driver.id"
        >
          {{ driver.name }}
        </option>
      </select>
      <span class="pwc-pit-car">
        <b>{{ carDriver }}</b>
        <em class="pwc-src is-order">{{ PITWALL_CONCEPT_SOURCE_LABELS.order }}</em>
      </span>
    </div>

    <div class="pwc-pit-row is-group">
      <span>Riparazioni</span>
    </div>

    <div class="pwc-pit-row is-sub">
      <span>Sospensioni</span>
      <PitwallToggleField
        v-model="stop.repairSuspension.value"
        label="Sospensioni"
        hide-label
      />
      <span class="pwc-pit-car">
        <b>{{ yesNo(last?.repairSuspension) }}</b>
        <em class="pwc-src is-order">{{ PITWALL_CONCEPT_SOURCE_LABELS.order }}</em>
      </span>
    </div>

    <div class="pwc-pit-row is-sub">
      <span>Carrozzeria</span>
      <PitwallToggleField
        v-model="stop.repairBodywork.value"
        label="Carrozzeria"
        hide-label
      />
      <span class="pwc-pit-car">
        <b>{{ yesNo(last?.repairBodywork) }}</b>
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
      :status="stop.orderStatus.value"
      :reason="stop.orderReason.value"
      :outcomes="stop.fieldOutcomes.value"
      :blocked="stop.blockedReason.value"
      @send="stop.sendToCar()"
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

/* La freschezza si legge in cima, con lo stesso colore delle righe. */
.pwc-fresh {
  padding: 2px 8px;
  border: 1px solid var(--pwc-line);
  border-radius: 6px;
  color: $text-secondary;
  font-size: 12px;
}
.pwc-fresh.is-live { border-color: rgba(74, 222, 128, 0.4); color: #4ade80; }
.pwc-fresh.is-stale { border-color: rgba(245, 158, 11, 0.45); color: #f59e0b; }

@media (max-width: 760px) {
  .pwc-pit-head,
  .pwc-pit-row {
    grid-template-columns: minmax(0, 1fr) 132px 92px;
    gap: 10px;
    padding: 0 14px;
  }
}
</style>
