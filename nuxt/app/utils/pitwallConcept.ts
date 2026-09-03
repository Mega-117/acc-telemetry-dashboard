// Modello mock del Pit Wall Concept: solo dati locali, nessun servizio reale.
//
// Vocabolario deliberato (PIP-369): l'utente non legge mai "grant", "scope" o
// "pre-autorizzazione". Vede persone, e per ognuna se l'accesso vale "Sempre"
// oppure "fino alle 23:40". La stanza-gara resta il posto in cui si entra, per
// questo la home offre "Entra" su una gara e mai "collegati a una persona".
//
// Qui vive solo la logica pura: le fixture di partenza, le parole che l'utente
// legge e le funzioni che derivano uno stato da un altro. Chi muta lo stato sta
// in `usePitwallConceptState`.

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
}

/** Qualcosa da decidere, o da sapere. */
export interface PitwallConceptNotice {
  id: number
  kind: PitwallConceptNoticeKind
  personId: string
  /** Solo per gli inviti: a quale gara. */
  raceId?: string
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
  { id: 1, kind: 'request', personId: 'paolo' },
  { id: 2, kind: 'invite', personId: 'marco', raceId: 'race-12' },
  { id: 3, kind: 'granted', personId: 'mario' },
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

/**
 * Piu' nickname di fila, gia' uniti.
 *
 * Esiste perche' `ids.map(pitwallConceptNicknameById)` sembra corretto e non lo
 * e': `map` passa anche l'indice, che finisce nel secondo parametro al posto
 * della directory. Meglio togliere la trappola che ricordarsene.
 */
export function pitwallConceptNicknames(
  personIds: readonly string[],
  people = PITWALL_CONCEPT_PEOPLE,
): string[] {
  return personIds.map(personId => pitwallConceptNicknameById(personId, people))
}

/**
 * Le quattro parole di stato, e mai il gergo del database.
 * "In attesa" e "Ti ha chiesto" sono la stessa richiesta vista dai due lati.
 */
export function describePitwallConceptAccess(link: PitwallConceptLink): string {
  if (link.access === 'always') return 'Sempre'
  if (link.access === 'today') return `Fino alle ${link.until ?? '00:00'}`
  return link.access === 'pending' ? 'In attesa' : 'Ti ha chiesto'
}

/** Un permesso attivo si distingue da una richiesta ancora aperta. */
export function isPitwallConceptGranted(link: PitwallConceptLink): boolean {
  return link.access === 'always' || link.access === 'today'
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
 * La ricerca serve solo ad **aggiungere** persone: chi e' gia' in un elenco,
 * anche solo in attesa, non ricompare. Cosi' la stessa persona non vive in due
 * posti e non si puo' chiedere due volte la stessa cosa.
 */
export function searchPitwallConceptDirectory(
  query: string,
  linked: Iterable<string> = [
    ...PITWALL_CONCEPT_LINKS_ASSIST.map(link => link.personId),
    ...PITWALL_CONCEPT_LINKS_ASSISTED.map(link => link.personId),
  ],
  people = PITWALL_CONCEPT_PEOPLE,
): PitwallConceptPerson[] {
  if (!query.trim()) return []
  const taken = new Set<string>([PITWALL_CONCEPT_CURRENT_USER_ID, ...linked])
  return filterPitwallConceptPeople(query, people).filter(person => !taken.has(person.id))
}

// ============================================
// La gara: chi c'e', chi comanda, chi applica
// ============================================

export function getPitwallConceptMember(
  race: PitwallConceptRace | null,
  personId: string,
): PitwallConceptMember | null {
  return race?.members.find(member => member.personId === personId) ?? null
}

/** Sono entrato davvero, non solo invitato. */
export function pitwallConceptAmMember(
  race: PitwallConceptRace | null,
  userId = PITWALL_CONCEPT_CURRENT_USER_ID,
): boolean {
  const member = getPitwallConceptMember(race, userId)
  return member !== null && member.role !== 'invited'
}

/** Invitato e non ancora entrato: e' lo stato che merita il bottone "Entra". */
export function pitwallConceptAmInvited(
  race: PitwallConceptRace | null,
  userId = PITWALL_CONCEPT_CURRENT_USER_ID,
): boolean {
  return getPitwallConceptMember(race, userId)?.role === 'invited'
}

export function pitwallConceptIsManager(
  race: PitwallConceptRace | null,
  userId = PITWALL_CONCEPT_CURRENT_USER_ID,
): boolean {
  return getPitwallConceptMember(race, userId)?.role === 'manager'
}

/**
 * Chi ha aperto la gara non puo' uscirne: senza di lui resterebbe una gara che
 * nessuno puo' piu' gestire. E' la stessa regola che le Rules impongono al
 * server tenendo `hostUid` fra i manager.
 */
export function pitwallConceptCanLeave(
  race: PitwallConceptRace | null,
  userId = PITWALL_CONCEPT_CURRENT_USER_ID,
): boolean {
  return pitwallConceptAmMember(race, userId) && race?.hostId !== userId
}

/** Si promuove solo chi e' gia' entrato e non gestisce gia' la gara. */
export function pitwallConceptCanPromote(
  race: PitwallConceptRace | null,
  member: PitwallConceptMember,
  userId = PITWALL_CONCEPT_CURRENT_USER_ID,
): boolean {
  return pitwallConceptIsManager(race, userId)
    && member.personId !== userId
    && member.role === 'member'
}

/** Si toglie chiunque tranne se stessi e chi ha aperto la gara. */
export function pitwallConceptCanRemove(
  race: PitwallConceptRace | null,
  member: PitwallConceptMember,
  userId = PITWALL_CONCEPT_CURRENT_USER_ID,
): boolean {
  return pitwallConceptIsManager(race, userId)
    && member.personId !== userId
    && member.personId !== race?.hostId
}

/**
 * Chi applica la strategia non e' un ruolo: e' chi ha il volante adesso.
 * Con zero o due al volante non si indovina, e l'ordine non parte.
 */
export function resolvePitwallConceptExecutor(
  race: PitwallConceptRace | null,
): { state: PitwallConceptExecutorState, driverId: string | null } {
  const driving = (race?.members ?? []).filter(member => member.driving)
  if (driving.length === 1) return { state: 'ready', driverId: driving[0]!.personId }
  if (driving.length > 1) return { state: 'multiple-driving', driverId: null }
  return { state: 'nobody-driving', driverId: null }
}

/**
 * Chi e' al muretto: entrato e non al volante. Me compreso, perche' la domanda
 * e' "chi c'e'" e vedersi nell'elenco e' la conferma di esserci.
 */
export function pitwallConceptWallIds(race: PitwallConceptRace | null): string[] {
  return (race?.members ?? [])
    .filter(member => member.role !== 'invited' && !member.driving)
    .map(member => member.personId)
}

/** Le stesse parole della vista classica, cosi' il porting non le reinventa. */
export function describePitwallConceptMember(member: PitwallConceptMember): string {
  if (member.driving) return 'AL VOLANTE'
  if (member.role === 'invited') return 'invitato · non ancora entrato'
  if (member.role === 'manager') return member.online ? 'gestisce la gara' : 'gestisce la gara · offline'
  return member.online ? 'presente' : 'offline'
}

/** Perche' questa gara ti compare, detto senza nominare i permessi. */
export function describePitwallConceptReason(reason: PitwallConceptReason): string {
  return reason.kind === 'grant'
    ? `Sei dentro perché ${pitwallConceptNicknameById(reason.personId)} ti ha autorizzato.`
    : `${pitwallConceptNicknameById(reason.personId)} ti ha invitato a questa gara.`
}

/**
 * Il motivo per cui l'invio e' fermo, nell'ordine in cui conta.
 * `null` significa che si puo' inviare: la UI non deve dedurlo altrove.
 */
export function pitwallConceptSendBlock(
  race: PitwallConceptRace | null,
  hasChanges: boolean,
  userId = PITWALL_CONCEPT_CURRENT_USER_ID,
): string | null {
  if (!race) return 'Nessuna gara selezionata.'
  if (race.closed) return 'Questa gara è chiusa: non accetta più strategie.'
  if (!pitwallConceptAmMember(race, userId)) return 'Non sei ancora entrato in questa gara.'
  const executor = resolvePitwallConceptExecutor(race)
  if (executor.state === 'nobody-driving') return 'Nessuno è al volante: nessun ordine parte.'
  if (executor.state === 'multiple-driving') {
    return 'Due piloti risultano al volante: nessun ordine parte finché non è chiaro chi guida.'
  }
  if (!hasChanges) return 'Nessuna modifica da inviare.'
  return null
}

/** Il titolo e la riga di un avviso: una fonte sola per campanella e liste. */
export function describePitwallConceptNotice(
  notice: PitwallConceptNotice,
  races: PitwallConceptRace[] = PITWALL_CONCEPT_RACES,
): { title: string, body: string } {
  const who = pitwallConceptNicknameById(notice.personId)
  if (notice.kind === 'request') {
    return { title: `${who} vuole assisterti`, body: 'Decidi per quanto vale l’accesso.' }
  }
  if (notice.kind === 'invite') {
    const race = races.find(entry => entry.id === notice.raceId)
    return {
      title: `${who} ti invita a una gara`,
      body: race ? `#${race.carNumber} · ${race.track} · ${race.session}` : 'Gara non più disponibile.',
    }
  }
  return { title: `${who} ti ha autorizzato`, body: 'Le sue gare ti compaiono da sole.' }
}

export const PITWALL_CONCEPT_DEFAULT_PRESSURES = Object.freeze({ FL: 25, FR: 25, RL: 25, RR: 25 })

export function stepPitwallConceptPressure(value: number, direction: 1 | -1): number {
  return Math.round(Math.min(35, Math.max(20, value + direction * 0.1)) * 10) / 10
}
