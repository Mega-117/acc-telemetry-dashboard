<script setup lang="ts">
// ============================================
// PitwallPage - pannello di controllo dell'ingegnere di pista.
//
// Regola di lettura della schermata:
// ogni voce mostra in grande il valore che sto per mandare e in piccolo
// quello che ha adesso la macchina; l'accento compare solo dove differiscono.
//
// Invio: se un pilota collegato e' selezionato, "Invia" manda l'ordine davvero
// e la pagina segue l'esito dichiarato dal suo PC. Senza pilota selezionato la
// pagina resta una bozza locale, e lo dice invece di fingere di aver inviato.
// I valori della macchina sono ancora un segnaposto finche' non arriva la
// telemetria live (PIP-360).
// ============================================

import { computed, onMounted, ref } from 'vue'
import { usePitwallLink } from '~/composables/usePitwallLink'
import { useFirebaseAuth } from '~/composables/useFirebaseAuth'
import PitwallCarCard from '~/components/pitwall/PitwallCarCard.vue'
import PitwallChipGroup from '~/components/pitwall/PitwallChipGroup.vue'
import PitwallOrderBar from '~/components/pitwall/PitwallOrderBar.vue'
import PitwallValueField from '~/components/pitwall/PitwallValueField.vue'
import {
  PITWALL_COMPOUNDS,
  PITWALL_FUEL_MAX_L,
  PITWALL_FUEL_MIN_L,
  PITWALL_PRESSURE_MAX_PSI,
  PITWALL_PRESSURE_MIN_PSI,
  PITWALL_TYRE_SET_MAX,
  PITWALL_TYRE_SET_MIN,
  PITWALL_WHEELS,
  buildPitwallChangeChips,
  buildPitwallEcho,
  clampCompound,
  clampFuel,
  clampPressure,
  clampTyreSet,
  estimatePitStop,
  formatCompound,
  resolvePitwallOrderStatus,
  stepAxle,
  stepFuel,
  stepPressure,
  stepTyreSet,
  wheelLabel,
  type PitwallAxle,
  type PitwallCarState,
  type PitwallCompound,
  type PitwallDriver,
  type PitwallPlan,
  type PitwallWheel,
} from '~/utils/pitwallPresentation'

// ── Dati mockati ────────────────────────────────────────────────
// Nessuna fonte reale: valori finti per disegnare e leggere la schermata.
const drivers: PitwallDriver[] = [
  { id: 'driver-1', name: 'Enrico Sayan' },
  { id: 'driver-2', name: 'Marco Rossi' },
  { id: 'driver-3', name: 'Luca Bianchi' },
  { id: 'driver-4', name: 'Giulia Neri' },
]

const MOCK_CAR: PitwallCarState = {
  pressures: { FL: 24.4, FR: 26.1, RL: 24.8, RR: 25.9 },
  fuelLiters: 42,
  compound: 'dry',
  tyreSet: 3,
  driverId: 'driver-1',
  repairBodywork: false,
  repairSuspension: false,
  inPitLane: false,
}

const FUEL_PRESETS = [30, 50, 70, PITWALL_FUEL_MAX_L]

const axleControls: { axle: PitwallAxle, label: string }[] = [
  { axle: 'front', label: 'ANT' },
  { axle: 'rear', label: 'POST' },
  { axle: 'all', label: 'TUTTE' },
]

// ── Stato macchina (mock) e ordine in composizione ───────────────
const car = ref<PitwallCarState>({ ...MOCK_CAR, pressures: { ...MOCK_CAR.pressures } })

const pressures = ref<Record<PitwallWheel, number>>({ ...MOCK_CAR.pressures })
const fuelLiters = ref(MOCK_CAR.fuelLiters)
const compound = ref<PitwallCompound>(MOCK_CAR.compound)
const tyreSet = ref(MOCK_CAR.tyreSet)
const driverId = ref<string | null>(MOCK_CAR.driverId)
const repairBodywork = ref(MOCK_CAR.repairBodywork)
const repairSuspension = ref(MOCK_CAR.repairSuspension)

const sentPlan = ref<PitwallPlan | null>(null)

const plan = computed<PitwallPlan>(() => ({
  pressures: pressures.value,
  fuelLiters: fuelLiters.value,
  compound: compound.value,
  tyreSet: tyreSet.value,
  driverId: driverId.value,
  repairBodywork: repairBodywork.value,
  repairSuspension: repairSuspension.value,
}))

// ── Confronto ordine <-> macchina: una sola fonte per tutta la pagina ──
const echo = computed(() => buildPitwallEcho(plan.value, car.value, drivers))
const changeChips = computed(() => buildPitwallChangeChips(plan.value, car.value, drivers))
const orderStatus = computed(() => resolvePitwallOrderStatus({
  plan: plan.value,
  car: car.value,
  sentPlan: sentPlan.value,
}))
const stopEstimate = computed(() => estimatePitStop(plan.value, car.value))
const hasChanges = computed(() => changeChips.value.length > 0)

const compoundOptions = computed(() => PITWALL_COMPOUNDS.map(value => ({ value, label: formatCompound(value) })))
const driverOptions = computed(() => [
  { value: null, label: 'Nessun cambio' },
  ...drivers.map(driver => ({ value: driver.id, label: driver.name })),
])

// ── Azioni sull'ordine ──────────────────────────────────────────
function adjustPressure(wheel: PitwallWheel, direction: 1 | -1) {
  pressures.value = { ...pressures.value, [wheel]: stepPressure(pressures.value[wheel], direction) }
}

function setPressure(wheel: PitwallWheel, value: number) {
  pressures.value = { ...pressures.value, [wheel]: clampPressure(value) }
}

function adjustAxle(axle: PitwallAxle, direction: 1 | -1) {
  pressures.value = stepAxle(pressures.value, axle, direction)
}

/** "Ripristina" significa tornare a quello che ha adesso la macchina. */
function resetToCar() {
  pressures.value = { ...car.value.pressures }
  fuelLiters.value = car.value.fuelLiters
  compound.value = car.value.compound
  tyreSet.value = car.value.tyreSet
  driverId.value = car.value.driverId
  repairBodywork.value = car.value.repairBodywork
  repairSuspension.value = car.value.repairSuspension
}

// ── Collegamento reale con il pilota ────────────────────────────
const { currentUser } = useFirebaseAuth()
const link = usePitwallLink({ engineerUid: () => currentUser.value?.uid ?? null })

const showLinkPanel = ref(false)

onMounted(() => {
  void link.refreshPilots()
  void link.refreshIncoming()
})

/** Quello che viaggia davvero: solo i campi che l'applicatore conosce. */
function planPayload(): Record<string, unknown> {
  return {
    fuelLiters: fuelLiters.value,
    tyreSet: tyreSet.value,
    pressures: { ...pressures.value },
    compound: compound.value,
    repairBodywork: repairBodywork.value,
    repairSuspension: repairSuspension.value,
    driverId: driverId.value,
  }
}

/** Quante richieste aspettano una mia decisione. */
const pendingCount = computed(
  () => link.incoming.value.filter(request => request.status === 'pending').length
)

function describeGrantStatus(status: string): string {
  if (status === 'granted') return 'autorizzato'
  if (status === 'pending') return 'in attesa'
  return 'revocato'
}

async function askLink(driverUid: string) {
  await link.requestLink(driverUid)
  link.selectPilot(driverUid)
}

function onPilotChange(event: Event) {
  const value = (event.target as HTMLSelectElement).value
  link.selectPilot(value || null)
}

async function sendToCar() {
  sentPlan.value = { ...plan.value, pressures: { ...pressures.value } }
  // Senza un pilota selezionato non si finge un invio: resta una bozza.
  if (!link.selectedDriverUid.value) return
  await link.sendPlan(planPayload())
}

// ── Comandi finti, solo per leggere la schermata nei suoi stati ──
function mockTogglePitLane() {
  car.value = { ...car.value, inPitLane: !car.value.inPitLane }
}

function mockApplyOrder() {
  if (!sentPlan.value) return
  car.value = { ...sentPlan.value, pressures: { ...sentPlan.value.pressures }, inPitLane: car.value.inPitLane }
}
</script>

<template>
  <!--
    Contenitore dedicato invece di LayoutPageContainer: la pitwall e' una
    console operativa e deve stare in un viewport senza scroll, quindi ha
    meno respiro verticale delle pagine di lettura.
  -->
  <div class="pitwall-page">
    <div class="pitwall">
      <!--
        A chi sto mandando. Senza un pilota selezionato l'ordine resta una
        bozza, e va detto qui invece di scoprirlo dopo aver premuto Invia.
      -->
      <section class="link-bar">
        <span class="link-bar__label">Pilota</span>

        <select
          class="link-bar__select"
          :value="link.selectedDriverUid.value ?? ''"
          aria-label="Pilota da assistere"
          @change="onPilotChange"
        >
          <option value="">Nessuno — l'ordine resta una bozza</option>
          <option
            v-for="pilot in link.pilots.value"
            :key="pilot.driverUid"
            :value="pilot.driverUid"
          >
            {{ pilot.nickname }}{{ pilot.reachable ? ' — in pista' : ' — non raggiungibile' }}
          </option>
        </select>

        <button
          type="button"
          class="link-bar__refresh"
          :disabled="link.loading.value"
          @click="link.refreshPilots()"
        >
          {{ link.loading.value ? 'Aggiorno…' : 'Aggiorna' }}
        </button>

        <span
          v-if="link.orderStatus.value"
          class="link-bar__state"
          :class="{ 'link-bar__state--problem': link.orderProgress.value.problem }"
        >
          {{ link.orderProgress.value.label }}
          <template v-if="link.orderReason.value"> — {{ link.orderReason.value }}</template>
        </span>

        <span v-if="link.lastError.value" class="link-bar__state link-bar__state--problem">
          {{ link.lastError.value }}
        </span>

        <button
          type="button"
          class="link-bar__refresh link-bar__toggle"
          :aria-expanded="showLinkPanel"
          @click="showLinkPanel = !showLinkPanel"
        >
          Collegamenti
          <span v-if="pendingCount" class="link-bar__badge">{{ pendingCount }}</span>
        </button>
      </section>

      <!--
        Le due facce del collegamento nello stesso posto: chi assisto io, e chi
        ha chiesto di assistere me. Tenerle separate in due pagine avrebbe
        costretto a ricordare in quale ruolo si sta.
      -->
      <section v-if="showLinkPanel" class="links">
        <div class="links__col">
          <h3 class="links__title">Chiedi di assistere un pilota</h3>
          <div class="links__row">
            <input
              v-model="link.searchTerm.value"
              class="links__input"
              type="search"
              placeholder="Soprannome del pilota"
              aria-label="Cerca un pilota per soprannome"
              @keyup.enter="link.search()"
            >
            <button type="button" class="links__btn" @click="link.search()">Cerca</button>
          </div>

          <p v-if="link.notice.value" class="links__note">{{ link.notice.value }}</p>

          <ul v-if="link.searchResults.value.length" class="links__list">
            <li v-for="found in link.searchResults.value" :key="found.uid" class="links__item">
              <span class="links__name">{{ found.nickname }}</span>
              <button type="button" class="links__btn" @click="askLink(found.uid)">Chiedi</button>
              <button type="button" class="links__btn links__btn--ghost" @click="link.preAuthorise(found.uid)">
                Pre-autorizza
              </button>
            </li>
          </ul>
        </div>

        <div class="links__col">
          <h3 class="links__title">Chi vuole assistere me</h3>
          <p v-if="!link.incoming.value.length" class="links__note">Nessuna richiesta.</p>
          <ul v-else class="links__list">
            <li v-for="request in link.incoming.value" :key="request.engineerUid" class="links__item">
              <span class="links__name">{{ request.nickname || request.engineerUid }}</span>
              <span class="links__status" :class="`links__status--${request.status}`">
                {{ describeGrantStatus(request.status) }}
              </span>
              <button
                v-if="request.status !== 'granted'"
                type="button"
                class="links__btn"
                @click="link.decide(request.engineerUid, 'granted')"
              >
                Autorizza
              </button>
              <button
                v-if="request.status === 'granted'"
                type="button"
                class="links__btn links__btn--ghost"
                @click="link.decide(request.engineerUid, 'revoked')"
              >
                Revoca
              </button>
            </li>
          </ul>
        </div>
      </section>

      <PitwallOrderBar
        :status="orderStatus"
        :chips="changeChips"
        :stop="stopEstimate"
        :can-send="hasChanges"
        @send="sendToCar"
      />

      <div class="grid">
        <!-- Colonna larga: cio' che si cambia a ogni sosta -->
        <div class="col col--order">
          <section class="card">
            <div class="card__head">
              <h2>Pressioni</h2>
              <div class="quick">
                <div
                  v-for="control in axleControls"
                  :key="control.axle"
                  class="axle"
                >
                  <button
                    type="button"
                    :aria-label="`Diminuisci pressioni ${control.label}`"
                    @click="adjustAxle(control.axle, -1)"
                  >
                    −
                  </button>
                  <span>{{ control.label }}</span>
                  <button
                    type="button"
                    :aria-label="`Aumenta pressioni ${control.label}`"
                    @click="adjustAxle(control.axle, 1)"
                  >
                    +
                  </button>
                </div>

                <button
                  type="button"
                  class="ghost"
                  title="Riporta l’ordine ai valori attualmente in macchina"
                  :disabled="!hasChanges"
                  @click="resetToCar"
                >
                  Riallinea
                </button>
              </div>
            </div>

            <div class="wheels">
              <PitwallValueField
                v-for="wheel in PITWALL_WHEELS"
                :key="wheel"
                :title="wheel"
                :input-label="`Pressione ${wheelLabel(wheel)} in PSI`"
                :value="pressures[wheel]"
                :min="PITWALL_PRESSURE_MIN_PSI"
                :max="PITWALL_PRESSURE_MAX_PSI"
                :step="0.1"
                :decimals="1"
                unit="PSI"
                :echo="echo[wheel]"
                @step="adjustPressure(wheel, $event)"
                @update:value="setPressure(wheel, $event)"
              />
            </div>
          </section>

          <section class="card">
            <!-- "Carburante" sarebbe la terza etichetta per lo stesso numero,
                 dopo "In uscita dai box" e il valore stesso. -->
            <div class="card__head">
              <h2>In uscita dai box</h2>
              <div class="quick">
                <button
                  v-for="preset in FUEL_PRESETS"
                  :key="preset"
                  type="button"
                  :class="['ghost', { 'ghost--active': fuelLiters === preset }]"
                  @click="fuelLiters = clampFuel(preset)"
                >
                  {{ preset === PITWALL_FUEL_MAX_L ? 'Pieno' : `${preset} L` }}
                </button>
              </div>
            </div>

            <PitwallValueField
              input-label="Carburante in litri"
              size="lg"
              unit="L"
              :value="fuelLiters"
              :min="PITWALL_FUEL_MIN_L"
              :max="PITWALL_FUEL_MAX_L"
              :echo="echo.fuel"
              @step="fuelLiters = stepFuel(fuelLiters, $event)"
              @update:value="fuelLiters = clampFuel($event)"
            />

            <!-- Niente slider: stepper e preset coprono gia' sia il ritocco
                 fine sia il salto grosso. Un terzo controllo per lo stesso
                 valore e' solo altezza sprecata. -->
          </section>
        </div>

        <!-- Colonna stretta: cio' che si cambia di rado -->
        <div class="col col--side">
          <section class="card">
            <!-- Nessun titolo "Gomme": i chip dicono gia' Slick/Wet e il
                 controllo accanto dice Set. -->
            <div
              v-if="echo.compound.changed"
              class="card__head"
            >
              <span class="echo-line echo-line--changed">
                in auto {{ echo.compound.carValue }}
              </span>
            </div>

            <!-- Mescola e set sulla stessa riga: sono la stessa decisione. -->
            <div class="rubber">
              <PitwallChipGroup
                group-label="Mescola"
                :options="compoundOptions"
                :model-value="compound"
                @update:model-value="compound = clampCompound($event)"
              />

              <PitwallValueField
                title="Set"
                size="sm"
                input-label="Numero set gomme"
                :value="tyreSet"
                :min="PITWALL_TYRE_SET_MIN"
                :max="PITWALL_TYRE_SET_MAX"
                :echo="echo.tyreSet"
                @step="tyreSet = stepTyreSet(tyreSet, $event)"
                @update:value="tyreSet = clampTyreSet($event)"
              />
            </div>
          </section>

          <section class="card">
            <div class="card__head">
              <h2>Cambio pilota</h2>
              <span
                v-if="echo.driver.changed"
                class="echo-line echo-line--changed"
              >
                in auto {{ echo.driver.carValue }}
              </span>
            </div>

            <PitwallChipGroup
              group-label="Pilota che riparte"
              :options="driverOptions"
              :model-value="driverId"
              @update:model-value="driverId = $event"
            />
          </section>

          <section class="card">
            <div class="card__head">
              <h2>Riparazioni</h2>
              <span
                v-if="echo.repairs.changed"
                class="echo-line echo-line--changed"
              >
                in auto {{ echo.repairs.carValue }}
              </span>
            </div>

            <div class="switches">
              <label class="switch">
                <input
                  v-model="repairBodywork"
                  type="checkbox"
                />
                <span>Carrozzeria</span>
              </label>

              <label class="switch">
                <input
                  v-model="repairSuspension"
                  type="checkbox"
                />
                <span>Sospensioni</span>
              </label>
            </div>
          </section>

          <PitwallCarCard
            :in-pit-lane="car.inPitLane"
            :can-apply="Boolean(sentPlan)"
            @toggle-pit-lane="mockTogglePitLane"
            @apply-order="mockApplyOrder"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
/*
  Larghezza legata al contenuto, non ai 1400px delle pagine di lettura:
  a schermo pieno la griglia dava 810px alla colonna sinistra e i controlli
  si stiravano per riempirla, lasciando buchi dentro le schede.
*/
.pitwall-page {
  max-width: 980px;
  margin: 0 auto;
  padding: 8px 20px 10px;
}

.pitwall {
  --accent-rgb: 40, 183, 255;
  --accent: #28b7ff;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

// A chi sto mandando: sta in cima perche' e' la prima cosa da sapere.
.link-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 6px 10px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  background: rgba(12, 12, 18, 0.9);
  font-size: 12px;
}

.link-bar__label {
  color: rgba(255, 255, 255, 0.55);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.link-bar__select,
.link-bar__refresh {
  padding: 4px 8px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.04);
  color: inherit;
  font: inherit;
}

.link-bar__refresh:disabled {
  opacity: 0.5;
}

.link-bar__state {
  color: rgba(255, 255, 255, 0.7);
}

// Un problema non si mimetizza col resto: si vede.
.link-bar__state--problem {
  color: #ffb03a;
}

.link-bar__toggle {
  margin-left: auto;
}

.link-bar__badge {
  display: inline-block;
  min-width: 16px;
  margin-left: 4px;
  padding: 0 4px;
  border-radius: 8px;
  background: var(--accent);
  color: #05070c;
  font-weight: 700;
  text-align: center;
}

.links {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 10px;
  padding: 10px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  background: rgba(12, 12, 18, 0.9);
}

.links__title {
  margin: 0 0 6px;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: rgba(255, 255, 255, 0.55);
}

.links__row {
  display: flex;
  gap: 6px;
}

.links__input {
  flex: 1;
  min-width: 0;
  padding: 4px 8px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.04);
  color: inherit;
  font: inherit;
}

.links__btn {
  padding: 4px 10px;
  border: 1px solid rgba(var(--accent-rgb), 0.5);
  border-radius: 8px;
  background: rgba(var(--accent-rgb), 0.12);
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.links__btn--ghost {
  border-color: rgba(255, 255, 255, 0.16);
  background: transparent;
}

.links__list {
  margin: 6px 0 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.links__item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}

.links__name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.links__status {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.5);
}

.links__status--granted {
  color: #6fd66f;
}

.links__status--pending {
  color: #ffb03a;
}

.links__note {
  margin: 6px 0 0;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
}

.card {
  padding: 10px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  background: linear-gradient(145deg, rgba(26, 26, 36, 0.98), rgba(12, 12, 18, 0.98));
}

.card__head h2 {
  color: rgba(255, 255, 255, 0.46);
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

/* ── Griglia: largo cio' che cambia spesso, stretto il resto ──── */
.grid {
  display: grid;
  /* Largo cio' che si tocca a ogni sosta; la colonna di destra prende
     solo quanto le serve per i chip pilota, che sono il suo pezzo piu' largo. */
  grid-template-columns: minmax(0, 1fr) minmax(0, 440px);
  gap: 8px;
  align-items: start;
}

.col {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.card__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
}

.card__head h2 {
  margin: 0;
}

/* ── Azioni rapide ───────────────────────────────────────────── */
.quick {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.axle {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 4px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.04);
}

.axle span {
  color: rgba(255, 255, 255, 0.58);
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.06em;
}

.axle button {
  width: 26px;
  height: 26px;
  border: 0;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
  font-size: 15px;
  font-weight: 900;
  line-height: 1;
  cursor: pointer;
}

.axle button:hover,
.axle button:focus-visible {
  background: rgba(255, 255, 255, 0.16);
}

.ghost {
  padding: 6px 10px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 8px;
  background: transparent;
  color: rgba(255, 255, 255, 0.7);
  font-size: 11px;
  font-weight: 900;
  cursor: pointer;
  transition: border-color 0.16s ease, background 0.16s ease, color 0.16s ease;
}

.ghost:hover:not(:disabled),
.ghost:focus-visible:not(:disabled) {
  border-color: rgba(255, 255, 255, 0.4);
  color: #fff;
}

.ghost--active {
  border-color: rgba(255, 255, 255, 0.45);
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
}

.ghost:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

/* ── Gomme come si vedono dall'alto ──────────────────────────── */
.wheels {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

/* Mescola e set restano attaccati invece di finire ai due bordi opposti. */
.rubber {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 12px;
  align-items: flex-start;
}

/* Il set riempie lo spazio residuo della riga: la cornice si allarga,
   il controllo dentro resta compatto e centrato. */
.rubber > :last-child {
  flex: 1 1 168px;
  min-width: 168px;
}

/* ── Switch e riga di eco ────────────────────────────────────── */
.switches {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.switch {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  min-height: 34px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.04);
  cursor: pointer;
}

.switch:hover {
  border-color: rgba(255, 255, 255, 0.32);
}

.switch input {
  width: 18px;
  height: 18px;
  accent-color: var(--accent);
  cursor: pointer;
}

.switch span {
  color: #fff;
  font-size: 12px;
  font-weight: 800;
}

/* L'eco vive nell'intestazione della scheda: nessuna riga in piu' da leggere. */
.echo-line {
  margin: 0;
  color: rgba(255, 255, 255, 0.4);
  font-size: 11px;
}

/* L'accento vive solo dove ordine e macchina differiscono. */
.echo-line--changed {
  color: var(--accent);
  font-weight: 800;
}

@media (max-width: 1000px) {
  .grid {
    grid-template-columns: 1fr;
  }
}
</style>
