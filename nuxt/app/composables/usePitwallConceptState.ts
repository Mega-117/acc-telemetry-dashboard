// Lo stato del prototipo Pit Wall, in un posto solo: la presa "finta".
//
// E' la stessa forma dello store vero (`PitwallStore`), riempita con fixture
// invece che con Firestore. Serve a due cose: i test dei componenti, che cosi'
// non hanno bisogno di una rete, e la demo "molti dati", che porta gli elenchi
// ai tetti veri per guardare gli edge case invece di descriverli.
//
// Le funzioni sono gli stessi gesti che il dominio reale sa gia' fare
// (chiedere, autorizzare, invitare, entrare, promuovere, togliere, uscire,
// chiudere), cosi' cambiare presa non cambia i componenti.
import { computed, ref } from 'vue'
import type { PitwallStopHandle, PitwallStore } from '~/composables/usePitwallStore'
import {
  PITWALL_CONCEPT_CURRENT_USER_ID,
  PITWALL_CONCEPT_FRIENDS,
  PITWALL_CONCEPT_NOTICES,
  PITWALL_CONCEPT_MY_ROOM,
  PITWALL_CONCEPT_PEOPLE,
  PITWALL_CONCEPT_RACES,
  buildPitwallConceptCrowd,
  pitwallConceptSendBlock,
  searchPitwallConceptDirectory,
} from '~/utils/pitwallConcept'
import type {
  PitwallConceptFriend,
  PitwallConceptMyRoom,
  PitwallConceptNotice,
  PitwallConceptRace,
} from '~/utils/pitwallConcept'
import type { PitwallIntentStatus } from '~/composables/usePitwallIntent'
import {
  PITWALL_PIT_STRATEGY_MAX,
  PITWALL_PIT_STRATEGY_MIN,
  PITWALL_WHEELS,
  clampCompound,
  clampPressure,
  estimatePitStop,
  stepPressure,
  type PitwallCarState,
  type PitwallCompound,
  type PitwallWheel,
} from '~/utils/pitwallPresentation'
import type { PitwallOrderStatus } from '~/services/pitwall/pitwallLink'
import type { PitwallFieldOutcomeRow } from '~/composables/usePitwallController'

interface PitwallConceptStore {
  friends: PitwallConceptFriend[]
  races: PitwallConceptRace[]
  myRoom: PitwallConceptMyRoom | null
  /** Nel prototipo il Pitwall parte aperto: la card si guarda senza ACC. */
  pitwall: PitwallIntentStatus
  notices: PitwallConceptNotice[]
  selectedRaceId: string | null
  crowded: boolean
}

/**
 * Le fixture sono l'origine, non lo stato: si copiano in profondita' perche'
 * ricaricare la pagina debba ripartire davvero da capo e perche' un test non
 * possa sporcare quello successivo.
 *
 * Con `crowded` gli elenchi partono ai tetti veri del servizio: e' l'unico modo
 * di guardare gli edge case invece di descriverli.
 */
function initialStore(crowded = false): PitwallConceptStore {
  const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T
  const scenario = crowded
    ? buildPitwallConceptCrowd()
    : {
        friends: PITWALL_CONCEPT_FRIENDS,
        races: PITWALL_CONCEPT_RACES,
        notices: PITWALL_CONCEPT_NOTICES,
      }
  return {
    friends: clone(scenario.friends),
    races: clone(scenario.races),
    myRoom: clone(PITWALL_CONCEPT_MY_ROOM),
    pitwall: { state: 'open', roomId: PITWALL_CONCEPT_MY_ROOM.id, reason: null, available: true },
    notices: clone(scenario.notices),
    selectedRaceId: scenario.races[0]?.id ?? null,
    crowded,
  }
}

/** I campi che ACC rilegge: solo questi possono dirsi verificati. */
const READ_BACK = new Set(['fuelLiters', 'tyreSet', 'compound', 'pressureFL', 'pressureFR', 'pressureRL', 'pressureRR'])
const LABELS: Record<string, string> = {
  fuelLiters: 'Carburante', tyreSet: 'Set', compound: 'Mescola', pressureFL: 'FL', pressureFR: 'FR',
  pressureRL: 'RL', pressureRR: 'RR', changeTyres: 'Cambio gomme', repairBodywork: 'Carrozzeria',
  repairSuspension: 'Sospensioni', driverId: 'Pilota', pitStrategy: 'Strategia', brakes: 'Freni',
  brakeFront: 'Freno ant.', brakeRear: 'Freno post.',
}

/**
 * Il pit stop finto: stessi campi, stesso "non toccare", stesso esito per
 * campo dello store vero, ma senza un PC del pilota dall'altra parte. Inviare
 * passa da "in corso" e finisce applicata o in parte; premere di nuovo mentre
 * e' in corso e' il caso "prima accettata vince".
 */
function createMockStop(race: () => PitwallConceptRace | null): PitwallStopHandle {
  const pressures = ref<Record<PitwallWheel, number>>({ FL: 25, FR: 25, RL: 25, RR: 25 })
  const fuelLiters = ref(0)
  const compound = ref<PitwallCompound>('dry')
  const tyreSet = ref(1)
  const changeTyres = ref<boolean | null>(null)
  const brakes = ref<boolean | null>(null)
  const brakeFront = ref<number | null>(null)
  const brakeRear = ref<number | null>(null)
  const repairBodywork = ref<boolean | null>(null)
  const repairSuspension = ref<boolean | null>(null)
  const driverId = ref<string | null>(null)
  const pitStrategy = ref<number | null>(null)
  const orderStatus = ref<PitwallOrderStatus | null>(null)
  const orderReason = ref<string | null>(null)
  const fieldOutcomes = ref<PitwallFieldOutcomeRow[]>([])
  const seenOnScreen = ref<Record<string, unknown>>({})
  const lastOrder = ref<PitwallStopHandle['lastOrder']['value']>(null)
  let settleTimer: ReturnType<typeof setTimeout> | null = null

  const car = computed<PitwallCarState>(() => ({
    pressures: { FL: 25, FR: 25, RL: 25, RR: 25 },
    fuelLiters: 0,
    compound: 'dry',
    tyreSet: 1,
    changeTyres: null,
    driverId: null,
    pitStrategy: null,
    brakes: null,
    brakeFront: null,
    brakeRear: null,
    repairBodywork: null,
    repairSuspension: null,
    inPitLane: false,
  }))

  function changedFields(): string[] {
    const fields: string[] = []
    if (pitStrategy.value != null) fields.push('pitStrategy')
    if (fuelLiters.value !== car.value.fuelLiters) fields.push('fuelLiters')
    if (changeTyres.value != null) fields.push('changeTyres')
    if (tyreSet.value !== car.value.tyreSet) fields.push('tyreSet')
    if (compound.value !== car.value.compound) fields.push('compound')
    for (const wheel of PITWALL_WHEELS) {
      if (pressures.value[wheel] !== car.value.pressures[wheel]) fields.push(`pressure${wheel}`)
    }
    if (brakes.value != null) fields.push('brakes')
    // Come nel vero: le mescole viaggiano solo con la casella accesa.
    if (brakes.value === true && brakeFront.value != null) fields.push('brakeFront')
    if (brakes.value === true && brakeRear.value != null) fields.push('brakeRear')
    if (driverId.value != null) fields.push('driverId')
    if (repairSuspension.value != null) fields.push('repairSuspension')
    if (repairBodywork.value != null) fields.push('repairBodywork')
    return fields
  }

  const plan = computed(() => ({
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

  const hasChanges = computed(() => changedFields().length > 0)
  const blockedReason = computed(() => pitwallConceptSendBlock(race(), hasChanges.value))

  async function sendToCar(): Promise<boolean> {
    if (blockedReason.value) return false
    if (orderStatus.value === 'applying') {
      orderStatus.value = 'rejected'
      orderReason.value = 'Un altro ordine e gia in applicazione su questa vettura: questo e stato rifiutato, non unito.'
      return false
    }
    const fields = changedFields()
    // Nel vero, i campi che ACC rilegge arrivano dalla shared memory e gli
    // altri dall'occhio del PC del pilota sul Pit MFD: entrambi confermati,
    // con la provenienza accanto.
    fieldOutcomes.value = fields.map(field => ({
      field,
      label: LABELS[field] ?? field,
      outcome: 'verified',
      reason: READ_BACK.has(field) ? null : 'Confermato a schermo.',
      via: READ_BACK.has(field) ? 'memory' : 'screen',
      observed: null,
      requested: null,
      dragged: false,
    }))
    orderStatus.value = 'applying'
    orderReason.value = null
    lastOrder.value = { ...plan.value, pressures: { ...pressures.value } }
    if (settleTimer) clearTimeout(settleTimer)
    settleTimer = setTimeout(() => {
      const everythingVerified = fieldOutcomes.value.every(entry => entry.outcome === 'verified')
      orderStatus.value = everythingVerified ? 'applied' : 'partial'
      // Consegnate, le caselle tornano a "non toccare": come nel vero.
      changeTyres.value = null
      brakes.value = null
      brakeFront.value = null
      brakeRear.value = null
      repairBodywork.value = null
      repairSuspension.value = null
      driverId.value = null
      pitStrategy.value = null
    }, 1200)
    return true
  }

  return {
    pressures,
    fuelLiters,
    compound,
    tyreSet,
    changeTyres,
    brakes,
    brakeFront,
    brakeRear,
    stepBrakeCompound: (which, direction) => {
      const field = which === 'front' ? brakeFront : brakeRear
      const current = field.value
      if (current == null) {
        field.value = direction > 0 ? 1 : null
        return
      }
      const next = current + direction
      field.value = next < 1 ? null : Math.min(4, next)
    },
    repairBodywork,
    repairSuspension,
    driverId,
    pitStrategy,
    drivers: computed(() => [{ id: '1', name: 'lucab' }, { id: '2', name: 'mariorossi' }]),
    car,
    hasCarSnapshot: computed(() => race() != null),
    carFresh: ref(true),
    presenceAgeSeconds: ref(4),
    stopEstimate: computed(() => estimatePitStop(plan.value, car.value)),
    blockedReason,
    orderStatus,
    orderReason,
    fieldOutcomes,
    seenOnScreen,
    lastOrder,
    adjustPressure: (wheel, direction) => {
      pressures.value = { ...pressures.value, [wheel]: stepPressure(pressures.value[wheel], direction) }
    },
    setPressure: (wheel, value) => {
      pressures.value = { ...pressures.value, [wheel]: clampPressure(value) }
    },
    stepPitStrategy: (direction) => {
      const current = pitStrategy.value
      if (current == null) { pitStrategy.value = direction > 0 ? PITWALL_PIT_STRATEGY_MIN : null; return }
      const next = current + direction
      pitStrategy.value = next < PITWALL_PIT_STRATEGY_MIN ? null : Math.min(PITWALL_PIT_STRATEGY_MAX, next)
    },
    setCompound: (value) => { compound.value = clampCompound(value) },
    resetToCar: () => {
      pressures.value = { ...car.value.pressures }
      fuelLiters.value = car.value.fuelLiters
      compound.value = car.value.compound
      tyreSet.value = car.value.tyreSet
      changeTyres.value = null
      driverId.value = null
      pitStrategy.value = null
      brakes.value = null
      repairBodywork.value = null
      repairSuspension.value = null
    },
    sendToCar,
  }
}

export function usePitwallConceptState(): PitwallStore & { reset: () => void } {
  const store = useState<PitwallConceptStore>('pitwall-concept-store', initialStore)

  const friends = computed(() => store.value.friends)
  const pitwall = computed(() => store.value.pitwall)
  /** Solo gli amici con il Pitwall aperto, come nel vero. */
  const races = computed(() => {
    const open = new Set(store.value.friends.filter(friend => friend.pitwallOpen).map(friend => friend.raceId))
    return store.value.races.filter(race => open.has(race.id))
  })
  /**
   * Nel prototipo la gara del pilota c'e' sempre, cosi' la card si puo'
   * guardare senza ACC aperto. Nel vero e' `null` quasi sempre.
   */
  const myRoom = computed(() => store.value.myRoom)
  const notices = computed(() => store.value.notices)
  const selectedRace = computed<PitwallConceptRace | null>(
    () => store.value.races.find(race => race.id === store.value.selectedRaceId) ?? null,
  )
  const people = computed(() => PITWALL_CONCEPT_PEOPLE)

  /** "Ce l'hai gia'" per chiunque sia gia' nella lista Amici, in qualunque stato. */
  const linkedIds = computed(() => store.value.friends.map(friend => friend.personId))

  const searchQuery = ref('')
  const found = computed(() => searchPitwallConceptDirectory(searchQuery.value, linkedIds.value))

  function findRace(raceId: string): PitwallConceptRace | undefined {
    return store.value.races.find(race => race.id === raceId)
  }

  // ---- Amici -------------------------------------------------------------

  /** Chiedere e accettare sono lo stesso gesto: una richiesta ricevuta diventa amicizia, altrimenti parte la mia. */
  function befriend(personId: string): void {
    const existing = store.value.friends.find(friend => friend.personId === personId)
    if (existing) {
      if (existing.state === 'received') existing.state = 'friends'
    } else {
      store.value.friends.push({ personId, state: 'sent', racing: false, pitwallOpen: false })
    }
    searchQuery.value = ''
  }

  /** Rifiutare, annullare, togliere: la riga sparisce, da qualunque stato. */
  function unfriend(personId: string): void {
    store.value.friends = store.value.friends.filter(friend => friend.personId !== personId)
  }

  // ---- Il mio Pitwall ------------------------------------------------------

  function startPitwall(): void {
    store.value.myRoom = { ...(store.value.myRoom ?? PITWALL_CONCEPT_MY_ROOM), state: 'live' }
    store.value.pitwall = { state: 'open', roomId: store.value.myRoom.id, reason: null, available: true }
  }

  function closePitwall(): void {
    if (store.value.myRoom) store.value.myRoom.state = 'closed'
    store.value.pitwall = { state: 'off', roomId: null, reason: null, available: true }
  }

  // ---- Gara --------------------------------------------------------------

  function selectRace(raceId: string): void {
    if (findRace(raceId)) store.value.selectedRaceId = raceId
  }

  /** Entrare significa smettere di essere solo invitato. */
  function enterRace(raceId: string, userId = PITWALL_CONCEPT_CURRENT_USER_ID): void {
    const race = findRace(raceId)
    const member = race?.members.find(entry => entry.personId === userId)
    if (member?.role === 'invited') member.role = 'member'
    if (race) store.value.selectedRaceId = race.id
  }

  /** Uscire lascia la gara in piedi per gli altri: non la chiude. */
  function leaveRace(raceId: string, userId = PITWALL_CONCEPT_CURRENT_USER_ID): void {
    const race = findRace(raceId)
    if (!race || race.hostId === userId) return
    race.members = race.members.filter(member => member.personId !== userId)
  }

  function inviteToRace(raceId: string, personId: string): void {
    const race = findRace(raceId)
    if (!race || race.members.some(member => member.personId === personId)) return
    race.members.push({ personId, role: 'invited', driving: false, online: false })
  }

  function promoteInRace(raceId: string, personId: string): void {
    const member = findRace(raceId)?.members.find(entry => entry.personId === personId)
    if (member?.role === 'member') member.role = 'manager'
  }

  function removeFromRace(raceId: string, personId: string): void {
    const race = findRace(raceId)
    if (!race || race.hostId === personId) return
    race.members = race.members.filter(member => member.personId !== personId)
  }

  /** Una gara non si cancella: si chiude, e resta leggibile. */
  function closeRace(raceId: string): void {
    const race = findRace(raceId)
    if (race) race.closed = true
  }

  // ---- Avvisi ------------------------------------------------------------

  const pendingNoticeCount = computed(() => store.value.notices.length)

  function dismissNotice(id: string): void {
    store.value.notices = store.value.notices.filter(notice => notice.id !== id)
  }

  /**
   * Accettare fa davvero la cosa che l'avviso prometteva: una richiesta diventa
   * un permesso, un invito ti fa entrare nella gara. Senza questo la campanella
   * sarebbe un elenco che si svuota e basta.
   */
  function acceptNotice(id: string): void {
    const notice = store.value.notices.find(entry => entry.id === id)
    if (!notice) return
    if (notice.kind === 'request') befriend(notice.personId)
    else if (notice.kind === 'invite' && notice.raceId) enterRace(notice.raceId)
    dismissNotice(id)
  }

  function rejectNotice(id: string): void {
    const notice = store.value.notices.find(entry => entry.id === id)
    if (!notice) return
    if (notice.kind === 'request') unfriend(notice.personId)
    dismissNotice(id)
  }

  /** Riporta il prototipo allo stato di partenza: serve a dimostrarlo due volte. */
  function reset(): void {
    store.value = initialStore(store.value.crowded)
  }

  const crowded = computed(() => store.value.crowded)

  /** Passa fra lo scenario che racconta e quello che stressa il layout. */
  function toggleCrowded(): void {
    store.value = initialStore(!store.value.crowded)
  }

  return {
    people,
    friends,
    pitwall,
    startPitwall,
    closePitwall,
    befriend,
    unfriend,
    races,
    myRoom,
    notices,
    selectedRace,
    pendingNoticeCount,
    notice: ref(null),
    error: ref(null),
    demo: true,
    meId: ref<string | null>(PITWALL_CONCEPT_CURRENT_USER_ID),
    crowded,
    toggleCrowded,
    searchQuery,
    found,
    selectRace,
    enterRace,
    leaveRace,
    inviteToRace,
    promoteInRace,
    removeFromRace,
    closeRace,
    acceptNotice,
    rejectNotice,
    dismissNotice,
    stop: createMockStop(() => selectedRace.value),
    reset,
  }
}
