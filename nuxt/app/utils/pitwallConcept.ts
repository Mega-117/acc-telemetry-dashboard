// Modello mock del Pit Wall Concept: solo dati locali, nessun servizio reale.
//
// Vocabolario deliberato (PIP-369): l'utente non legge mai "grant", "scope" o
// "pre-autorizzazione". Vede persone, e per ognuna se l'accesso vale "Sempre"
// oppure "fino alle 23:40". La stanza-gara resta il posto in cui si entra, per
// questo la home offre "Entra" su una gara e mai "collegati a una persona".

export type PitwallConceptScreen = 'home' | 'live'
export type PitwallConceptLiveTab = 'timing' | 'track'
export type PitwallConceptDirection = 'assist' | 'assisted'
export type PitwallConceptAccess = 'always' | 'today'

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

/** Una gara viva: si entra qui dentro, non su una persona. */
export interface PitwallConceptRace {
  id: string
  carNumber: number
  carModel: string
  track: string
  session: string
  /** Chi ha il volante adesso: e' lui che applica la strategia. */
  driverId: string
  /** Chi e' gia' al muretto. */
  wallIds: string[]
  /** Perche' sei dentro senza aver fatto niente. */
  reasonPersonId: string
}

export const PITWALL_CONCEPT_CURRENT_USER_ID = 'enrico'

export const PITWALL_CONCEPT_PEOPLE: PitwallConceptPerson[] = [
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

/** Chi mi ha autorizzato: le loro gare mi compaiono da sole. */
export const PITWALL_CONCEPT_LINKS_ASSIST: PitwallConceptLink[] = [
  { personId: 'mario', access: 'always' },
  { personId: 'luca', access: 'always' },
  { personId: 'andrea', access: 'today', until: '22:00' },
]

/** Chi ho autorizzato io: possono entrare nelle mie gare. */
export const PITWALL_CONCEPT_LINKS_ASSISTED: PitwallConceptLink[] = [
  { personId: 'marco', access: 'always' },
  { personId: 'luca', access: 'always' },
  { personId: 'giulia', access: 'today', until: '23:40' },
]

export const PITWALL_CONCEPT_RACES: PitwallConceptRace[] = [
  {
    id: 'race-47',
    carNumber: 47,
    carModel: 'Ferrari 296 GT3',
    track: 'Nürburgring',
    session: 'Gara · 67 giri',
    driverId: 'mario',
    wallIds: ['luca'],
    reasonPersonId: 'mario',
  },
]

export function getPitwallConceptPerson(
  personId: string,
  people = PITWALL_CONCEPT_PEOPLE,
): PitwallConceptPerson | null {
  return people.find(person => person.id === personId) ?? null
}

export function pitwallConceptNickname(person: PitwallConceptPerson): string {
  return person.handle.replace(/^@/, '')
}

/**
 * Le due lettere dell'avatar si ricavano dal nickname (prima e ultima), invece
 * di essere un campo a parte che puo' divergere. Nickname vicini restano
 * distinguibili: marcog -> MG, martinac -> MC, mariorossi -> MI.
 */
export function pitwallConceptInitials(person: PitwallConceptPerson): string {
  const nickname = pitwallConceptNickname(person)
  if (!nickname) return '??'
  const first = nickname[0]!
  const last = nickname.length > 1 ? nickname[nickname.length - 1]! : first
  return `${first}${last}`.toLocaleUpperCase('it-IT')
}

export function pitwallConceptInitialsById(
  personId: string,
  people = PITWALL_CONCEPT_PEOPLE,
): string {
  const found = getPitwallConceptPerson(personId, people)
  return found ? pitwallConceptInitials(found) : '??'
}

/** Nickname a partire dall'id: una sola fonte per le due schermate. */
export function pitwallConceptNicknameById(
  personId: string,
  people = PITWALL_CONCEPT_PEOPLE,
): string {
  const found = getPitwallConceptPerson(personId, people)
  return found ? pitwallConceptNickname(found) : personId
}

/** "Sempre" oppure "Fino alle 23:40": mai il gergo del database. */
export function describePitwallConceptAccess(link: PitwallConceptLink): string {
  return link.access === 'always' ? 'Sempre' : `Fino alle ${link.until ?? '00:00'}`
}

export function getPitwallConceptLinks(direction: PitwallConceptDirection): PitwallConceptLink[] {
  return direction === 'assist' ? PITWALL_CONCEPT_LINKS_ASSIST : PITWALL_CONCEPT_LINKS_ASSISTED
}

export function filterPitwallConceptPeople(
  query: string,
  people = PITWALL_CONCEPT_PEOPLE,
): PitwallConceptPerson[] {
  const needle = query.trim().replace(/^@/, '').toLocaleLowerCase('it-IT')
  if (!needle) return people
  return people.filter(person =>
    pitwallConceptNickname(person).toLocaleLowerCase('it-IT').includes(needle),
  )
}

/** Orari proposti quando si concede un accesso a tempo. */
export const PITWALL_CONCEPT_EXPIRY_PRESETS = ['20:00', '23:40', '00:00']
export const PITWALL_CONCEPT_DEFAULT_EXPIRY = '23:40'

/**
 * Un orario scritto a mano non deve poter produrre "Fino alle 99:99": quello che
 * non e' un orario valido ricade sulla proposta predefinita.
 */
export function normalizePitwallConceptExpiry(value: string): string {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim())
  if (!match) return PITWALL_CONCEPT_DEFAULT_EXPIRY
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return PITWALL_CONCEPT_DEFAULT_EXPIRY
  return `${String(hours).padStart(2, '0')}:${match[2]}`
}

/**
 * La ricerca serve solo ad **aggiungere** persone: chi e' gia' collegato in un
 * verso qualsiasi non ricompare, cosi' la stessa persona non vive in due liste.
 */
export function searchPitwallConceptDirectory(
  query: string,
  people = PITWALL_CONCEPT_PEOPLE,
): PitwallConceptPerson[] {
  if (!query.trim()) return []
  const linked = new Set<string>([
    PITWALL_CONCEPT_CURRENT_USER_ID,
    ...PITWALL_CONCEPT_LINKS_ASSIST.map(link => link.personId),
    ...PITWALL_CONCEPT_LINKS_ASSISTED.map(link => link.personId),
  ])
  return filterPitwallConceptPeople(query, people).filter(person => !linked.has(person.id))
}

export const PITWALL_CONCEPT_DEFAULT_PRESSURES = Object.freeze({ FL: 25, FR: 25, RL: 25, RR: 25 })

export function stepPitwallConceptPressure(value: number, direction: 1 | -1): number {
  return Math.round(Math.min(35, Math.max(20, value + direction * 0.1)) * 10) / 10
}
