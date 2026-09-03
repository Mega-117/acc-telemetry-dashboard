// Il modello del Pit Wall Concept: i tipi e i dati di partenza.
//
// Tipi e fixture stanno insieme perche' descrivono la stessa cosa - com'e'
// fatto il prototipo - mentre le funzioni che ne derivano gli stati stanno in
// `pitwallConcept`. La direzione degli import e' una sola: la logica conosce il
// modello, il modello non conosce la logica. Un anello fra i due lo aveva gia'
// colto il test di architettura, ed e' il motivo di questa forma.

export type PitwallConceptScreen = 'home' | 'live'
export type PitwallConceptDirection = 'assist' | 'assisted'

/**
 * Stato del collegamento con una persona, dal punto di vista di chi guarda.
 *
 * `always` e `today` sono permessi attivi. Gli altri due sono la stessa
 * richiesta vista dai due lati: chi l'ha mandata la vede `pending`, chi l'ha
 * ricevuta la vede `incoming`. Tenerli qui invece che in una terza lista e' il
 * motivo per cui la decisione si trova dove si sta gia' guardando.
 */
export type PitwallConceptAccess = 'always' | 'today' | 'pending' | 'incoming'

/** Cosa puo' fare una persona dentro una gara. */
export type PitwallConceptRole = 'manager' | 'member' | 'invited'

/** Chi applica la strategia: uno solo al volante, oppure non si indovina. */
export type PitwallConceptExecutorState = 'ready' | 'nobody-driving' | 'multiple-driving'

/** Le tre cose che possono arrivare: due chiedono una decisione, una informa. */
export type PitwallConceptNoticeKind = 'request' | 'invite' | 'granted'

/**
 * Una persona e' il suo nickname, e basta: nome e cognome non compaiono mai
 * nell'interfaccia, quindi non stanno nemmeno nel modello.
 */
export interface PitwallConceptPerson {
  id: string
  handle: string
}

/** Un permesso fra due account, nel verso dichiarato da `direction`. */
export interface PitwallConceptLink {
  personId: string
  access: PitwallConceptAccess
  /** Ora di scadenza, presente solo quando l'accesso vale per oggi. */
  until?: string
}

/** Una persona dentro una gara, con quello che ACC dice di lei. */
export interface PitwallConceptMember {
  personId: string
  role: PitwallConceptRole
  /** Ha il volante adesso: lo dice ACC, non un bottone. */
  driving: boolean
  online: boolean
}

/** Perche' questa gara ti compare senza che tu abbia fatto niente. */
export interface PitwallConceptReason {
  kind: 'grant' | 'invite'
  personId: string
}

/** Una gara viva: si entra qui dentro, non su una persona. */
export interface PitwallConceptRace {
  id: string
  carNumber: number
  carModel: string
  track: string
  session: string
  /** Chi ha aperto la gara: non si degrada e non si espelle. */
  hostId: string
  members: PitwallConceptMember[]
  reason: PitwallConceptReason
  /** Chiusa: resta leggibile, non accetta piu' strategie. */
  closed: boolean
  /**
   * Abbiamo la presenza in diretta di chi c'e' dentro. Senza, "nessuno al
   * volante" sarebbe una deduzione da un elenco di soli identificativi: non si
   * dice, si dice "entra per vedere".
   */
  live?: boolean
}

/** Qualcosa da decidere, o da sapere. */
export interface PitwallConceptNotice {
  id: string
  kind: PitwallConceptNoticeKind
  personId: string
  /** Solo per gli inviti: a quale gara. */
  raceId?: string
}



export const PITWALL_CONCEPT_CURRENT_USER_ID = 'enrico'

/** Le persone che raccontano il prototipo: hanno nomi, ruoli e una storia. */
export const PITWALL_CONCEPT_CORE_PEOPLE: PitwallConceptPerson[] = [
  { id: 'enrico', handle: '@enricos' },
  { id: 'mario', handle: '@mariorossi' },
  { id: 'luca', handle: '@lucab' },
  { id: 'andrea', handle: '@andreav' },
  { id: 'marco', handle: '@marcom' },
  { id: 'giulia', handle: '@giuliaf' },
  { id: 'gallo', handle: '@marcog' },
  { id: 'martina', handle: '@martinac' },
  { id: 'paolo', handle: '@paolov' },
  { id: 'alessandro', handle: '@alessandron' },
]

/**
 * Riempitivo con un prefisso tutto suo.
 *
 * Serve a due cose che non si possono raccontare a parole: una directory in cui
 * una ricerca larga trova davvero decine di voci - cercare `pil` supera il tetto
 * dei risultati e mostra il taglio - e abbastanza persone per riempire gli
 * elenchi fino ai tetti veri del servizio. Il prefisso `pilota` non collide con
 * nessuno dei nomi sopra, quindi le ricerche di esempio restano prevedibili.
 */
export const PITWALL_CONCEPT_FILLER_PEOPLE: PitwallConceptPerson[] = Array.from(
  { length: 48 },
  (_unused, index) => {
    const number = String(index + 1).padStart(2, '0')
    return { id: `pilota${number}`, handle: `@pilota${number}` }
  },
)

export const PITWALL_CONCEPT_PEOPLE: PitwallConceptPerson[] = [
  ...PITWALL_CONCEPT_CORE_PEOPLE,
  ...PITWALL_CONCEPT_FILLER_PEOPLE,
]

/** Chi mi ha autorizzato, piu' chi ho chiesto e sto aspettando. */
export const PITWALL_CONCEPT_LINKS_ASSIST: PitwallConceptLink[] = [
  { personId: 'mario', access: 'always' },
  { personId: 'luca', access: 'always' },
  { personId: 'andrea', access: 'today', until: '22:00' },
  { personId: 'alessandro', access: 'pending' },
]

/** Chi ho autorizzato io, piu' chi mi ha chiesto e aspetta una risposta. */
export const PITWALL_CONCEPT_LINKS_ASSISTED: PitwallConceptLink[] = [
  { personId: 'marco', access: 'always' },
  { personId: 'luca', access: 'always' },
  { personId: 'giulia', access: 'today', until: '23:40' },
  { personId: 'paolo', access: 'incoming' },
]

export const PITWALL_CONCEPT_RACES: PitwallConceptRace[] = [
  {
    id: 'race-47',
    carNumber: 47,
    carModel: 'Ferrari 296 GT3',
    track: 'Nürburgring',
    session: 'Gara · 67 giri',
    hostId: 'mario',
    members: [
      { personId: 'mario', role: 'manager', driving: true, online: true },
      { personId: 'enrico', role: 'manager', driving: false, online: true },
      { personId: 'luca', role: 'member', driving: false, online: true },
      { personId: 'andrea', role: 'invited', driving: false, online: false },
    ],
    reason: { kind: 'grant', personId: 'mario' },
    closed: false,
  },
  {
    // La seconda gara mostra i due stati che la prima non ha: sei invitato e
    // non sei ancora entrato, e nessuno ha il volante.
    id: 'race-12',
    carNumber: 12,
    carModel: 'Porsche 992 GT3 R',
    track: 'Spa-Francorchamps',
    session: 'Qualifica · 20 min',
    hostId: 'marco',
    members: [
      { personId: 'marco', role: 'manager', driving: false, online: false },
      { personId: 'enrico', role: 'invited', driving: false, online: true },
    ],
    reason: { kind: 'invite', personId: 'marco' },
    closed: false,
  },
]

/**
 * Gli avvisi sono l'altra faccia degli elenchi, non una terza lista: la
 * richiesta di `paolo` sta anche in `LINKS_ASSISTED` come `incoming`, e
 * rispondere da una parte deve chiudere anche l'altra.
 */
export const PITWALL_CONCEPT_NOTICES: PitwallConceptNotice[] = [
  { id: 'req:paolo', kind: 'request', personId: 'paolo' },
  { id: 'inv:race-12', kind: 'invite', personId: 'marco', raceId: 'race-12' },
  { id: 'grant:mario', kind: 'granted', personId: 'mario' },
]

export interface PitwallConceptScenario {
  links: Record<PitwallConceptDirection, PitwallConceptLink[]>
  races: PitwallConceptRace[]
  notices: PitwallConceptNotice[]
}

/**
 * Lo scenario affollato: gli elenchi ai tetti veri del servizio.
 *
 * Non e' una demo di comodo. Il Concept e' nato su quattro persone e una gara,
 * dove nessun limite si vede; qui ci sono venti permessi per verso, otto gare e
 * una stanza da ventotto persone, che e' l'ordine di grandezza in cui il layout
 * o regge o no. Senza un modo di **vederlo**, gli edge case restano un'opinione.
 */
export function buildPitwallConceptCrowd(
  filler = PITWALL_CONCEPT_FILLER_PEOPLE,
): PitwallConceptScenario {
  const id = (index: number) => filler[index % filler.length]!.id
  const assist: PitwallConceptLink[] = [
    ...PITWALL_CONCEPT_LINKS_ASSIST,
    ...Array.from({ length: 18 }, (_unused, index) => ({
      personId: id(index),
      access: (index % 7 === 0 ? 'today' : 'always') as PitwallConceptAccess,
      ...(index % 7 === 0 ? { until: '22:30' } : {}),
    })),
  ]
  const assisted: PitwallConceptLink[] = [
    ...PITWALL_CONCEPT_LINKS_ASSISTED,
    // Due richieste in fondo all'elenco: sono la prova che il limite non le
    // nasconde mai, per quanto in basso arrivino.
    { personId: id(20), access: 'incoming' },
    { personId: id(21), access: 'incoming' },
    ...Array.from({ length: 22 }, (_unused, index) => ({
      personId: id(index + 22),
      access: 'always' as PitwallConceptAccess,
    })),
  ]

  const crowdedRace: PitwallConceptRace = {
    id: 'race-99',
    carNumber: 99,
    carModel: 'BMW M4 GT3',
    track: 'Le Mans',
    session: 'Gara · 24 ore',
    hostId: id(0),
    members: [
      { personId: id(0), role: 'manager', driving: true, online: true },
      { personId: PITWALL_CONCEPT_CURRENT_USER_ID, role: 'manager', driving: false, online: true },
      ...Array.from({ length: 24 }, (_unused, index) => ({
        personId: id(index + 1),
        role: (index > 21 ? 'invited' : 'member') as PitwallConceptRole,
        driving: false,
        online: index % 3 !== 0,
      })),
    ],
    reason: { kind: 'grant', personId: id(0) },
    closed: false,
  }

  const extraRaces: PitwallConceptRace[] = Array.from({ length: 5 }, (_unused, index) => ({
    id: `race-x${index}`,
    carNumber: 100 + index,
    carModel: 'Audi R8 LMS evo II',
    track: 'Monza',
    session: 'Prove libere · 30 min',
    hostId: id(index + 30),
    members: [
      { personId: id(index + 30), role: 'manager' as PitwallConceptRole, driving: index < 3, online: true },
      { personId: PITWALL_CONCEPT_CURRENT_USER_ID, role: 'member' as PitwallConceptRole, driving: false, online: true },
    ],
    reason: { kind: 'grant' as const, personId: id(index + 30) },
    // Una chiusa in mezzo: nell'elenco vero non c'e' nessun filtro che le tolga.
    closed: index === 4,
  }))

  return {
    links: { assist, assisted },
    races: [...PITWALL_CONCEPT_RACES, crowdedRace, ...extraRaces],
    notices: [
      ...PITWALL_CONCEPT_NOTICES,
      ...Array.from({ length: 9 }, (_unused, index) => ({
        id: `grant:${id(index + 40)}`,
        kind: 'granted' as PitwallConceptNoticeKind,
        personId: id(index + 40),
      })),
    ],
  }
}
