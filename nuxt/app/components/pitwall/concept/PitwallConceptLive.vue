<script setup lang="ts">
// La schermata di assistenza del prototipo (PIP-369): chi c'e' al volante e al
// muretto, e cosa si manda alla macchina. Niente header di gara e niente
// colonna timing/pista: il muretto guarda ACC per quelli, qui decide il pit
// stop. Nessun servizio reale: valori finti, stato locale, niente invio vero.
import { computed, reactive, ref } from "vue";
import {
  PITWALL_CONCEPT_DEFAULT_PRESSURES,
  pitwallConceptInitialsById,
  pitwallConceptNicknameById,
  stepPitwallConceptPressure,
} from "~/utils/pitwallConcept";
// Il tempo della sosta non si ricalcola qui: e' la stessa funzione pura della
// vista classica. Resta senza I/O, quindi il prototipo non tocca servizi reali.
import { estimatePitStop, formatStopDuration, type PitwallPlan } from "~/utils/pitwallPresentation";

defineEmits<{ back: [] }>();

const guestOpen = ref(false);
const guestId = ref("alessandro");
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

/** Lo stato mock nella forma che la logica pura della sosta si aspetta. */
function toPlan(
  source: typeof strategy | typeof car,
  wheels: Record<"FL" | "FR" | "RL" | "RR", number>,
): PitwallPlan {
  return {
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
  <div class="pwc-live">
    <button
      type="button"
      class="pwc-back pwc-live__back"
      @click="$emit('back')"
    >
      ← Pit Wall
    </button>

    <section class="pwc-wall">
      <span class="pwc-role">
        <small>Al volante</small>
        <b><span class="pwc-avatar is-small">MI</span>mariorossi</b>
        <em>applica lui la strategia</em>
      </span>
      <span class="pwc-role">
        <small>Al muretto</small>
        <b>
          <span class="pwc-avatar is-small">ES</span>enricos
          <span class="pwc-avatar is-small">LB</span>lucab
        </b>
      </span>
      <button
        type="button"
        class="pwc-btn"
        @click="guestOpen = true"
      >
        + Ospite
      </button>
    </section>

    <section class="pwc-panel">
      <header class="pwc-panel__head">
        <h2>Pit stop</h2>
        <small>Finestra giri 45–49</small>
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

      <button
        type="button"
        class="pwc-send"
        :class="{ 'is-sent': sent }"
        @click="sent = true"
      >
        {{ sent ? "Strategia inviata" : "Invia strategia" }}
      </button>
    </section>

    <div
      v-if="guestOpen"
      class="pwc-modal"
      @click.self="guestOpen = false"
    >
      <section
        class="pwc-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pwc-guest-title"
      >
        <button
          type="button"
          class="pwc-close"
          aria-label="Chiudi"
          @click="guestOpen = false"
        >
          ×
        </button>
        <h2 id="pwc-guest-title">
          Ospite per oggi
        </h2>
        <p>Vede la gara e può mandare strategie. Scade a mezzanotte.</p>
        <ul class="pwc-people">
          <li
            v-for="guest in ['alessandro', 'martina']"
            :key="guest"
            class="pwc-person"
          >
            <span class="pwc-avatar">{{ pitwallConceptInitialsById(guest) }}</span>
            <strong class="pwc-person__name">{{ pitwallConceptNicknameById(guest) }}</strong>
            <button
              type="button"
              class="pwc-btn"
              :class="{ 'is-primary': guestId === guest }"
              @click="guestId = guest"
            >
              {{ guestId === guest ? "Selezionato" : "Scegli" }}
            </button>
          </li>
        </ul>
        <button
          type="button"
          class="pwc-send"
          @click="guestOpen = false"
        >
          Invita
        </button>
      </section>
    </div>
  </div>
</template>

<style lang="scss">
@use "@/assets/scss/variables" as *;

/* Stili della sola assistenza. Le basi condivise (bottoni, avatar, persone)
   vivono in PitwallConcept.vue: qui non si ridefiniscono.
   Una colonna sola e stretta: la schermata ha un contenuto solo, il pit stop. */
.pwc-live {
  display: grid;
  gap: 16px;
  width: min(820px, 100%);
  margin: 0 auto;
}
.pwc-live__back { justify-self: start; padding: 4px 0; }

.pwc-wall {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 32px;
  padding: 16px 20px;
  border: 1px solid var(--pwc-line);
  border-radius: 12px;
  background: var(--pwc-raised);
}
/* I due ruoli partono dall'alto: le etichette restano sulla stessa riga anche
   quando sotto al volante c'e' una frase in piu'. */
.pwc-wall .pwc-role { align-self: start; }
.pwc-wall .pwc-btn { margin-left: auto; }

.pwc-panel {
  border: 1px solid var(--pwc-line);
  border-radius: 12px;
  background: var(--pwc-raised);
  overflow: hidden;
}
.pwc-panel__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 20px;
}

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
.pwc-send.is-sent { background: rgba(74, 222, 128, 0.18); color: #4ade80; }

.pwc-modal {
  position: fixed;
  z-index: 1000;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(0, 0, 0, 0.7);
}
.pwc-dialog {
  position: relative;
  width: min(480px, 100%);
  padding: 28px;
  border: 1px solid var(--pwc-line);
  border-radius: 14px;
  background: #121820;
}
.pwc-dialog > p { margin: 8px 0 0; color: $text-secondary; font-size: 14px; }
.pwc-dialog .pwc-person { grid-template-columns: 36px minmax(0, 1fr) auto; }
.pwc-dialog .pwc-send { width: 100%; margin: 20px 0 0; }
.pwc-close {
  position: absolute;
  top: 14px;
  right: 16px;
  border: 0;
  background: none;
  color: $text-secondary;
  font-size: 26px;
  line-height: 1;
  cursor: pointer;
}

@media (max-width: 760px) {
  .pwc-wall { gap: 20px; }
  .pwc-wall .pwc-btn { margin-left: 0; }
  .pwc-pit-head,
  .pwc-pit-row {
    grid-template-columns: minmax(0, 1fr) 132px 72px;
    gap: 10px;
    padding: 0 14px;
  }
  .pwc-send { width: calc(100% - 28px); margin: 14px; }
}
</style>
