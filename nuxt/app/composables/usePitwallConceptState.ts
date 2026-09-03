// Lo stato del prototipo Pit Wall, in un posto solo.
//
// Prima le notifiche vivevano dentro la campanella e gli elenchi dentro la
// home: per questo accettare un invito non poteva cambiare niente: le due
// meta' non si vedevano. Qui stanno insieme, cosi' ogni decisione ha un effetto
// visibile dove l'utente sta guardando.
//
// Resta mock puro: nessun Firebase, nessun IPC, nessuna rete. Le funzioni sono
// gli stessi gesti che il dominio reale sa gia' fare (chiedere, autorizzare,
// invitare, entrare, promuovere, togliere, uscire, chiudere), cosi' il porting
// sulla Classica e' una traduzione di layout e non un'invenzione.
import { computed } from 'vue'
import {
  PITWALL_CONCEPT_CURRENT_USER_ID,
  PITWALL_CONCEPT_LINKS_ASSIST,
  PITWALL_CONCEPT_LINKS_ASSISTED,
  PITWALL_CONCEPT_NOTICES,
  PITWALL_CONCEPT_RACES,
  buildPitwallConceptCrowd,
  searchPitwallConceptDirectory,
} from '~/utils/pitwallConcept'
import type {
  PitwallConceptDirection,
  PitwallConceptLink,
  PitwallConceptNotice,
  PitwallConceptRace,
} from '~/utils/pitwallConcept'

/** Le due durate che un permesso puo' avere: mai la parola "scope". */
export type PitwallConceptDuration = 'always' | 'today'

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

export function usePitwallConceptState() {
  const store = useState<PitwallConceptStore>('pitwall-concept-store', initialStore)

  const links = computed(() => store.value.links)
  const races = computed(() => store.value.races)
  const notices = computed(() => store.value.notices)
  const selectedRace = computed<PitwallConceptRace | null>(
    () => store.value.races.find(race => race.id === store.value.selectedRaceId) ?? null,
  )

  /** Chi e' gia' in un elenco non ricompare nella ricerca, in nessuno stato. */
  const linkedIds = computed(() => [
    ...store.value.links.assist.map(link => link.personId),
    ...store.value.links.assisted.map(link => link.personId),
  ])

  function search(query: string) {
    return searchPitwallConceptDirectory(query, linkedIds.value)
  }

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
  }

  /** Ritiro la richiesta: era mia, la tolgo io. */
  function cancelRequest(personId: string): void {
    store.value.links.assist = store.value.links.assist.filter(
      link => !(link.personId === personId && link.access === 'pending'),
    )
  }

  /** Autorizzo qualcuno ad assistermi, senza che me l'abbia chiesto. */
  function allowToAssistMe(personId: string, duration: PitwallConceptDuration, until?: string): void {
    if (has('assisted', personId)) return
    store.value.links.assisted.push(
      duration === 'always' ? { personId, access: 'always' } : { personId, access: 'today', until },
    )
  }

  /** Rispondo a chi mi ha chiesto: due durate, oppure no. */
  function decideRequest(
    personId: string,
    decision: PitwallConceptDuration | 'reject',
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

  function dismissNotice(id: number): void {
    store.value.notices = store.value.notices.filter(notice => notice.id !== id)
  }

  /**
   * Accettare fa davvero la cosa che l'avviso prometteva: una richiesta diventa
   * un permesso, un invito ti fa entrare nella gara. Senza questo la campanella
   * sarebbe un elenco che si svuota e basta.
   */
  function acceptNotice(id: number, duration: PitwallConceptDuration = 'always', until?: string): void {
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

  function rejectNotice(id: number): void {
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
    links,
    races,
    notices,
    selectedRace,
    linkedIds,
    pendingNoticeCount,
    crowded,
    toggleCrowded,
    search,
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
    reset,
  }
}
