<script setup lang="ts">
// La gara del prototipo (PIP-369): timing, pista e pit stop.
// Nessun servizio reale: valori finti, stato locale, niente invio vero.
import { reactive, ref } from "vue";
import {
  PITWALL_CONCEPT_DEFAULT_PRESSURES,
  pitwallConceptInitialsById,
  pitwallConceptNicknameById,
  stepPitwallConceptPressure,
} from "~/utils/pitwallConcept";
import type { PitwallConceptLiveTab } from "~/utils/pitwallConcept";

defineEmits<{ back: [] }>();

const liveTab = ref<PitwallConceptLiveTab>("timing");
const guestOpen = ref(false);
const guestId = ref("alessandro");
const sent = ref(false);

const pressures = reactive<Record<"FL" | "FR" | "RL" | "RR", number>>({
  ...PITWALL_CONCEPT_DEFAULT_PRESSURES,
});
const strategy = reactive({
  fuel: 0,
  tyres: false,
  tyreSet: 1,
  compound: "Dry",
  brakes: false,
  driver: "Nessun cambio",
});

function stepAll(step: 1 | -1) {
  for (const wheel of ["FL", "FR", "RL", "RR"] as const) {
    pressures[wheel] = stepPitwallConceptPressure(pressures[wheel], step);
  }
}
</script>

<template>
  <div class="pwc-live">
    <header class="pwc-command">
      <button
        type="button"
        class="pwc-back"
        @click="$emit('back')"
      >
        ← Pit Wall
      </button>
      <div class="pwc-command__car">
        <h1>#47 Ferrari 296 GT3</h1>
        <p>Nürburgring · Gara</p>
      </div>
      <div class="pwc-command__stats">
        <span><small>Posizione</small><b>P6</b></span>
        <span><small>Giro</small><b>42/67</b></span>
        <span><small>Stint</small><b>38:14</b></span>
      </div>
    </header>

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

    <div class="pwc-live-grid">
      <main class="pwc-panel">
        <header class="pwc-panel__head">
          <nav class="pwc-tabs">
            <button
              type="button"
              :class="{ 'is-active': liveTab === 'timing' }"
              @click="liveTab = 'timing'"
            >
              Timing
            </button>
            <button
              type="button"
              :class="{ 'is-active': liveTab === 'track' }"
              @click="liveTab = 'track'"
            >
              Pista
            </button>
          </nav>
        </header>

        <table
          v-if="liveTab === 'timing'"
          class="pwc-table"
        >
          <thead>
            <tr><th>Pos</th><th>Pilota</th><th>Gap</th><th>Ultimo giro</th></tr>
          </thead>
          <tbody>
            <tr><td>P5</td><td>A. Costa</td><td>+2.341</td><td>1:54.682</td></tr>
            <tr class="is-me">
              <td>P6</td><td>M. Rossi</td><td>—</td><td>1:55.104</td>
            </tr>
            <tr><td>P7</td><td>G. Neri</td><td>−1.884</td><td>1:55.402</td></tr>
            <tr><td>P8</td><td>L. Ferri</td><td>−6.219</td><td>1:55.938</td></tr>
          </tbody>
        </table>

        <div
          v-else
          class="pwc-track"
        >
          <svg
            viewBox="0 0 320 170"
            aria-label="Mappa pista schematica"
          >
            <path d="M28 132C18 92 44 42 96 34c58-9 74 34 122 30 34-3 52-22 66-6 16 18 2 52-30 62-46 14-70-14-114-6-40 7-52 42-84 34-16-4-24-10-28-16Z" />
            <circle
              cx="198"
              cy="60"
              r="9"
            />
          </svg>
          <ul class="pwc-track__list">
            <li><b>P5</b> A. Costa</li>
            <li class="is-me">
              <b>P6</b> M. Rossi
            </li>
            <li><b>P7</b> G. Neri</li>
          </ul>
        </div>

        <div class="pwc-metrics">
          <div><small>Passo 5 giri</small><b>1:55.386</b></div>
          <div><small>Carburante</small><b>22.4 L</b></div>
          <div><small>Autonomia</small><b>10 giri</b></div>
        </div>
      </main>

      <aside class="pwc-panel">
        <header class="pwc-panel__head">
          <h2>Pit stop</h2>
          <small>Finestra giri 45–49</small>
        </header>

        <div class="pwc-pit-head">
          <b>Campo</b><b>Strategia</b><b>In macchina</b>
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
          <b>0 L</b>
        </div>

        <div class="pwc-pit-row">
          <span>Cambio gomme</span>
          <label>
            <input
              v-model="strategy.tyres"
              type="checkbox"
            />{{ strategy.tyres ? "Sì" : "No" }}
          </label>
          <b>No</b>
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
          <b>1</b>
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
          <b>Dry</b>
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
          <b>25.0</b>
        </div>

        <div class="pwc-pit-row">
          <span>Freni</span>
          <label>
            <input
              v-model="strategy.brakes"
              type="checkbox"
            />{{ strategy.brakes ? "Sì" : "No" }}
          </label>
          <b>No</b>
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
          <b>Nessun cambio</b>
        </div>

        <button
          type="button"
          class="pwc-send"
          :class="{ 'is-sent': sent }"
          @click="sent = true"
        >
          {{ sent ? "Strategia inviata" : "Invia strategia" }}
        </button>
      </aside>
    </div>

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

/* Stili della sola gara. Le basi condivise (bottoni, avatar, tab, persone)
   vivono in PitwallConcept.vue: qui non si ridefiniscono. */
.pwc-live { display: grid; gap: 12px; width: min(1480px, 100%); margin: 0 auto; }

.pwc-command {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: end;
  gap: 20px;
  padding: 18px 24px;
  border: 1px solid var(--pwc-line);
  border-radius: 12px;
  background: var(--pwc-raised);
}
.pwc-command .pwc-back { grid-column: 1; justify-self: start; }
.pwc-command__car { grid-column: 1; }
.pwc-command__car p { margin: 4px 0 0; color: $text-secondary; font-size: 14px; }
.pwc-command__stats { grid-column: 2; grid-row: 1 / 3; display: flex; gap: 10px; }
.pwc-command__stats span {
  display: grid;
  gap: 4px;
  place-items: center;
  min-width: 92px;
  padding: 10px 12px;
  border: 1px solid var(--pwc-line);
  border-radius: 9px;
}
.pwc-command__stats small { font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; }
.pwc-command__stats b { font-size: 20px; font-variant-numeric: tabular-nums; }

.pwc-wall {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 40px;
  padding: 16px 24px;
  border: 1px solid var(--pwc-line);
  border-radius: 12px;
  background: var(--pwc-raised);
}
.pwc-wall .pwc-btn { margin-left: auto; }

/* align-items: start, cosi' la colonna piu' corta non si allunga a vuoto. */
.pwc-live-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(440px, 0.72fr);
  align-items: start;
  gap: 12px;
}

.pwc-panel {
  border: 1px solid var(--pwc-line);
  border-radius: 12px;
  background: var(--pwc-raised);
  overflow: hidden;
}
.pwc-panel__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 16px;
}
.pwc-panel__head .pwc-tabs { border: 0; padding: 0; }

.pwc-table { width: calc(100% - 32px); margin: 0 16px 16px; border-collapse: collapse; }
.pwc-table th,
.pwc-table td {
  height: 42px;
  padding: 0 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.07);
  text-align: left;
  font-variant-numeric: tabular-nums;
}
.pwc-table th { color: $text-secondary; font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; }
.pwc-table tr.is-me { color: $racing-gold; }

.pwc-track { display: grid; grid-template-columns: minmax(0, 1fr) 160px; gap: 16px; padding: 0 16px 16px; }
.pwc-track svg { width: 100%; height: 200px; }
.pwc-track path { fill: none; stroke: #ff3918; stroke-width: 5; stroke-linecap: round; }
.pwc-track circle { fill: $racing-gold; stroke: #0a0d13; stroke-width: 3; }
.pwc-track__list { display: grid; gap: 8px; align-content: center; margin: 0; padding: 0; list-style: none; font-size: 13px; }
.pwc-track__list b { display: inline-block; width: 32px; color: $text-secondary; }
.pwc-track__list li.is-me { color: $racing-gold; }
.pwc-track__list li.is-me b { color: inherit; }

.pwc-metrics { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; padding: 0 16px 16px; }
.pwc-metrics div {
  display: grid;
  gap: 6px;
  place-items: center;
  padding: 14px 8px;
  border: 1px solid var(--pwc-line);
  border-radius: 9px;
}
.pwc-metrics small { font-size: 10px; letter-spacing: 0.06em; text-transform: uppercase; }
.pwc-metrics b { font-size: 20px; font-variant-numeric: tabular-nums; }

.pwc-pit-head,
.pwc-pit-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 150px 108px;
  align-items: center;
  gap: 12px;
  min-height: 38px;
  padding: 0 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.07);
  font-size: 13px;
}
.pwc-pit-head { min-height: 34px; color: $text-secondary; font-size: 10px; letter-spacing: 0.06em; text-transform: uppercase; }
.pwc-pit-row.is-sub > span { padding-left: 20px; color: $text-secondary; }
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
  height: 30px;
  padding: 0 8px;
  border: 1px solid var(--pwc-line);
  border-radius: 6px;
  background: #0b1119;
  color: #fff;
}

.pwc-step {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr) 34px;
  height: 30px;
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
  width: calc(100% - 32px);
  min-height: 46px;
  margin: 16px;
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

@media (max-width: 1180px) {
  .pwc-live-grid { grid-template-columns: 1fr; }
}

@media (max-width: 760px) {
  .pwc-command { grid-template-columns: 1fr; }
  .pwc-command__stats { grid-column: 1; grid-row: auto; }
  .pwc-command__stats span { flex: 1; min-width: 0; }
  .pwc-track { grid-template-columns: 1fr; }
  .pwc-metrics { grid-template-columns: 1fr; }
  .pwc-pit-head,
  .pwc-pit-row { grid-template-columns: minmax(0, 1fr) 120px 66px; }
}
</style>
