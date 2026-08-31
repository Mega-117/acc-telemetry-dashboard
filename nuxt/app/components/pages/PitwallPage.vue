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

// Il pannello Piloti parte aperto quando non c'e' nessuno da assistere: e' la
// prima cosa da fare. Si chiude da solo appena ci si collega.
const showLinkPanel = ref(true)

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

/** Chiede il collegamento dichiarando il tipo: "solo per oggi" o "sempre". */
async function askLink(driverUid: string, scope: 'once' | 'always') {
  await link.requestLink(driverUid, scope)
}

/** Si collega a un pilota pronto e chiude il pannello: si torna a lavorare. */
function connectTo(driverUid: string) {
  link.selectPilot(driverUid)
  showLinkPanel.value = false
}

function disconnect() {
  link.selectPilot(null)
  showLinkPanel.value = true
}

/** La portata del collegamento, corta, per il badge in lista. */
function outgoingBadge(pilot: { scope: 'once' | 'always' | null, expiresAtMs: number | null }): string {
  if (pilot.scope === 'once' && pilot.expiresAtMs != null) {
    return `oggi · scade ${new Date(pilot.expiresAtMs).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}`
  }
  return 'sempre'
}

/** Com'e' finito un collegamento passato: scaduto o revocato. */
function pastLabel(pilot: { status: string, expiresAtMs: number | null }): string {
  if (pilot.status === 'granted') return 'autorizzazione scaduta'
  return pilot.status === 'revoked' ? 'revocato o rifiutato' : pilot.status
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
      <section v-if="pendingRequests.length" class="invite" aria-live="polite">
        <div v-for="request in pendingRequests" :key="request.engineerUid" class="invite__row">
          <span class="invite__text">
            🔔 <strong>{{ requesterName(request) }}</strong> vuole farti da ingegnere<template v-if="request.requestedScope"> — chiede: <strong>{{ request.requestedScope === 'always' ? 'sempre' : 'solo per oggi' }}</strong></template>.
          </span>
          <!-- Due modi di dire si': il pulsante che corrisponde alla richiesta
               e' evidenziato, ma decide comunque il pilota. -->
          <button
            type="button"
            class="invite__btn"
            :class="{ 'invite__btn--asked': request.requestedScope !== 'always' }"
            @click="link.decide(request.engineerUid, 'granted', 'once')"
          >
            Autorizza per oggi
          </button>
          <button
            type="button"
            class="invite__btn"
            :class="{ 'invite__btn--asked': request.requestedScope === 'always' }"
            @click="link.decide(request.engineerUid, 'granted', 'always')"
          >
            Autorizza sempre
          </button>
          <button type="button" class="invite__btn invite__btn--ghost" @click="link.decide(request.engineerUid, 'revoked')">
            Rifiuta
          </button>
        </div>
      </section>

      <!--
        A chi sto mandando, in una riga sola. Il pannello Piloti sotto e' il
        posto unico per cercare, chiedere, collegarsi e autorizzare: niente
        select nativa (illeggibile sul tema scuro), niente accordion doppi.
      -->
      <section class="pilot-bar">
        <template v-if="link.selectedPilot.value">
          <span
            class="pilot-bar__dot"
            :class="link.selectedPilot.value.reachable ? 'pilot-bar__dot--on' : 'pilot-bar__dot--off'"
          />
          <strong class="pilot-bar__name">{{ link.selectedPilot.value.nickname }}</strong>
          <span class="pilot-bar__meta">
            {{ link.selectedPilot.value.reachable ? 'in pista' : 'non raggiungibile' }}
            · {{ outgoingBadge(link.selectedPilot.value) }}
          </span>
          <button type="button" class="pilot-bar__ghost" @click="disconnect">Scollega</button>
        </template>
        <template v-else>
          <span class="pilot-bar__none">Nessun pilota collegato — scegli chi assistere qui sotto.</span>
        </template>

        <span
          v-if="link.orderStatus.value"
          class="pilot-bar__state"
          :class="{ 'pilot-bar__state--problem': link.orderProgress.value.problem }"
        >
          {{ link.orderProgress.value.label }}
          <template v-if="link.orderReason.value"> — {{ link.orderReason.value }}</template>
        </span>

        <span v-if="link.lastError.value" class="pilot-bar__state pilot-bar__state--problem">
          {{ link.lastError.value }}
        </span>

        <button
          type="button"
          class="pilot-bar__toggle"
          :aria-expanded="showLinkPanel"
          @click="showLinkPanel = !showLinkPanel"
        >
          {{ showLinkPanel ? 'Chiudi' : 'Piloti' }}
        </button>
      </section>

      <!--
        Il pannello Piloti: UNA sezione, dentro una griglia 2x2 a scacchiera.
        Le celle condividono le stesse linee di divisione e gli stessi bordi:
        tutto allineato, niente scatole sparse. Le celle esistono sempre,
        anche vuote, cosi' la griglia non balla quando i dati cambiano.

          I TUOI PILOTI            | CERCA UN PILOTA
          RICHIESTE E PASSATI      | CHI PUO ASSISTERE TE
      -->
      <section v-if="showLinkPanel" class="pilots">
        <div class="pilots__cell" style="--cell-accent: #6fd66f">
          <h3 class="pilots__title">I tuoi piloti</h3>
          <p class="pilots__subtitle">pronti: clicca e ti colleghi</p>
          <p v-if="!link.pilots.value.length" class="pilots__note">
            Nessuno ancora: cerca un pilota qui a destra e chiedigli il collegamento.
          </p>
          <ul v-else class="pilots__list">
            <li v-for="pilot in link.pilots.value" :key="pilot.driverUid" class="pilots__row">
              <span class="pilots__dot" :class="pilot.reachable ? 'pilots__dot--on' : 'pilots__dot--off'" />
              <span class="pilots__name">{{ pilot.nickname }}</span>
              <span class="pilots__badge" :class="{ 'pilots__badge--always': pilot.scope !== 'once' }">
                {{ outgoingBadge(pilot) }}
              </span>
              <span class="pilots__meta">{{ pilot.reachable ? 'in pista' : 'offline' }}</span>
              <button
                type="button"
                class="pilots__btn pilots__btn--primary"
                :disabled="link.selectedDriverUid.value === pilot.driverUid"
                @click="connectTo(pilot.driverUid)"
              >
                {{ link.selectedDriverUid.value === pilot.driverUid ? 'Collegato' : 'Collegati' }}
              </button>
            </li>
          </ul>
        </div>

        <div class="pilots__cell" style="--cell-accent: var(--accent)">
          <h3 class="pilots__title">Cerca un pilota</h3>
          <p class="pilots__subtitle">scrivi il nome: la ricerca parte da sola</p>
          <input
            v-model="link.searchTerm.value"
            class="pilots__input"
            type="search"
            placeholder="Nome del pilota…"
            aria-label="Cerca un pilota per nome"
            @input="onSearchInput"
          >
          <p v-if="link.notice.value" class="pilots__note">{{ link.notice.value }}</p>
          <ul v-if="link.searchResults.value.length" class="pilots__list">
            <li v-for="found in link.searchResults.value" :key="found.uid" class="pilots__row">
              <span class="pilots__name">{{ found.nickname }}</span>
              <button type="button" class="pilots__btn" @click="askLink(found.uid, 'once')">Chiedi per oggi</button>
              <button type="button" class="pilots__btn" @click="askLink(found.uid, 'always')">Chiedi sempre</button>
              <button
                type="button"
                class="pilots__btn pilots__btn--ghost"
                title="Autorizzalo in anticipo a farti da ingegnere"
                @click="link.preAuthorise(found.uid)"
              >
                Pre-autorizza
              </button>
            </li>
          </ul>
        </div>

        <div class="pilots__cell" style="--cell-accent: #ffb03a">
          <h3 class="pilots__title">Richieste e passati</h3>
          <p class="pilots__subtitle">in attesa di un si, o da richiedere</p>
          <p v-if="!link.pendingOutgoing.value.length && !link.pastOutgoing.value.length" class="pilots__note">
            Niente in sospeso.
          </p>
          <template v-else>
            <ul v-if="link.pendingOutgoing.value.length" class="pilots__list">
              <li v-for="pending in link.pendingOutgoing.value" :key="pending.driverUid" class="pilots__row">
                <span class="pilots__wait">⏳</span>
                <span class="pilots__name">{{ pending.nickname }}</span>
                <span class="pilots__meta">
                  in attesa
                  <template v-if="pending.requestedScope">(chiesto: {{ pending.requestedScope === 'always' ? 'sempre' : 'per oggi' }})</template>
                </span>
                <button type="button" class="pilots__btn pilots__btn--ghost" @click="link.withdrawRequest(pending.driverUid)">
                  Ritira
                </button>
              </li>
            </ul>
            <ul v-if="link.pastOutgoing.value.length" class="pilots__list">
              <li v-for="past in link.pastOutgoing.value" :key="past.driverUid" class="pilots__row">
                <span class="pilots__name">{{ past.nickname }}</span>
                <span class="pilots__meta">{{ pastLabel(past) }}</span>
                <button type="button" class="pilots__btn" @click="askLink(past.driverUid, 'once')">Chiedi per oggi</button>
                <button type="button" class="pilots__btn" @click="askLink(past.driverUid, 'always')">Chiedi sempre</button>
              </li>
            </ul>
          </template>
        </div>

        <div class="pilots__cell" style="--cell-accent: #c792ea">
          <h3 class="pilots__title">Chi puo assistere te</h3>
          <p class="pilots__subtitle">tu al volante: chi comanda la tua sosta</p>
          <p v-if="!trustedEngineers.length" class="pilots__note">
            Nessuno, per ora. Quando qualcuno te lo chiede compare il riquadro in cima alla pagina.
          </p>
          <ul v-else class="pilots__list">
            <li v-for="request in trustedEngineers" :key="request.engineerUid" class="pilots__row">
              <span class="pilots__name">{{ requesterName(request) }}</span>
              <span class="pilots__badge" :class="{ 'pilots__badge--always': request.scope !== 'once' }">
                {{ scopeLabel(request) }}
              </span>
              <button
                type="button"
                class="pilots__btn pilots__btn--ghost"
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

// A chi sto mandando, in una riga: e' la prima cosa da sapere.
.pilot-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 8px 12px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  background: rgba(12, 12, 18, 0.9);
  font-size: 12px;
}

// Il pallino dice subito se il pilota c'e': verde in pista, grigio no.
.pilot-bar__dot,
.pilots__dot {
  flex: 0 0 auto;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.25);
}

.pilot-bar__dot--on,
.pilots__dot--on {
  background: #6fd66f;
  box-shadow: 0 0 6px rgba(111, 214, 111, 0.7);
}

.pilot-bar__dot--off,
.pilots__dot--off {
  background: rgba(255, 255, 255, 0.25);
}

.pilot-bar__name {
  color: #fff;
  font-size: 13px;
}

.pilot-bar__meta,
.pilot-bar__none {
  color: rgba(255, 255, 255, 0.6);
}

.pilot-bar__state {
  color: rgba(255, 255, 255, 0.7);
}

// Un problema non si mimetizza col resto: si vede.
.pilot-bar__state--problem {
  color: #ffb03a;
}

.pilot-bar__toggle,
.pilot-bar__ghost {
  padding: 4px 10px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.04);
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.pilot-bar__toggle {
  margin-left: auto;
  border-color: rgba(var(--accent-rgb), 0.5);
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

// Il pulsante che corrisponde a cio' che e' stato chiesto: evidenziato, ma
// gli altri restano cliccabili perche' decide comunque il pilota.
.invite__btn--asked {
  box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.85);
  font-weight: 800;
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

// Il pannello Piloti: UNA sezione con dentro una griglia 2x2 a scacchiera.
// Il trucco: il contenitore fa da colore delle linee, le celle opache stanno
// sopra con 1px di distanza. Le divisioni sono quindi linee condivise e
// perfettamente allineate, non cornici di scatole indipendenti.
.pilots {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.14);
}

.pilots__cell {
  min-width: 0;
  padding: 10px 12px 12px;
  background: #12121a;
}

// Il titolo di cella: quadratino colorato per categoria + etichetta. Stessa
// posizione in ogni cella, cosi' l'occhio trova subito le quattro zone.
.pilots__title {
  display: flex;
  align-items: center;
  gap: 7px;
  margin: 0;
  font-size: 11px;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #fff;
}

.pilots__title::before {
  content: '';
  flex: 0 0 auto;
  width: 8px;
  height: 8px;
  border-radius: 2px;
  background: var(--cell-accent, rgba(255, 255, 255, 0.4));
}

.pilots__subtitle {
  margin: 2px 0 8px 15px;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.45);
}

.pilots__list + .pilots__list {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px dashed rgba(255, 255, 255, 0.12);
}

.pilots__list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.pilots__row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  min-height: 32px;
  font-size: 13px;
  color: #fff;
}

// I bottoni stanno tutti a destra, incolonnati: l'occhio sa dove cliccare.
.pilots__row .pilots__btn:first-of-type {
  margin-left: auto;
}

.pilots__name {
  min-width: 90px;
  overflow: hidden;
  font-weight: 800;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pilots__meta {
  flex: 1;
  min-width: 120px;
  color: rgba(255, 255, 255, 0.55);
  font-size: 12px;
}

.pilots__wait {
  flex: 0 0 auto;
}

// La portata del permesso: "sempre" pieno, "oggi" con la scadenza accanto.
.pilots__badge {
  padding: 2px 7px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 6px;
  color: rgba(255, 255, 255, 0.7);
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.pilots__badge--always {
  border-color: rgba(111, 214, 111, 0.45);
  color: #6fd66f;
}

.pilots__input {
  width: 100%;
  padding: 7px 10px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.04);
  color: #fff;
  font: inherit;
}

.pilots__input::placeholder {
  color: rgba(255, 255, 255, 0.35);
}

.pilots__btn {
  padding: 5px 12px;
  border: 1px solid rgba(var(--accent-rgb), 0.5);
  border-radius: 8px;
  background: rgba(var(--accent-rgb), 0.12);
  color: #fff;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.pilots__btn:hover:not(:disabled) {
  background: rgba(var(--accent-rgb), 0.25);
}

// Collegati e' l'azione che conta: piena, non un fantasma fra i fantasmi.
.pilots__btn--primary {
  border-color: rgba(var(--accent-rgb), 0.7);
  background: var(--accent);
  color: #05070c;
  font-weight: 800;
}

.pilots__btn--primary:hover:not(:disabled) {
  background: var(--accent);
  filter: brightness(1.1);
}

.pilots__btn--primary:disabled {
  opacity: 0.55;
  cursor: default;
}

.pilots__btn--ghost {
  border-color: rgba(255, 255, 255, 0.16);
  background: transparent;
  color: rgba(255, 255, 255, 0.75);
}

.pilots__note {
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

  .pilots {
    grid-template-columns: 1fr;
  }
}
</style>
