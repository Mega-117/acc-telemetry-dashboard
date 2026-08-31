<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { usePitwallLink } from '~/composables/usePitwallLink'
import { useFirebaseAuth } from '~/composables/useFirebaseAuth'
import { describePitwallGrantScope } from '~/services/pitwall/pitwallLink'
import PitwallCarCard from '~/components/pitwall/PitwallCarCard.vue'
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
  stepFuel,
  stepPressure,
  stepTyreSet,
  wheelLabel,
  type PitwallCarState,
  type PitwallCompound,
  type PitwallDriver,
  type PitwallPlan,
  type PitwallWheel,
} from '~/utils/pitwallPresentation'

const { currentUser } = useFirebaseAuth()
const link = usePitwallLink({ engineerUid: () => currentUser.value?.uid ?? null })
const session = computed(() => link.selectedPilot.value?.session ?? null)

const nowTick = ref(Date.now())
let tickTimer: ReturnType<typeof setInterval> | null = null
const presenceAgeSeconds = computed(() => {
  const updatedAt = session.value?.updatedAt
  if (!updatedAt) return null
  const parsed = Date.parse(updatedAt)
  return Number.isFinite(parsed) ? Math.max(0, Math.round((nowTick.value - parsed) / 1000)) : null
})
const carFresh = computed(() => presenceAgeSeconds.value != null && presenceAgeSeconds.value <= 90)
const drivers = computed<PitwallDriver[]>(() => (
  (session.value?.crew ?? []).map(member => ({ id: String(member.driverIndex), name: member.name }))
))

const pressures = ref<Record<PitwallWheel, number>>({ FL: 25, FR: 25, RL: 25, RR: 25 })
const fuelLiters = ref(0)
const compound = ref<PitwallCompound>('dry')
const compoundTouched = ref(false)
const tyreSet = ref(1)
const changeTyres = ref(false)
const driverId = ref<string | null>(null)
const repairBodywork = ref(false)
const repairSuspension = ref(false)
const sentPlan = ref<PitwallPlan | null>(null)

const car = computed<PitwallCarState>(() => {
  const strategy = session.value?.strategy ?? null
  const current = (session.value?.crew ?? []).find(member => member.current) ?? null
  return {
    pressures: strategy?.pressures ?? { ...pressures.value },
    fuelLiters: strategy?.fuelToAdd ?? fuelLiters.value,
    compound: (strategy?.compound as PitwallCompound | null | undefined) ?? compound.value,
    tyreSet: strategy?.tyreSet ?? tyreSet.value,
    changeTyres: false,
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
  changeTyres: changeTyres.value,
  driverId: driverId.value,
  repairBodywork: repairBodywork.value,
  repairSuspension: repairSuspension.value,
}))

const echo = computed(() => buildPitwallEcho(plan.value, car.value, drivers.value))
const changeChips = computed(() => buildPitwallChangeChips(plan.value, car.value, drivers.value))
const orderStatus = computed(() => resolvePitwallOrderStatus({ plan: plan.value, car: car.value, sentPlan: sentPlan.value }))
const stopEstimate = computed(() => estimatePitStop(plan.value, car.value))
const mfdPlan = computed(() => sentPlan.value ?? plan.value)
const compoundOptions = computed(() => PITWALL_COMPOUNDS.map(value => ({ value, label: formatCompound(value) })))
const driverOptions = computed(() => [
  { value: null, label: 'Nessun cambio' },
  ...drivers.value.map(driver => ({ value: driver.id, label: driver.name })),
])

let planInitialised = false
watch(() => link.selectedDriverUid.value, () => { planInitialised = false })
watch(car, () => {
  if (planInitialised || !session.value?.strategy) return
  planInitialised = true
  resetToCar()
})

function adjustPressure(wheel: PitwallWheel, direction: 1 | -1) {
  pressures.value = { ...pressures.value, [wheel]: stepPressure(pressures.value[wheel], direction) }
}

function setPressure(wheel: PitwallWheel, value: number) {
  pressures.value = { ...pressures.value, [wheel]: clampPressure(value) }
}

function onCompoundChange(event: Event) {
  compound.value = clampCompound((event.target as HTMLSelectElement).value)
  compoundTouched.value = true
}

function resetToCar() {
  pressures.value = { ...car.value.pressures }
  fuelLiters.value = car.value.fuelLiters
  compound.value = car.value.compound
  compoundTouched.value = false
  tyreSet.value = car.value.tyreSet
  changeTyres.value = false
  driverId.value = null
  repairBodywork.value = false
  repairSuspension.value = false
}

onMounted(() => {
  void link.refreshPilots()
  link.watchLive()
  tickTimer = setInterval(() => { nowTick.value = Date.now() }, 5_000)
})

onBeforeUnmount(() => {
  if (tickTimer) clearInterval(tickTimer)
  if (searchTimer) clearTimeout(searchTimer)
  tickTimer = null
})

function planPayload(): Record<string, unknown> {
  const strategy = carFresh.value ? session.value?.strategy ?? null : null
  const payload: Record<string, unknown> = {}
  if (strategy?.fuelToAdd == null || Math.abs(strategy.fuelToAdd - fuelLiters.value) >= 0.5) payload.fuelLiters = fuelLiters.value
  if (strategy?.tyreSet == null || strategy.tyreSet !== tyreSet.value) payload.tyreSet = tyreSet.value
  if (!strategy?.pressures || PITWALL_WHEELS.some(wheel => Math.abs((strategy.pressures?.[wheel] ?? Number.NaN) - pressures.value[wheel]) >= 0.05)) {
    payload.pressures = { ...pressures.value }
  }
  if (compoundTouched.value || (strategy?.compound != null && strategy.compound !== compound.value)) payload.compound = compound.value
  if (changeTyres.value) payload.changeTyres = true
  if (repairBodywork.value) payload.repairBodywork = true
  if (repairSuspension.value) payload.repairSuspension = true
  if (driverId.value != null) payload.driverId = driverId.value
  return payload
}

const hasChanges = computed(() => Object.keys(planPayload()).length > 0)
const pendingRequests = computed(() => link.pendingIncoming.value)
const trustedEngineers = computed(() => link.grantedIncoming.value)

function requesterName(request: { nickname: string | null, engineerUid: string }): string {
  return request.nickname || request.engineerUid
}

let searchTimer: ReturnType<typeof setTimeout> | null = null
function onSearchInput() {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => { void link.search() }, 350)
}

async function askLink(driverUid: string, scope: 'once' | 'always') {
  await link.requestLink(driverUid, scope)
}

function connectTo(driverUid: string) { link.selectPilot(driverUid) }
function disconnect() { link.selectPilot(null) }

function outgoingBadge(pilot: { scope: 'once' | 'always' | null, expiresAtMs: number | null }): string {
  if (pilot.scope === 'once' && pilot.expiresAtMs != null) {
    return `valido fino alle ${new Date(pilot.expiresAtMs).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}`
  }
  return 'accesso permanente'
}

function pastLabel(pilot: { status: string, expiresAtMs: number | null }): string {
  if (pilot.status === 'granted') return 'autorizzazione scaduta'
  return pilot.status === 'revoked' ? 'ultima assistenza conclusa' : pilot.status
}

type RecentPilotStatus = 'ready' | 'pending' | 'past'
interface RecentPilotRow {
  driverUid: string
  nickname: string
  status: RecentPilotStatus
  reachable: boolean
  scope: 'once' | 'always' | null
  expiresAtMs: number | null
  detail: string
}

const recentPilots = computed<RecentPilotRow[]>(() => {
  const rows = new Map<string, RecentPilotRow>()
  for (const pilot of link.pilots.value) {
    rows.set(pilot.driverUid, {
      driverUid: pilot.driverUid,
      nickname: pilot.nickname,
      status: 'ready',
      reachable: pilot.reachable,
      scope: pilot.scope,
      expiresAtMs: pilot.expiresAtMs,
      detail: pilot.reachable ? 'online' : 'offline',
    })
  }
  for (const pending of link.pendingOutgoing.value) {
    if (rows.has(pending.driverUid)) continue
    rows.set(pending.driverUid, {
      driverUid: pending.driverUid,
      nickname: pending.nickname,
      status: 'pending',
      reachable: false,
      scope: pending.requestedScope,
      expiresAtMs: null,
      detail: 'richiesta in attesa',
    })
  }
  for (const past of link.pastOutgoing.value) {
    if (rows.has(past.driverUid)) continue
    rows.set(past.driverUid, {
      driverUid: past.driverUid,
      nickname: past.nickname,
      status: 'past',
      reachable: false,
      scope: past.scope,
      expiresAtMs: past.expiresAtMs,
      detail: pastLabel(past),
    })
  }
  return [...rows.values()].sort((a, b) => Number(!(a.status === 'ready' && a.scope === 'always')) - Number(!(b.status === 'ready' && b.scope === 'always')))
})

async function sendToCar() {
  sentPlan.value = { ...plan.value, pressures: { ...pressures.value } }
  if (!link.selectedDriverUid.value) return
  await link.sendPlan(planPayload())
}

const FIELD_LABELS: Record<string, string> = {
  fuelLiters: 'Carburante', tyreSet: 'Set', compound: 'Mescola', pressureFL: 'FL', pressureFR: 'FR',
  pressureRL: 'RL', pressureRR: 'RR', changeTyres: 'Cambio gomme', repairBodywork: 'Carrozzeria',
  repairSuspension: 'Sospensioni', driverId: 'Pilota',
}
const fieldOutcomes = computed(() => Object.entries(link.orderFields.value).map(([field, outcome]) => ({
  field,
  label: FIELD_LABELS[field] ?? field,
  outcome: outcome?.outcome ?? null,
  reason: outcome?.reason ?? null,
})))

function scopeLabel(request: { scope: 'once' | 'always' | null, expiresAtMs: number | null }): string {
  return describePitwallGrantScope(request)
}
</script>

<template>
  <div class="pitwall-page">
    <main class="pitwall">
      <section v-if="pendingRequests.length" class="invite" aria-live="polite">
        <div v-for="request in pendingRequests" :key="request.engineerUid" class="invite__row">
          <p><strong>{{ requesterName(request) }}</strong> vuole collegarsi come ingegnere di pista.</p>
          <button type="button" class="btn btn--primary" @click="link.decide(request.engineerUid, 'granted', 'once')">Autorizza per oggi</button>
          <button type="button" class="btn" @click="link.decide(request.engineerUid, 'granted', 'always')">Autorizza sempre</button>
          <button type="button" class="btn btn--ghost" @click="link.decide(request.engineerUid, 'revoked')">Rifiuta</button>
        </div>
      </section>

      <h1 class="page-title">CONNESSIONI</h1>
      <section class="connections" aria-label="Gestione collegamenti Pitwall">
        <article class="connection-cell connection-cell--active">
          <h2 class="eyebrow eyebrow--green">PILOTA ASSISTITO</h2>
          <template v-if="link.selectedPilot.value">
            <div class="active-pilot__name-row">
              <strong>{{ link.selectedPilot.value.nickname }}</strong>
              <span class="status-pill" :class="link.selectedPilot.value.reachable ? 'is-online' : 'is-offline'">
                {{ link.selectedPilot.value.reachable ? 'ONLINE' : 'OFFLINE' }}
              </span>
            </div>
            <p class="active-pilot__meta"><span class="check">✓</span>{{ outgoingBadge(link.selectedPilot.value) }}</p>
            <p class="active-pilot__meta"><span class="clock">◷</span>{{ presenceAgeSeconds == null ? 'In attesa dei dati macchina' : `Dati aggiornati ${presenceAgeSeconds}s fa` }}</p>
            <button type="button" class="btn active-pilot__disconnect" @click="disconnect">Disconnetti</button>
          </template>
          <template v-else>
            <strong class="active-pilot__empty-title">Nessun pilota attivo</strong>
            <p class="cell-note">Collegati dalla lista dei piloti recenti o cerca un nuovo pilota.</p>
          </template>
          <p v-if="link.lastError.value" class="cell-error">{{ link.lastError.value }}</p>
        </article>

        <article class="connection-cell connection-cell--search">
          <h2 class="eyebrow eyebrow--blue">CERCA PILOTA</h2>
          <input v-model="link.searchTerm.value" class="search-input" type="search" placeholder="Cerca pilota per nome…" aria-label="Cerca un pilota per nome" @input="onSearchInput">
          <p class="cell-note">Cerca un pilota per richiedere accesso o connetterti se hai già un’autorizzazione valida.</p>
          <p v-if="link.notice.value" class="cell-notice">{{ link.notice.value }}</p>
          <ul v-if="link.searchResults.value.length" class="search-results">
            <li v-for="found in link.searchResults.value" :key="found.uid">
              <strong>{{ found.nickname }}</strong>
              <button type="button" class="btn" @click="askLink(found.uid, 'once')">Per oggi</button>
              <button type="button" class="btn" @click="askLink(found.uid, 'always')">Sempre</button>
              <button type="button" class="btn btn--ghost" @click="link.preAuthorise(found.uid)">Pre-autorizza</button>
            </li>
          </ul>
        </article>

        <article class="connection-cell connection-cell--recent">
          <h2 class="eyebrow eyebrow--purple">PILOTI RECENTI</h2>
          <div class="recent-list">
            <div v-for="pilot in recentPilots" :key="pilot.driverUid" class="recent-row">
              <span class="presence-dot" :class="pilot.reachable ? 'is-online' : pilot.status === 'pending' ? 'is-waiting' : ''" />
              <strong>{{ pilot.nickname }}</strong>
              <span v-if="pilot.status === 'ready'" class="grant-pill" :class="{ 'is-permanent': pilot.scope === 'always' }">{{ outgoingBadge(pilot) }}</span>
              <span v-else class="recent-row__detail">{{ pilot.detail }}</span>
              <button v-if="pilot.status === 'ready'" type="button" class="btn" :disabled="link.selectedDriverUid.value === pilot.driverUid" @click="connectTo(pilot.driverUid)">
                {{ link.selectedDriverUid.value === pilot.driverUid ? 'Collegato' : 'Connetti' }}
              </button>
              <button v-else-if="pilot.status === 'past'" type="button" class="btn" @click="askLink(pilot.driverUid, 'once')">Richiedi accesso</button>
              <button v-else type="button" class="btn btn--ghost" @click="link.withdrawRequest(pilot.driverUid)">Ritira</button>
            </div>
            <div v-for="request in trustedEngineers" :key="`incoming-${request.engineerUid}`" class="recent-row recent-row--incoming">
              <span class="presence-dot is-incoming" />
              <strong>{{ requesterName(request) }}</strong>
              <span class="grant-pill">PUÒ ASSISTIRTI · {{ scopeLabel(request) }}</span>
              <button type="button" class="btn btn--ghost" @click="link.decide(request.engineerUid, 'revoked')">Revoca</button>
            </div>
            <p v-if="!recentPilots.length && !trustedEngineers.length" class="cell-note">Nessuna assistenza precedente.</p>
          </div>
        </article>
      </section>

      <div class="workspace">
        <section class="strategy" aria-labelledby="strategy-title">
          <h2 id="strategy-title" class="panel-title">STRATEGIA DA INVIARE</h2>
          <div class="strategy__body">
            <div class="strategy-topline">
              <div class="static-control" title="Il preset ACC non è ancora disponibile nel contratto remoto">
                <span>Preset strategia</span>
                <div class="static-stepper"><button type="button" disabled>−</button><strong>Off</strong><button type="button" disabled>+</button></div>
              </div>
              <PitwallValueField title="Carburante in uscita" input-label="Carburante in uscita in litri" size="sm" bare unit="L" :value="fuelLiters" :min="PITWALL_FUEL_MIN_L" :max="PITWALL_FUEL_MAX_L" :echo="echo.fuel" @step="fuelLiters = stepFuel(fuelLiters, $event)" @update:value="fuelLiters = clampFuel($event)" />
            </div>

            <section class="tyres-card" aria-labelledby="tyres-title">
              <h3 id="tyres-title">Pressioni pneumatici (PSI)</h3>
              <div class="tyres-layout">
                <div class="pressure-map">
                  <PitwallValueField v-for="wheel in PITWALL_WHEELS" :key="wheel" :class="`tyre-control tyre-control--${wheel.toLowerCase()}`" :title="wheel" :input-label="`Pressione ${wheelLabel(wheel)} in PSI`" :value="pressures[wheel]" :min="PITWALL_PRESSURE_MIN_PSI" :max="PITWALL_PRESSURE_MAX_PSI" :step="0.1" :decimals="1" bare :echo="echo[wheel]" @step="adjustPressure(wheel, $event)" @update:value="setPressure(wheel, $event)" />
                  <img class="car-silhouette" src="/images/pitwall-car-top.svg?v=5" alt="Sagoma della vettura vista dall’alto">
                </div>
                <div class="tyre-settings">
                  <PitwallValueField title="Set pneumatici" size="sm" input-label="Numero set pneumatici" :value="tyreSet" :min="PITWALL_TYRE_SET_MIN" :max="PITWALL_TYRE_SET_MAX" bare :echo="echo.tyreSet" @step="tyreSet = stepTyreSet(tyreSet, $event)" @update:value="tyreSet = clampTyreSet($event)" />
                  <label class="select-control"><span>Mescola</span><select :value="compound" @change="onCompoundChange"><option v-for="option in compoundOptions" :key="option.value" :value="option.value">{{ option.value === 'dry' ? 'Dry' : option.label }}</option></select></label>
                  <label class="check-control"><input v-model="changeTyres" type="checkbox"><span>Cambio gomme</span></label>
                </div>
              </div>
            </section>

            <div class="service-row">
              <label class="select-control select-control--driver"><span>Prossimo pilota</span><select v-model="driverId"><option v-for="option in driverOptions" :key="String(option.value)" :value="option.value">{{ option.label }}</option></select></label>
              <label class="check-control check-control--disabled" title="Non disponibile nel contratto PitStrategyV1"><input type="checkbox" disabled><span>Sostituisci freni</span></label>
            </div>
            <fieldset class="repairs"><legend>Riparazioni</legend><label class="check-control"><input v-model="repairSuspension" type="checkbox"><span>Sospensioni</span></label><label class="check-control"><input v-model="repairBodywork" type="checkbox"><span>Carrozzeria</span></label></fieldset>
          </div>
          <PitwallOrderBar :status="orderStatus" :chips="changeChips" :stop="stopEstimate" :can-send="hasChanges" @send="sendToCar" />
        </section>

        <PitwallCarCard :session="session" :fresh="carFresh" :age-seconds="presenceAgeSeconds" :display-plan="mfdPlan" :drivers="drivers" :stop="stopEstimate">
          <template #order>
            <section v-if="link.orderProgress.value.label || fieldOutcomes.length" class="order-info" aria-label="Stato dell'ultimo ordine">
              <div class="order-info__head"><strong>Ultimo ordine</strong><span :class="{ 'is-problem': link.orderProgress.value.problem }">{{ link.orderProgress.value.label || 'Nessun ordine' }}</span></div>
              <p v-if="link.orderReason.value">{{ link.orderReason.value }}</p>
              <div v-if="fieldOutcomes.length" class="outcomes"><span v-for="item in fieldOutcomes" :key="item.field" :class="[`outcome`, `outcome--${item.outcome ?? 'none'}`]" :title="item.reason ?? ''">{{ item.label }} {{ item.outcome === 'verified' ? '✓' : item.outcome === 'selected' ? '→' : '—' }}</span></div>
            </section>
          </template>
        </PitwallCarCard>
      </div>
    </main>
  </div>
</template>

<style lang="scss" scoped>
.pitwall-page { max-width: 1500px; margin: 0 auto; padding: 14px 16px 24px; }
.pitwall { --accent-rgb: 53, 169, 242; --accent: #35a9f2; display: grid; gap: 14px; color: #f4f7fa; }
.page-title { margin: 0; font-size: 17px; font-weight: 850; letter-spacing: .01em; }
.connections { display: grid; grid-template-columns: .92fr .94fr 1.34fr; overflow: hidden; border: 1px solid rgba(255,255,255,.12); border-radius: 10px; background: rgba(255,255,255,.12); gap: 1px; }
.connection-cell { min-width: 0; min-height: 182px; padding: 17px 20px; background: #101820; }
.eyebrow { display: flex; align-items: center; gap: 10px; margin: 0 0 24px; color: #f5f7fa; font-size: 12px; font-weight: 850; letter-spacing: .02em; }
.eyebrow::before { content: ''; width: 9px; height: 9px; border-radius: 3px; background: #68717b; }
.eyebrow--green::before { background: #62d275; }.eyebrow--blue::before { background: #4eaef4; }.eyebrow--purple::before { background: #8d56e8; }
.active-pilot__name-row { display: flex; align-items: center; gap: 22px; margin-bottom: 18px; }.active-pilot__name-row > strong,.active-pilot__empty-title { font-size: 24px; font-weight: 780; }
.status-pill,.grant-pill { padding: 3px 8px; border: 1px solid rgba(255,255,255,.18); border-radius: 5px; color: #a9b4bf; font-size: 9px; font-weight: 850; letter-spacing: .04em; text-transform: uppercase; white-space: nowrap; }
.status-pill.is-online,.grant-pill.is-permanent { border-color: rgba(74,198,91,.42); color: #62d26d; }.status-pill.is-offline { color: #818b95; }
.active-pilot__meta { display: flex; align-items: center; gap: 9px; margin: 10px 0; color: #e2e7ec; font-size: 12px; }.check { color: #53c866; font-weight: 900; }.clock { color: #77838e; font-size: 18px; }
.active-pilot__disconnect { float: right; margin-top: -36px; }.cell-note { margin: 16px 0 0; color: #a7b0ba; font-size: 12px; line-height: 1.55; }.cell-error { color: #ffbd55; font-size: 11px; }.cell-notice { color: #54b9f5; font-size: 11px; }
.search-input { width: 100%; min-height: 42px; padding: 0 14px; border: 1px solid rgba(255,255,255,.16); border-radius: 8px; outline: 0; background: #0b1219; color: #fff; font: inherit; }.search-input:focus { border-color: rgba(53,169,242,.75); box-shadow: 0 0 0 3px rgba(53,169,242,.1); }.search-input::placeholder { color: #818b96; }
.search-results { display: grid; gap: 6px; margin: 10px 0 0; padding: 0; list-style: none; }.search-results li { display: flex; align-items: center; gap: 6px; }.search-results strong { flex: 1; font-size: 12px; }
.recent-list { display: grid; max-height: 142px; overflow-y: auto; }.recent-row { display: grid; grid-template-columns: 10px minmax(76px,.55fr) minmax(150px,1.15fr) 120px; align-items: center; gap: 9px; min-height: 39px; border-bottom: 1px solid rgba(255,255,255,.08); }.recent-row:last-child { border-bottom: 0; }.recent-row strong { overflow: hidden; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }.recent-row__detail { color: #9ca6b0; font-size: 11px; }.recent-row .btn { justify-self: end; width: 120px; }.recent-row--incoming .grant-pill { color: #b89ae9; }
.presence-dot { width: 9px; height: 9px; border-radius: 3px; background: #737d87; }.presence-dot.is-online { background: #5fcf70; }.presence-dot.is-waiting { background: #ffbd55; }.presence-dot.is-incoming { background: #8d56e8; }
.btn { min-height: 34px; padding: 5px 12px; border: 1px solid rgba(53,169,242,.46); border-radius: 7px; background: rgba(18,91,137,.08); color: #55baf5; font: inherit; font-size: 11px; cursor: pointer; }.btn:hover:not(:disabled),.btn:focus-visible { background: rgba(53,169,242,.14); }.btn:disabled { opacity: .48; cursor: default; }.btn--primary { background: #35a9f2; color: #041019; font-weight: 800; }.btn--ghost { border-color: rgba(255,255,255,.13); color: #9ca7b2; background: transparent; }
.invite { padding: 10px 12px; border: 1px solid rgba(53,169,242,.45); border-radius: 9px; background: rgba(53,169,242,.08); }.invite__row { display: flex; align-items: center; gap: 8px; }.invite__row p { flex: 1; margin: 0; font-size: 12px; }
.workspace { display: grid; grid-template-columns: minmax(650px,1.16fr) minmax(420px,.84fr); gap: 12px; align-items: stretch; }
.strategy { display: flex; min-width: 0; flex-direction: column; gap: 10px; padding: 16px 14px 12px; border: 1px solid rgba(255,255,255,.12); border-radius: 10px; background: #101820; }.panel-title { margin: 0 7px 2px; font-size: 16px; font-weight: 850; }.strategy__body { display: grid; grid-template-rows: auto minmax(0,1fr) auto auto; gap: 9px; flex: 1; }.strategy-topline,.service-row,.repairs,.tyres-card { border: 1px solid rgba(255,255,255,.09); border-radius: 8px; background: rgba(255,255,255,.018); }
.strategy-topline { display: grid; grid-template-columns: 1fr 1fr; align-items: center; gap: 42px; min-height: 59px; padding: 9px 18px; }.static-control { display: flex; align-items: center; justify-content: space-between; gap: 12px; color: #d9e0e7; font-size: 12px; }.static-stepper { display: grid; grid-template-columns: 35px 78px 35px; align-items: center; overflow: hidden; border: 1px solid rgba(255,255,255,.1); border-radius: 7px; }.static-stepper button,.static-stepper strong { display: grid; place-items: center; height: 34px; padding: 0; line-height: 1; }.static-stepper button { border: 0; background: rgba(255,255,255,.05); color: #66717c; }.static-stepper strong { font-size: 12px; font-variant-numeric: tabular-nums; }
.tyres-card { padding: 15px 18px 14px; }.tyres-card h3 { margin: 0 0 10px; color: #dfe5eb; font-size: 12px; font-weight: 500; }.tyres-layout { display: grid; grid-template-columns: minmax(0,1fr) 155px; min-height: 260px; }.pressure-map { position: relative; min-width: 0; border-right: 1px solid rgba(255,255,255,.13); }.car-silhouette { position: absolute; top: 0; left: 50%; width: 132px; height: 244px; object-fit: contain; transform: translateX(-50%); opacity: 1; user-select: none; -webkit-user-drag: none; }.tyre-control { position: absolute; z-index: 1; width: 140px; }.tyre-control--fl { top: 22px; left: 24px; }.tyre-control--fr { top: 22px; right: 24px; }.tyre-control--rl { bottom: 18px; left: 24px; }.tyre-control--rr { right: 24px; bottom: 18px; }
.tyre-settings { display: flex; flex-direction: column; justify-content: center; gap: 19px; padding-left: 26px; }.tyre-settings :deep(.field--bare) { display: grid; justify-items: stretch; gap: 7px; }.tyre-settings :deep(.field__head) { white-space: nowrap; }.tyre-settings :deep(.stepper) { width: 132px; }.tyre-settings :deep(.value) { width: 62px; min-width: 62px; max-width: 62px; }.select-control { display: flex; flex-direction: column; gap: 7px; color: #dce3e9; font-size: 12px; }.select-control select { width: 100%; min-height: 39px; padding: 0 11px; border: 1px solid rgba(255,255,255,.12); border-radius: 7px; background: #0b1219; color: #fff; font: inherit; }.check-control { display: flex; align-items: center; gap: 9px; color: #dfe4e9; font-size: 12px; cursor: pointer; }.check-control input { width: 18px; height: 18px; margin: 0; accent-color: #35a9f2; }.check-control--disabled { opacity: .52; cursor: not-allowed; }
.service-row { display: grid; grid-template-columns: 1fr .9fr; align-items: end; gap: 36px; padding: 9px 16px; }.select-control--driver { display: grid; grid-template-columns: 100px minmax(160px,1fr); align-items: center; }.repairs { display: flex; align-items: center; gap: 28px; min-width: 0; margin: 0; padding: 9px 16px 12px; }.repairs legend { padding: 0; margin-bottom: 6px; color: #dbe2e8; font-size: 12px; }
.order-info { padding: 10px 12px; border: 1px solid rgba(255,255,255,.08); border-radius: 7px; background: rgba(0,0,0,.12); }.order-info__head { display: flex; justify-content: space-between; gap: 12px; font-size: 11px; }.order-info__head span { color: #63d16f; }.order-info__head span.is-problem { color: #ffbd55; }.order-info p { margin: 7px 0 0; color: #9ba8b5; font-size: 11px; }.outcomes { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 8px; }.outcome { padding: 2px 6px; border: 1px solid rgba(255,255,255,.13); border-radius: 5px; color: #7d8995; font-size: 9px; }.outcome--verified { color: #63d16f; }.outcome--selected { color: #35a9f2; }
:deep(.field--bare) { min-width: 0; }:deep(.field--bare .field__head strong) { color: #dce3e9; font-size: 12px; font-weight: 500; letter-spacing: 0; }:deep(.field--bare .stepper) { gap: 0; overflow: hidden; border: 1px solid rgba(255,255,255,.1); border-radius: 7px; box-sizing: border-box; }:deep(.field--bare .stepper > button) { width: 35px; min-height: 34px; border: 0; border-radius: 0; background: rgba(255,255,255,.045); font-size: 16px; }:deep(.field--bare .value) { width: 70px; min-width: 70px; max-width: 70px; min-height: 34px; padding: 2px 7px; border-width: 0 1px; border-radius: 0; }:deep(.field--bare .value input) { font-size: 15px; font-weight: 800; text-align: center; }:deep(.field--bare .stepper__unit) { min-width: 25px; font-size: 10px; }:deep(.field--bare .echo) { display: none; }.strategy-topline :deep(.field--bare) { display: flex; flex-wrap: nowrap; align-items: center; justify-content: space-between; }.strategy-topline :deep(.field__head) { white-space: nowrap; }.tyre-control :deep(.field--bare) { display: grid; gap: 6px; }.tyre-control :deep(.stepper) { display: grid; grid-template-columns: 34px 70px 34px; }.tyre-control :deep(.stepper > button) { width: 34px; }.tyre-control :deep(.field__head) { justify-content: flex-start; }.tyre-control :deep(.field__head strong) { color: #f3f5f7; font-size: 11px; font-weight: 650; }
@media (max-width: 1180px) { .connections { grid-template-columns: 1fr 1fr; }.connection-cell--recent { grid-column: 1 / -1; } }
@media (min-width: 1121px) and (max-width: 1280px) { .tyre-control--fl,.tyre-control--rl { left: 18px; }.tyre-control--fr,.tyre-control--rr { right: 18px; } }
@media (max-width: 1120px) { .workspace { grid-template-columns: 1fr; } }
@media (max-width: 760px) { .pitwall-page { padding-inline: 10px; }.connections { grid-template-columns: 1fr; }.connection-cell--recent { grid-column: auto; }.recent-list { max-height: none; overflow-y: visible; }.strategy-topline,.service-row { grid-template-columns: 1fr; }.tyres-layout { grid-template-columns: 1fr; }.pressure-map { min-height: 280px; border-right: 0; border-bottom: 1px solid rgba(255,255,255,.13); }.tyre-settings { padding: 18px 0 0; }.recent-row { grid-template-columns: 10px 1fr; padding: 7px 0; }.recent-row > :nth-child(n+3) { grid-column: 2; }.recent-row .btn { justify-self: start; }.repairs { flex-wrap: wrap; } }
@media (max-width: 480px) { .pressure-map { min-height: 348px; }.car-silhouette { top: 79px; width: 101px; height: 187px; }.tyre-control { width: 140px; }.tyre-control--fl { top: 8px; left: 0; }.tyre-control--fr { top: 8px; right: 0; }.tyre-control--rl { bottom: 10px; left: 0; }.tyre-control--rr { right: 0; bottom: 10px; }.tyre-control :deep(.stepper) { grid-template-columns: 44px 52px 44px; }.tyre-control :deep(.stepper > button) { width: 44px; min-height: 44px; }.tyre-control :deep(.value) { width: 52px; min-width: 52px; max-width: 52px; min-height: 44px; } }
</style>
