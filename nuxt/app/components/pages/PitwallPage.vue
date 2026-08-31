<script setup lang="ts">
// ============================================
// PitwallPage - pannello di controllo dell'ingegnere di pista.
//
// Regola di lettura della schermata:
// ogni voce mostra in grande il valore che sto per mandare e in piccolo
// quello che ha adesso la macchina; l'accento compare solo dove differiscono.
//
// I valori della macchina e l'equipaggio sono REALI: arrivano dalla presenza
// che il PC del pilota pubblica ogni 30 secondi (strategia letta dal Pit MFD,
// equipaggio dalla EntryList del gioco). Un dato vecchio viene dichiarato
// vecchio; un dato mai arrivato non viene inventato.
//
// Invio: se un pilota collegato e' selezionato, "Invia" manda l'ordine davvero
// e la pagina segue l'esito dichiarato dal suo PC, campo per campo. Senza
// pilota selezionato la pagina resta una bozza locale, e lo dice invece di
// fingere di aver inviato.
// ============================================

import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { usePitwallLink } from '~/composables/usePitwallLink'
import { useFirebaseAuth } from '~/composables/useFirebaseAuth'
import { describePitwallGrantScope } from '~/services/pitwall/pitwallLink'
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

const FUEL_PRESETS = [30, 50, 70, PITWALL_FUEL_MAX_L]

const axleControls: { axle: PitwallAxle, label: string }[] = [
  { axle: 'front', label: 'ANT' },
  { axle: 'rear', label: 'POST' },
  { axle: 'all', label: 'TUTTE' },
]

// ── Collegamento reale con il pilota ────────────────────────────
const { currentUser } = useFirebaseAuth()
const link = usePitwallLink({ engineerUid: () => currentUser.value?.uid ?? null })

/** La presenza del pilota selezionato: e' la fonte dello stato macchina. */
const session = computed(() => link.selectedPilot.value?.session ?? null)

// Il tempo scorre anche senza eventi: serve un battito per dire "quanto e'
// vecchio" un dato senza costringere l'utente a ricaricare.
const nowTick = ref(Date.now())
let tickTimer: ReturnType<typeof setInterval> | null = null

/** Eta' della presenza in secondi; null se non e' mai arrivata. */
const presenceAgeSeconds = computed(() => {
  const updatedAt = session.value?.updatedAt
  if (!updatedAt) return null
  const parsed = Date.parse(updatedAt)
  return Number.isFinite(parsed) ? Math.max(0, Math.round((nowTick.value - parsed) / 1000)) : null
})

/** Il dato macchina e' recente: entro tre battiti di presenza. */
const carFresh = computed(() => presenceAgeSeconds.value != null && presenceAgeSeconds.value <= 90)

// ── Equipaggio reale, dalla EntryList del gioco ──────────────────
const drivers = computed<PitwallDriver[]>(() => (
  (session.value?.crew ?? []).map(member => ({ id: String(member.driverIndex), name: member.name }))
))

// ── Ordine in composizione ───────────────────────────────────────
const pressures = ref<Record<PitwallWheel, number>>({ FL: 25.0, FR: 25.0, RL: 25.0, RR: 25.0 })
const fuelLiters = ref(0)
const compound = ref<PitwallCompound>('dry')
// La mescola si manda solo se scelta apposta: cosi' un ordine non tocca la
// gomma per sbaglio, e la si puo' mandare anche quando lo stato in auto non
// e' osservabile.
const compoundTouched = ref(false)
const tyreSet = ref(1)
const driverId = ref<string | null>(null)
const repairBodywork = ref(false)
const repairSuspension = ref(false)

const sentPlan = ref<PitwallPlan | null>(null)

// ── Stato macchina reale ─────────────────────────────────────────
// Dove il pilota non pubblica un valore, si rispecchia l'ordine: cosi' non
// compare nessun accento "diverso dalla macchina" su un dato che non esiste.
const car = computed<PitwallCarState>(() => {
  const strategy = session.value?.strategy ?? null
  const current = (session.value?.crew ?? []).find(member => member.current) ?? null
  return {
    pressures: strategy?.pressures ?? { ...pressures.value },
    fuelLiters: strategy?.fuelToAdd ?? fuelLiters.value,
    compound: (strategy?.compound as PitwallCompound | null | undefined) ?? compound.value,
    tyreSet: strategy?.tyreSet ?? tyreSet.value,
    driverId: current ? String(current.driverIndex) : driverId.value,
    repairBodywork: repairBodywork.value,
    repairSuspension: repairSuspension.value,
    inPitLane: false,
  }
})

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
const echo = computed(() => buildPitwallEcho(plan.value, car.value, drivers.value))
const changeChips = computed(() => buildPitwallChangeChips(plan.value, car.value, drivers.value))
const orderStatus = computed(() => resolvePitwallOrderStatus({
  plan: plan.value,
  car: car.value,
  sentPlan: sentPlan.value,
}))
const stopEstimate = computed(() => estimatePitStop(plan.value, car.value))

const compoundOptions = computed(() => PITWALL_COMPOUNDS.map(value => ({ value, label: formatCompound(value) })))
const driverOptions = computed(() => [
  { value: null, label: 'Nessun cambio' },
  ...drivers.value.map(driver => ({ value: driver.id, label: driver.name })),
])

// ── Allineamento iniziale: la pagina si apre sui valori veri ─────
// Appena arriva la prima fotografia della macchina, l'ordine parte da li'.
// Una sola volta per pilota: le modifiche dell'ingegnere non vanno riscritte
// dal battito successivo.
let planInitialised = false
watch(() => link.selectedDriverUid.value, () => { planInitialised = false })
watch(car, () => {
  if (planInitialised || !session.value?.strategy) return
  planInitialised = true
  resetToCar()
})

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
  compoundTouched.value = false
  tyreSet.value = car.value.tyreSet
  driverId.value = null
  repairBodywork.value = false
  repairSuspension.value = false
}

const showLinkPanel = ref(false)

onMounted(() => {
  void link.refreshPilots()
  // Da qui in poi richieste e autorizzazioni arrivano da sole: nessun
  // pulsante Aggiorna, nessuna pagina da ricaricare per accorgersene.
  link.watchLive()
  tickTimer = setInterval(() => { nowTick.value = Date.now() }, 5_000)
})

onBeforeUnmount(() => {
  if (tickTimer) clearInterval(tickTimer)
  tickTimer = null
})

/**
 * Quello che viaggia davvero: solo i campi che l'applicatore conosce, e solo
 * quelli che chiedono un cambiamento.
 *
 * La mescola parte quando e' stata scelta apposta, anche se la fotografia in
 * auto sembra gia' su quel valore: e' il PC del pilota che sa davvero com'e'
 * la gomma, e un ordine identico finisce in "gia' impostata" senza un tasto.
 */
function planPayload(): Record<string, unknown> {
  const strategy = carFresh.value ? session.value?.strategy ?? null : null
  const payload: Record<string, unknown> = {}
  if (strategy?.fuelToAdd == null || Math.abs(strategy.fuelToAdd - fuelLiters.value) >= 0.5) {
    payload.fuelLiters = fuelLiters.value
  }
  if (strategy?.tyreSet == null || strategy.tyreSet !== tyreSet.value) {
    payload.tyreSet = tyreSet.value
  }
  if (!strategy?.pressures
    || PITWALL_WHEELS.some(wheel => Math.abs((strategy.pressures?.[wheel] ?? Number.NaN) - pressures.value[wheel]) >= 0.05)) {
    payload.pressures = { ...pressures.value }
  }
  if (compoundTouched.value || (strategy?.compound != null && strategy.compound !== compound.value)) {
    payload.compound = compound.value
  }
  if (repairBodywork.value) payload.repairBodywork = true
  if (repairSuspension.value) payload.repairSuspension = true
  if (driverId.value != null) payload.driverId = driverId.value
  return payload
}

/** C'e' davvero qualcosa da mandare. */
const hasChanges = computed(() => Object.keys(planPayload()).length > 0)

/** Chi aspetta una mia risposta adesso: e' l'unica cosa che chiede un'azione. */
const pendingRequests = computed(() => link.pendingIncoming.value)
/** Chi ho gia' autorizzato, per poterlo togliere quando voglio. */
const trustedEngineers = computed(() => link.grantedIncoming.value)

function requesterName(request: { nickname: string | null, engineerUid: string }): string {
  return request.nickname || request.engineerUid
}

/**
 * La ricerca parte da sola mentre si scrive.
 *
 * Un pulsante "Cerca" e' un passaggio in piu' da indovinare: chi non e'
 * pratico scrive il nome e aspetta che succeda qualcosa. La pausa evita di
 * interrogare il database a ogni lettera.
 */
let searchTimer: ReturnType<typeof setTimeout> | null = null
function onSearchInput() {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => { void link.search() }, 350)
}
onBeforeUnmount(() => { if (searchTimer) clearTimeout(searchTimer) })

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

// ── Esito per campo, tradotto per chi legge di fretta ────────────
const FIELD_LABELS: Record<string, string> = {
  fuelLiters: 'Carburante',
  tyreSet: 'Set',
  compound: 'Mescola',
  pressureFL: 'FL',
  pressureFR: 'FR',
  pressureRL: 'RL',
  pressureRR: 'RR',
  changeTyres: 'Cambio gomme',
  repairBodywork: 'Carrozzeria',
  repairSuspension: 'Sospensioni',
  driverId: 'Pilota',
}

/**
 * `verified`, `selected` e `not-verifiable` non sono intercambiabili: qui si
 * mostrano distinti invece di appiattirli in un generico "fatto".
 */
const fieldOutcomes = computed(() => Object.entries(link.orderFields.value).map(([field, outcome]) => ({
  field,
  label: FIELD_LABELS[field] ?? field,
  outcome: outcome?.outcome ?? null,
  observed: outcome?.observed ?? null,
  reason: outcome?.reason ?? null,
})))

function scopeLabel(request: { scope: 'once' | 'always' | null, expiresAtMs: number | null }): string {
  return describePitwallGrantScope(request)
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
      <!--
        Una richiesta in arrivo non si nasconde dentro un pannello: chi la
        riceve deve capire in un secondo chi e' e cosa deve fare. Compare da
        sola, senza ricaricare niente.
      -->
      <section v-if="pendingRequests.length" class="invite">
        <div v-for="request in pendingRequests" :key="request.engineerUid" class="invite__row">
          <span class="invite__text">
            <strong>{{ requesterName(request) }}</strong> vuole fare da ingegnere per te.
          </span>
          <!-- Due modi di dire si', spiegati dal pulsante stesso: solo per
               questa giornata (scade da sola) oppure per sempre. -->
          <button type="button" class="invite__btn" @click="link.decide(request.engineerUid, 'granted', 'once')">
            Solo per oggi
          </button>
          <button type="button" class="invite__btn" @click="link.decide(request.engineerUid, 'granted', 'always')">
            Sempre
          </button>
          <button type="button" class="invite__btn invite__btn--ghost" @click="link.decide(request.engineerUid, 'revoked')">
            Rifiuta
          </button>
        </div>
      </section>

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
          {{ showLinkPanel ? 'Chiudi' : 'Collegamenti' }}
        </button>
      </section>

      <!--
        Un solo pannello, due cose sole: chiedere a qualcuno, e vedere chi puo'
        gia' guidare al posto mio. Tutto il resto era gergo.
      -->
      <section v-if="showLinkPanel" class="links">
        <div class="links__col">
          <h3 class="links__title">Chiedi a un pilota di assisterlo</h3>
          <p class="links__hint">Scrivi il suo nome: la ricerca parte da sola.</p>
          <input
            v-model="link.searchTerm.value"
            class="links__input"
            type="search"
            placeholder="Nome del pilota"
            aria-label="Cerca un pilota per nome"
            @input="onSearchInput"
          >

          <p v-if="link.notice.value" class="links__note">{{ link.notice.value }}</p>

          <ul v-if="link.searchResults.value.length" class="links__list">
            <li v-for="found in link.searchResults.value" :key="found.uid" class="links__item">
              <span class="links__name">{{ found.nickname }}</span>
              <!-- Due ruoli, due verbi: "Chiedi" per assistere lui (deciderà
                   lui), "Pre-autorizza" perché possa assistere te da subito. -->
              <button type="button" class="links__btn" @click="askLink(found.uid)">Chiedi</button>
              <button
                type="button"
                class="links__btn links__btn--ghost"
                title="Autorizzalo in anticipo a farti da ingegnere"
                @click="link.preAuthorise(found.uid)"
              >
                Pre-autorizza
              </button>
            </li>
          </ul>
        </div>

        <div class="links__col">
          <h3 class="links__title">Chi puo assistere te</h3>
          <p v-if="!trustedEngineers.length" class="links__hint">
            Nessuno, per ora. Quando qualcuno te lo chiede compare qui sopra.
          </p>
          <ul v-else class="links__list">
            <li v-for="request in trustedEngineers" :key="request.engineerUid" class="links__item">
              <span class="links__name">{{ requesterName(request) }}</span>
              <span class="links__status">{{ scopeLabel(request) }}</span>
              <button
                type="button"
                class="links__btn links__btn--ghost"
                @click="link.decide(request.engineerUid, 'revoked')"
              >
                Togli
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

      <!--
        L'esito dell'ultimo ordine, campo per campo: verificato, inviato senza
        conferma possibile, o lasciato intatto. Tre cose diverse, mai un
        generico "fatto".
      -->
      <section v-if="fieldOutcomes.length" class="outcomes" aria-label="Esito per campo dell'ultimo ordine">
        <span
          v-for="item in fieldOutcomes"
          :key="item.field"
          class="outcomes__chip"
          :class="{
            'outcomes__chip--verified': item.outcome === 'verified',
            'outcomes__chip--selected': item.outcome === 'selected',
            'outcomes__chip--skipped': item.outcome === 'not-verifiable' || item.outcome === null,
          }"
          :title="item.reason ?? ''"
        >
          {{ item.label }}
          {{ item.outcome === 'verified' ? '✓' : item.outcome === 'selected' ? '→' : '—' }}
        </span>
      </section>

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
                @update:model-value="compound = clampCompound($event); compoundTouched = true"
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
            :session="session"
            :fresh="carFresh"
            :age-seconds="presenceAgeSeconds"
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

// Una richiesta in arrivo: l'unica cosa in pagina che chiede una risposta.
.invite {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  border: 1px solid rgba(var(--accent-rgb), 0.55);
  border-radius: 12px;
  background: rgba(var(--accent-rgb), 0.1);
}

.invite__row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 13px;
}

.invite__text {
  flex: 1;
  min-width: 180px;
}

.invite__btn {
  padding: 5px 14px;
  border: 1px solid rgba(var(--accent-rgb), 0.6);
  border-radius: 8px;
  background: var(--accent);
  color: #05070c;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

.invite__btn--ghost {
  border-color: rgba(255, 255, 255, 0.2);
  background: transparent;
  color: inherit;
  font-weight: 400;
}

// Esito per campo dell'ultimo ordine: tre colori per tre verita' diverse.
.outcomes {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 6px 10px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  background: rgba(12, 12, 18, 0.9);
}

.outcomes__chip {
  padding: 3px 8px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 7px;
  font-size: 11px;
  font-weight: 800;
}

.outcomes__chip--verified {
  border-color: rgba(111, 214, 111, 0.5);
  color: #6fd66f;
}

.outcomes__chip--selected {
  border-color: rgba(var(--accent-rgb), 0.5);
  color: var(--accent);
}

.outcomes__chip--skipped {
  color: rgba(255, 255, 255, 0.45);
}

.links__hint {
  margin: 0 0 6px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.55);
}

.links__col .links__input {
  width: 100%;
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
