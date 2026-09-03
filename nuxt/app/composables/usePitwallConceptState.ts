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
import type { PitwallDuration, PitwallStopHandle, PitwallStore } from '~/composables/usePitwallStore'
import {
  PITWALL_CONCEPT_CURRENT_USER_ID,
  PITWALL_CONCEPT_LINKS_ASSIST,
  PITWALL_CONCEPT_LINKS_ASSISTED,
  PITWALL_CONCEPT_NOTICES,
  PITWALL_CONCEPT_PEOPLE,
  PITWALL_CONCEPT_RACES,
  buildPitwallConceptCrowd,
  pitwallConceptSendBlock,
  searchPitwallConceptDirectory,
} from '~/utils/pitwallConcept'
import type {
  PitwallConceptDirection,
  PitwallConceptLink,
  PitwallConceptNotice,
  PitwallConceptRace,
} from '~/utils/pitwallConcept'
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

export type PitwallConceptDuration = PitwallDuration

interface PitwallConceptStore {
  links: Record<PitwallConceptDirection, PitwallConceptLink[]>
  races: PitwallConceptRace[]
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
        links: { assist: PITWALL_CONCEPT_LINKS_ASSIST, assisted: PITWALL_CONCEPT_LINKS_ASSISTED },
        races: PITWALL_CONCEPT_RACES,
        notices: PITWALL_CONCEPT_NOTICES,
      }
  return {
    links: {
      assist: clone(scenario.links.assist),
      assisted: clone(scenario.links.assisted),
    },
    races: clone(scenario.races),
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
  const repairBodywork = ref<boolean | null>(null)
  const repairSuspension = ref<boolean | null>(null)
  const driverId = ref<string | null>(null)
  const pitStrategy = ref<number | null>(null)
  const orderStatus = ref<PitwallOrderStatus | null>(null)
  const orderReason = ref<string | null>(null)
  const fieldOutcomes = ref<PitwallFieldOutcomeRow[]>([])
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
    fieldOutcomes.value = fields.map(field => ({
      field,
      label: LABELS[field] ?? field,
      outcome: READ_BACK.has(field) ? 'verified' : 'selected',
      reason: null,
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

  const links = computed(() => store.value.links)
  const races = computed(() => store.value.races)
  const notices = computed(() => store.value.notices)
  const selectedRace = computed<PitwallConceptRace | null>(
    () => store.value.races.find(race => race.id === store.value.selectedRaceId) ?? null,
  )
  const people = computed(() => PITWALL_CONCEPT_PEOPLE)

  /**
   * "Ce l'hai gia'" solo con entrambi i versi: chi ho in un verso solo resta
   * proponibile per l'altro. E' la stessa regola dello store vero.
   */
  const linkedIds = computed(() => {
    const assisted = new Set(store.value.links.assisted.map(link => link.personId))
    return store.value.links.assist.map(link => link.personId).filter(id => assisted.has(id))
  })

  const searchQuery = ref('')
  const found = computed(() => searchPitwallConceptDirectory(searchQuery.value, linkedIds.value))

  function findRace(raceId: string): PitwallConceptRace | undefined {
    return store.value.races.find(race => race.id === raceId)
  }

  function has(direction: PitwallConceptDirection, personId: string): boolean {
    return store.value.links[direction].some(link => link.personId === personId)
  }

  // ---- Persone -----------------------------------------------------------

  /** Chiedo a qualcuno di poterlo assistere: propongo, non decido. */
  function askToAssist(personId: string): void {
    if (has('assist', personId)) return
    store.value.links.assist.push({ personId, access: 'pending' })
    searchQuery.value = ''
  }

  /** Ritiro la richiesta: era mia, la tolgo io. */
  function cancelRequest(personId: string): void {
    store.value.links.assist = store.value.links.assist.filter(
      link => !(link.personId === personId && link.access === 'pending'),
    )
  }

  /** Autorizzo qualcuno ad assistermi, senza che me l'abbia chiesto. */
  function allowToAssistMe(personId: string, duration: PitwallDuration, until?: string): void {
    if (has('assisted', personId)) return
    store.value.links.assisted.push(
      duration === 'always' ? { personId, access: 'always' } : { personId, access: 'today', until },
    )
    searchQuery.value = ''
  }

  /** Rispondo a chi mi ha chiesto: due durate, oppure no. */
  function decideRequest(
    personId: string,
    decision: PitwallDuration | 'reject',
    until?: string,
  ): void {
    const link = store.value.links.assisted.find(
      entry => entry.personId === personId && entry.access === 'incoming',
    )
    if (!link) return
    if (decision === 'reject') {
      store.value.links.assisted = store.value.links.assisted.filter(entry => entry !== link)
      return
    }
    link.access = decision === 'always' ? 'always' : 'today'
    link.until = decision === 'today' ? until : undefined
  }

  function removeLink(direction: PitwallConceptDirection, personId: string): void {
    store.value.links[direction] = store.value.links[direction].filter(
      link => link.personId !== personId,
    )
  }

  function setExpiry(direction: PitwallConceptDirection, personId: string, until: string): void {
    const link = store.value.links[direction].find(entry => entry.personId === personId)
    if (link?.access === 'today') link.until = until
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
  function acceptNotice(id: string, duration: PitwallDuration = 'always', until?: string): void {
    const notice = store.value.notices.find(entry => entry.id === id)
    if (!notice) return
    if (notice.kind === 'request') {
      if (has('assisted', notice.personId)) decideRequest(notice.personId, duration, until)
      else allowToAssistMe(notice.personId, duration, until)
    } else if (notice.kind === 'invite' && notice.raceId) {
      enterRace(notice.raceId)
    }
    dismissNotice(id)
  }

  function rejectNotice(id: string): void {
    const notice = store.value.notices.find(entry => entry.id === id)
    if (!notice) return
    if (notice.kind === 'request') decideRequest(notice.personId, 'reject')
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
    links,
    races,
    notices,
    selectedRace,
    pendingNoticeCount,
    notice: ref(null),
    error: ref(null),
    demo: true,
    meId: ref<string | null>(PITWALL_CONCEPT_CURRENT_USER_ID),
    crowded,
    toggleCrowded,
    canEditExpiry: () => true,
    searchQuery,
    found,
    askToAssist,
    cancelRequest,
    allowToAssistMe,
    decideRequest,
    removeLink,
    setExpiry,
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
