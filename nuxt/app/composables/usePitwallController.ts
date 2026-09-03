// ============================================
// La logica del muretto, staccata dalla pagina.
//
// Qui vive cio' che rende corretto un ordine: quale fotografia della vettura
// vale come base (solo se fresca), cosa finisce nel payload (solo cio' che
// cambia; `null` e' silenzio), perche' l'invio e' spento, e come si legge
// l'esito campo per campo. Prima stava dentro `PitwallPage.vue`; ora lo usano
// sia la vista Legacy sia quella nuova, senza che nessuna delle due ne tenga
// una copia che possa divergere (Principio 2).
//
// Non monta niente e non parla con Firestore: riceve `link` (la stanza) e
// `trust` (i permessi) gia' costruiti, e deriva.
// ============================================

import { computed, ref, watch } from 'vue'
import type { usePitwallRoom } from '~/composables/usePitwallRoom'
import type { usePitwallLink } from '~/composables/usePitwallLink'
import { describePitwallGrantScope } from '~/services/pitwall/pitwallLink'
import type { PitwallSession } from '~/services/pitwall/pitwallLink'
import { PITWALL_MEMBER_FRESH_MS } from '~/services/pitwall/pitwallRoomContract'
import {
  PITWALL_COMPOUNDS,
  PITWALL_PIT_STRATEGY_MAX,
  PITWALL_PIT_STRATEGY_MIN,
  PITWALL_WHEELS,
  buildPitwallChangeChips,
  buildPitwallEcho,
  clampCompound,
  clampPressure,
  estimatePitStop,
  formatCompound,
  resolvePitwallOrderStatus,
  stepPressure,
  type PitwallCarState,
  type PitwallCompound,
  type PitwallDriver,
  type PitwallPlan,
  type PitwallWheel,
} from '~/utils/pitwallPresentation'

export type PitwallRoomHandle = ReturnType<typeof usePitwallRoom>
export type PitwallTrustHandle = ReturnType<typeof usePitwallLink>

/** Le parole per campo dell'esito, con le chiavi che il PC del pilota scrive. */
export const PITWALL_FIELD_LABELS: Record<string, string> = {
  fuelLiters: 'Carburante', tyreSet: 'Set', compound: 'Mescola', pressureFL: 'FL', pressureFR: 'FR',
  pressureRL: 'RL', pressureRR: 'RR', changeTyres: 'Cambio gomme', repairBodywork: 'Carrozzeria',
  repairSuspension: 'Sospensioni', driverId: 'Pilota', pitStrategy: 'Strategia', brakes: 'Freni',
}

export interface PitwallFieldOutcomeRow {
  field: string
  label: string
  outcome: 'verified' | 'selected' | 'not-verifiable' | null
  reason: string | null
}

export function usePitwallController(link: PitwallRoomHandle, trust: PitwallTrustHandle) {
  const nowTick = computed(() => link.nowTick.value)

  /**
   * La fotografia della vettura arriva da chi e' al volante, non da un "pilota
   * assistito": e' l'unico che la vede davvero. Si rimodella nella forma che la
   * scheda macchina conosce gia', invece di riscrivere la scheda.
   */
  const session = computed<PitwallSession | null>(() => {
    const snapshot = link.carSnapshot.value
    const room = link.room.value
    if (!snapshot || !room) return null
    return {
      schemaVersion: 1,
      driverUid: link.executor.value.executor?.uid ?? '',
      sessionId: room.roomId,
      online: true,
      updatedAt: new Date(snapshot.updatedAtMs).toISOString(),
      car: null,
      track: room.track ?? null,
      crew: snapshot.crew,
      strategy: snapshot.strategy as PitwallSession['strategy'],
    }
  })

  const presenceAgeSeconds = computed(() => {
    const updatedAtMs = link.carSnapshot.value?.updatedAtMs
    if (!updatedAtMs) return null
    return Math.max(0, Math.round((nowTick.value - updatedAtMs) / 1000))
  })
  const carFresh = computed(() => (
    presenceAgeSeconds.value != null && presenceAgeSeconds.value <= PITWALL_MEMBER_FRESH_MS / 1000
  ))
  const drivers = computed<PitwallDriver[]>(() => (
    (session.value?.crew ?? []).map(member => ({ id: String(member.driverIndex), name: member.name }))
  ))

  const pressures = ref<Record<PitwallWheel, number>>({ FL: 25, FR: 25, RL: 25, RR: 25 })
  const fuelLiters = ref(0)
  const compound = ref<PitwallCompound>('dry')
  const compoundTouched = ref(false)
  const tyreSet = ref(1)
  // Tre stati, non due: true accendi, false spegni, null non toccare. Con una
  // semplice casella l'ingegnere non poteva spegnere niente, e quello che
  // impostava non arrivava fedelmente in macchina.
  const changeTyres = ref<boolean | null>(null)
  const driverId = ref<string | null>(null)
  /** null = non toccare la strategia. Sceglierla riscrive tutto il resto. */
  const pitStrategy = ref<number | null>(null)
  const brakes = ref<boolean | null>(null)
  const repairBodywork = ref<boolean | null>(null)
  const repairSuspension = ref<boolean | null>(null)
  const sentPlan = ref<PitwallPlan | null>(null)

  const car = computed<PitwallCarState>(() => {
    const strategy = session.value?.strategy ?? null
    const current = (session.value?.crew ?? []).find(member => member.current) ?? null
    return {
      pressures: strategy?.pressures ?? { ...pressures.value },
      fuelLiters: strategy?.fuelToAdd ?? fuelLiters.value,
      compound: (strategy?.compound as PitwallCompound | null | undefined) ?? compound.value,
      tyreSet: strategy?.tyreSet ?? tyreSet.value,
      // ACC non rilegge nessuna di queste caselle: in macchina restano ignote,
      // e ignoto non e' "spento". Dirlo con null evita di mostrare all'ingegnere
      // uno stato che nessuno ha verificato.
      changeTyres: null,
      driverId: current ? String(current.driverIndex) : driverId.value,
      pitStrategy: null,
      brakes: null,
      repairBodywork: null,
      repairSuspension: null,
      inPitLane: false,
    }
  })

  const plan = computed<PitwallPlan>(() => ({
    pitStrategy: pitStrategy.value,
    pressures: pressures.value,
    fuelLiters: fuelLiters.value,
    compound: compound.value,
    tyreSet: tyreSet.value,
    changeTyres: changeTyres.value,
    driverId: driverId.value,
    brakes: brakes.value,
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
  watch(() => link.selectedRoomId.value, () => { planInitialised = false })
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

  /**
   * Off → 1 → 2 … e ritorno a Off scendendo sotto la prima.
   *
   * "Off" non e' la strategia zero: e' "non toccare la riga". Serve perche' il
   * preset riscrive carburante, gomme e pressioni, quindi mandarlo per sbaglio
   * cancellerebbe tutto il resto dell'ordine.
   */
  function stepPitStrategy(direction: 1 | -1) {
    const current = pitStrategy.value
    if (current == null) {
      pitStrategy.value = direction > 0 ? PITWALL_PIT_STRATEGY_MIN : null
      return
    }
    const next = current + direction
    pitStrategy.value = next < PITWALL_PIT_STRATEGY_MIN
      ? null
      : Math.min(PITWALL_PIT_STRATEGY_MAX, next)
  }

  function setCompound(value: unknown) {
    compound.value = clampCompound(value)
    compoundTouched.value = true
  }

  function onCompoundChange(event: Event) {
    setCompound((event.target as HTMLSelectElement).value)
  }

  function resetToCar() {
    pressures.value = { ...car.value.pressures }
    fuelLiters.value = car.value.fuelLiters
    compound.value = car.value.compound
    compoundTouched.value = false
    tyreSet.value = car.value.tyreSet
    // Tutto cio' che ACC non rilegge torna a "non toccare": e' l'unica posizione
    // onesta, perche' non sappiamo da dove si parte.
    changeTyres.value = null
    driverId.value = null
    pitStrategy.value = null
    brakes.value = null
    repairBodywork.value = null
    repairSuspension.value = null
  }

  /**
   * Il payload e' sparso: una chiave presente e' "cambia questo", una chiave
   * assente e' "non toccare". La base e' la fotografia della vettura solo se
   * fresca: un dato vecchio non e' una base, e' una supposizione.
   */
  function planPayload(): Record<string, unknown> {
    const strategy = carFresh.value ? session.value?.strategy ?? null : null
    const payload: Record<string, unknown> = {}
    if (strategy?.fuelToAdd == null || Math.abs(strategy.fuelToAdd - fuelLiters.value) >= 0.5) payload.fuelLiters = fuelLiters.value
    if (strategy?.tyreSet == null || strategy.tyreSet !== tyreSet.value) payload.tyreSet = tyreSet.value
    if (!strategy?.pressures || PITWALL_WHEELS.some(wheel => Math.abs((strategy.pressures?.[wheel] ?? Number.NaN) - pressures.value[wheel]) >= 0.05)) {
      payload.pressures = { ...pressures.value }
    }
    if (compoundTouched.value || (strategy?.compound != null && strategy.compound !== compound.value)) payload.compound = compound.value
    // La strategia parte solo se scelta esplicitamente: e' l'unico campo che
    // riscrive tutti gli altri, quindi non deve mai finire nell'ordine per inerzia.
    if (pitStrategy.value != null) payload.pitStrategy = pitStrategy.value
    // Si manda anche lo spento: `false` e' una richiesta, `null` e' il silenzio.
    if (changeTyres.value != null) payload.changeTyres = changeTyres.value
    if (brakes.value != null) payload.brakes = brakes.value
    if (repairBodywork.value != null) payload.repairBodywork = repairBodywork.value
    if (repairSuspension.value != null) payload.repairSuspension = repairSuspension.value
    if (driverId.value != null) payload.driverId = driverId.value
    return payload
  }

  const hasChanges = computed(() => Object.keys(planPayload()).length > 0)
  /** Spento anche quando ci sono modifiche, se l'ordine non potrebbe partire. */
  const sendEnabled = computed(() => hasChanges.value && link.canSend.value)
  const pendingRequests = computed(() => trust.pendingIncoming.value)
  /**
   * Chi ho autorizzato ad assistermi, tolti quelli che sono gia' nella gara.
   *
   * Sono due cose diverse - il permesso fra due account e l'equipaggio di questa
   * corsa - ma vederle nella stessa lista con lo stesso nome due volte fa solo
   * chiedere quale delle due righe conti. Chi e' gia' dentro si legge
   * nell'equipaggio; qui resta chi non c'e' ancora.
   */
  const trustedEngineers = computed(() => {
    const inRoom = new Set(link.crew.value.map(person => person.uid))
    return trust.grantedIncoming.value.filter(request => !inRoom.has(request.engineerUid))
  })

  function requesterName(request: { nickname: string | null, engineerUid: string }): string {
    return request.nickname || request.engineerUid
  }

  /**
   * Perche' l'invio e' spento, detto in una frase utile.
   * "Non e' il momento" senza motivo e' il modo piu' rapido di far sembrare
   * rotto un collegamento che funziona.
   */
  const blockedReason = computed<string | null>(() => {
    if (!link.room.value) return 'Nessuna gara selezionata.'
    if (link.roomClosed.value) return 'Questa gara e chiusa: non accetta piu strategie.'
    if (!link.amMember.value) return 'Non sei ancora entrato in questa gara.'
    if (link.executor.value.reason !== 'ready') return link.executorLabel.value
    if (!hasChanges.value) return 'Nessuna modifica da inviare.'
    return null
  })

  async function sendToCar(): Promise<boolean> {
    sentPlan.value = { ...plan.value, pressures: { ...pressures.value } }
    return link.sendPlan(planPayload())
  }

  const fieldOutcomes = computed<PitwallFieldOutcomeRow[]>(() => Object.entries(link.orderFields.value).map(([field, outcome]) => ({
    field,
    label: PITWALL_FIELD_LABELS[field] ?? field,
    outcome: outcome?.outcome ?? null,
    reason: outcome?.reason ?? null,
  })))

  function scopeLabel(request: { scope: 'once' | 'always' | null, expiresAtMs: number | null }): string {
    return describePitwallGrantScope(request)
  }

  /** Etichetta di stato della gara, senza gergo e senza identificativi tecnici. */
  const roomStateLabel = computed(() => {
    if (!link.room.value) return 'Nessuna gara'
    if (link.roomClosed.value) return 'CHIUSA'
    return link.executor.value.reason === 'ready' ? 'IN PISTA' : 'IN ATTESA'
  })

  return {
    nowTick,
    session,
    presenceAgeSeconds,
    carFresh,
    drivers,
    pressures,
    fuelLiters,
    compound,
    compoundTouched,
    tyreSet,
    changeTyres,
    driverId,
    pitStrategy,
    brakes,
    repairBodywork,
    repairSuspension,
    sentPlan,
    car,
    plan,
    echo,
    changeChips,
    orderStatus,
    stopEstimate,
    mfdPlan,
    compoundOptions,
    driverOptions,
    adjustPressure,
    setPressure,
    stepPitStrategy,
    setCompound,
    onCompoundChange,
    resetToCar,
    planPayload,
    hasChanges,
    sendEnabled,
    pendingRequests,
    trustedEngineers,
    requesterName,
    blockedReason,
    sendToCar,
    fieldOutcomes,
    scopeLabel,
    roomStateLabel,
  }
}
