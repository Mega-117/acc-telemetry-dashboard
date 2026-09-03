// ============================================
// La presa del Pit Wall: cio' che i componenti chiedono, senza sapere da chi.
//
// Dietro questa interfaccia ci sono due prese di corrente: lo stato mock del
// prototipo (`usePitwallConceptState`), che serve ai test e alla demo, e lo
// stato vero (`usePitwallLiveStore`), che parla con Firestore e con il PC del
// pilota. I componenti vedono solo questa forma, quindi il porting non e' una
// riscrittura: e' cambiare cosa si infila nella presa (Principio 1).
// ============================================

import { inject, provide, type InjectionKey, type Ref } from 'vue'
import type {
  PitwallConceptDirection,
  PitwallConceptLink,
  PitwallConceptNotice,
  PitwallConceptPerson,
  PitwallConceptRace,
  PitwallConceptSearchResult,
} from '~/utils/pitwallConcept'
import type { PitwallCarState, PitwallCompound, PitwallDriver, PitwallPlan, PitwallStopEstimate, PitwallWheel } from '~/utils/pitwallPresentation'
import type { PitwallOrderStatus } from '~/services/pitwall/pitwallLink'
import type { PitwallFieldOutcomeRow } from '~/composables/usePitwallController'

export type PitwallDuration = 'always' | 'today'

/**
 * La decisione da mandare alla macchina, e com'e' andata.
 *
 * E' la stessa forma per il mock e per il vero, perche' la correttezza di un
 * ordine - cosa fa da base, cosa parte, perche' e' bloccato - non puo' avere
 * due versioni.
 */
export interface PitwallStopHandle {
  pressures: Ref<Record<PitwallWheel, number>>
  fuelLiters: Ref<number>
  compound: Ref<PitwallCompound>
  tyreSet: Ref<number>
  changeTyres: Ref<boolean | null>
  brakes: Ref<boolean | null>
  repairBodywork: Ref<boolean | null>
  repairSuspension: Ref<boolean | null>
  driverId: Ref<string | null>
  pitStrategy: Ref<number | null>
  drivers: Ref<PitwallDriver[]>
  /** Com'e' messa la macchina: la base di confronto. */
  car: Ref<PitwallCarState>
  /** C'e' una fotografia della vettura, e quanto e' vecchia. */
  hasCarSnapshot: Ref<boolean>
  carFresh: Ref<boolean>
  presenceAgeSeconds: Ref<number | null>
  stopEstimate: Ref<PitwallStopEstimate>
  blockedReason: Ref<string | null>
  orderStatus: Ref<PitwallOrderStatus | null>
  orderReason: Ref<string | null>
  fieldOutcomes: Ref<PitwallFieldOutcomeRow[]>
  /**
   * L'ultimo ordine partito. ACC non rilegge le caselle (cambio gomme, freni,
   * riparazioni): "in macchina" per loro e' cio' che abbiamo chiesto l'ultima
   * volta, e va detto come tale.
   */
  lastOrder: Ref<PitwallPlan | null>
  adjustPressure: (wheel: PitwallWheel, direction: 1 | -1) => void
  setPressure: (wheel: PitwallWheel, value: number) => void
  stepPitStrategy: (direction: 1 | -1) => void
  setCompound: (value: unknown) => void
  resetToCar: () => void
  sendToCar: () => Promise<boolean>
}

export interface PitwallStore {
  /** Chi conosciamo per nome: e' la directory da passare agli helper dei nickname. */
  people: Ref<PitwallConceptPerson[]>
  links: Ref<Record<PitwallConceptDirection, PitwallConceptLink[]>>
  races: Ref<PitwallConceptRace[]>
  notices: Ref<PitwallConceptNotice[]>
  selectedRace: Ref<PitwallConceptRace | null>
  pendingNoticeCount: Ref<number>
  /** Messaggi dei servizi, gia' in italiano. */
  notice: Ref<string | null>
  error: Ref<string | null>
  /** Dati finti: la demo del prototipo. Il vero e' `false`. */
  demo: boolean
  /** Chi guarda: gli helper di gara ragionano dal suo punto di vista. */
  meId: Ref<string | null>
  /** Lo scenario affollato: solo il mock sa farlo; il vero lo ignora. */
  crowded: Ref<boolean>
  toggleCrowded: () => void
  /** La scadenza si cambia solo sui permessi che si posseggono. */
  canEditExpiry: (direction: PitwallConceptDirection) => boolean
  /** La ricerca: chi la monta scrive la query, il risultato arriva quando c'e'. */
  searchQuery: Ref<string>
  found: Ref<PitwallConceptSearchResult>
  askToAssist: (personId: string) => void
  cancelRequest: (personId: string) => void
  allowToAssistMe: (personId: string, duration: PitwallDuration, until?: string) => void
  decideRequest: (personId: string, decision: PitwallDuration | 'reject', until?: string) => void
  removeLink: (direction: PitwallConceptDirection, personId: string) => void
  setExpiry: (direction: PitwallConceptDirection, personId: string, until: string) => void
  selectRace: (raceId: string) => void
  enterRace: (raceId: string) => void
  leaveRace: (raceId: string) => void
  inviteToRace: (raceId: string, personId: string) => void
  promoteInRace: (raceId: string, personId: string) => void
  removeFromRace: (raceId: string, personId: string) => void
  closeRace: (raceId: string) => void
  acceptNotice: (id: string, duration?: PitwallDuration, until?: string) => void
  rejectNotice: (id: string) => void
  dismissNotice: (id: string) => void
  /** Il pit stop della gara selezionata. */
  stop: PitwallStopHandle
}

const PITWALL_STORE: InjectionKey<PitwallStore> = Symbol('pitwall-store')

export function providePitwallStore(store: PitwallStore): void {
  provide(PITWALL_STORE, store)
}

/**
 * Lo store che la pagina ha fornito. Senza, il componente non sa cosa mostrare
 * e lo dice: un default silenzioso nasconderebbe un cablaggio mancante.
 */
export function usePitwallStore(): PitwallStore {
  const store = inject(PITWALL_STORE, null)
  if (!store) throw new Error('Pit Wall: nessuno store fornito da un antenato.')
  return store
}
