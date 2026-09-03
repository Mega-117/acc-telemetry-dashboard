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
  PITWALL_BRAKE_COMPOUND_MAX,
  PITWALL_BRAKE_COMPOUND_MIN,
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
  brakeFront: 'Freno ant.', brakeRear: 'Freno post.',
}

export interface PitwallFieldOutcomeRow {
  field: string
  label: string
  outcome: 'verified' | 'selected' | 'not-verifiable' | null
  reason: string | null
  /** Da dove viene l'esito: `screen` e' l'occhio del PC del pilota sul Pit MFD. */
  via: 'screen' | 'memory' | 'blind' | null
  /** Cio' che c'era davvero, quando il PC del pilota l'ha riletto. */
  observed: unknown
  requested: unknown
  /** Non chiesta: ACC l'ha cambiata insieme a un'altra riparazione. */
  dragged: boolean
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
  /**
   * Le mescole dei freni: hanno senso solo con la sostituzione accesa, perche'
   * sono le due righe che quella casella apre nel Pit MFD. `null` = non
   * toccare, come tutto il resto.
   */
  const brakeFront = ref<number | null>(null)
  const brakeRear = ref<number | null>(null)
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
      brakeFront: null,
      brakeRear: null,
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
    brakeFront: brakeFront.value,
    brakeRear: brakeRear.value,
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

  /**
   * L'ultimo valore copiato dalla macchina, campo per campo.
   *
   * Un campo che l'ingegnere non ha mosso da allora segue la macchina: ACC
   * riscrive le pressioni quando cambia la mescola, e il preset riscrive tutto.
   * Senza questo, dopo Dry→Wet un ordine di solo carburante riporterebbe di
   * nascosto le pressioni della Dry, perche' il piano le teneva ancora
   * (visto in pista, PIP-360).
   */
  let synced: { fuel: number, tyreSet: number, compound: PitwallCompound, pressures: Record<PitwallWheel, number> } | null = null
  function rememberSynced(): void {
    synced = { fuel: fuelLiters.value, tyreSet: tyreSet.value, compound: compound.value, pressures: { ...pressures.value } }
  }
  function followCar(next: PitwallCarState): void {
    if (!synced) return
    if (fuelLiters.value === synced.fuel) fuelLiters.value = next.fuelLiters
    if (tyreSet.value === synced.tyreSet) tyreSet.value = next.tyreSet
    if (!compoundTouched.value && compound.value === synced.compound) compound.value = next.compound
    const followed = { ...pressures.value }
    for (const wheel of PITWALL_WHEELS) {
      if (Math.abs(pressures.value[wheel] - synced.pressures[wheel]) < 0.05) followed[wheel] = next.pressures[wheel]
    }
    pressures.value = followed
    // La base e' cio' che la macchina ha detto, mai cio' che il piano contiene:
    // altrimenti un valore appena toccato verrebbe scambiato per "sincronizzato"
    // e riportato indietro al battito successivo (visto in pista).
    synced = { fuel: next.fuelLiters, tyreSet: next.tyreSet, compound: next.compound, pressures: { ...next.pressures } }
  }

  /**
   * Le caselle che ACC non rilegge sono richieste una tantum: consegnate,
   * tornano a "non toccare". Se restassero, ogni ordine successivo le
   * rimanderebbe e il bottone non direbbe mai "nessuna modifica". Restano
   * invece quando l'ordine fallisce o e' rifiutato: si rimanda.
   */
  function clearOneShotFields(): void {
    changeTyres.value = null
    brakes.value = null
    brakeFront.value = null
    brakeRear.value = null
    repairBodywork.value = null
    repairSuspension.value = null
    driverId.value = null
    pitStrategy.value = null
  }
  watch(() => link.orderStatus.value, (status) => {
    if (status === 'applied' || status === 'partial') clearOneShotFields()
  })

  let planInitialised = false
  watch(() => link.selectedRoomId.value, () => { planInitialised = false; synced = null })
  watch(car, (next) => {
    if (!session.value?.strategy) return
    if (!planInitialised) {
      planInitialised = true
      resetToCar()
      return
    }
    followCar(next)
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
    brakeFront.value = null
    brakeRear.value = null
    repairBodywork.value = null
    repairSuspension.value = null
    rememberSynced()
  }

  /**
   * Su e giu' fra le quattro mescole, con un giro in tondo su "non toccare".
   *
   * Come il preset, la prima posizione e' l'assenza: se non si sceglie niente
   * la riga non viene toccata, e senza la sostituzione freni accesa non
   * potrebbe nemmeno esserlo.
   */
  function stepBrakeCompound(which: 'front' | 'rear', direction: 1 | -1) {
    const field = which === 'front' ? brakeFront : brakeRear
    const current = field.value
    if (current == null) {
      field.value = direction > 0 ? PITWALL_BRAKE_COMPOUND_MIN : null
      return
    }
    const next = current + direction
    field.value = next < PITWALL_BRAKE_COMPOUND_MIN
      ? null
      : Math.min(PITWALL_BRAKE_COMPOUND_MAX, next)
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
    // Le mescole non partono se in questo stesso ordine i freni si stanno
    // **spegnendo**: quelle righe sparirebbero. In tutti gli altri casi
    // viaggiano, e a decidere se si possono applicare e' il PC del pilota, che
    // sonda la casella vera invece di fidarsi di cio' che crediamo noi.
    if (brakes.value !== false) {
      if (brakeFront.value != null) payload.brakeFront = brakeFront.value
      if (brakeRear.value != null) payload.brakeRear = brakeRear.value
    }
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
    // Le caselle non chieste stavolta restano quelle dell'ordine precedente:
    // "in macchina" per loro e' l'ultima richiesta fatta, non l'ultimo ordine.
    const previous = sentPlan.value
    sentPlan.value = {
      ...plan.value,
      pressures: { ...pressures.value },
      changeTyres: changeTyres.value ?? previous?.changeTyres ?? null,
      brakes: brakes.value ?? previous?.brakes ?? null,
      repairBodywork: repairBodywork.value ?? previous?.repairBodywork ?? null,
      repairSuspension: repairSuspension.value ?? previous?.repairSuspension ?? null,
      driverId: driverId.value ?? previous?.driverId ?? null,
      pitStrategy: pitStrategy.value ?? previous?.pitStrategy ?? null,
    }
    const payload = planPayload()
    // Cio' che e' partito e' la nuova base: da qui in poi, finche' l'ingegnere
    // non lo tocca di nuovo, segue quello che la macchina rilegge.
    compoundTouched.value = false
    rememberSynced()
    return link.sendPlan(payload)
  }

  const fieldOutcomes = computed<PitwallFieldOutcomeRow[]>(() => Object.entries(link.orderFields.value).map(([field, outcome]) => ({
    field,
    label: PITWALL_FIELD_LABELS[field] ?? field,
    outcome: outcome?.outcome ?? null,
    reason: outcome?.reason ?? null,
    via: outcome?.via ?? null,
    observed: outcome?.observed ?? null,
    requested: outcome?.requested ?? null,
    dragged: outcome?.dragged === true,
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
    brakeFront,
    brakeRear,
    stepBrakeCompound,
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
