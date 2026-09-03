// Modello mock del Pit Wall Concept: solo dati locali, nessun servizio reale.
//
// Vocabolario deliberato (PIP-369): l'utente non legge mai "grant", "scope" o
// "pre-autorizzazione". Vede persone, e per ognuna se l'accesso vale "Sempre"
// oppure "fino alle 23:40". La stanza-gara resta il posto in cui si entra, per
// questo la home offre "Entra" su una gara e mai "collegati a una persona".
//
// Qui vive la logica pura: le parole che l'utente legge e le funzioni che
// derivano uno stato da un altro. Tipi e dati di partenza stanno in
// `pitwallConceptModel`, e chi muta lo stato in `usePitwallConceptState`.
//
// Il modello si ri-esporta da qui, cosi' chi consuma il prototipo ha un import
// solo. La direzione resta una: la logica conosce il modello, mai il contrario.
import {
  PITWALL_CONCEPT_CURRENT_USER_ID,
  PITWALL_CONCEPT_LINKS_ASSIST,
  PITWALL_CONCEPT_LINKS_ASSISTED,
  PITWALL_CONCEPT_PEOPLE,
  PITWALL_CONCEPT_RACES,
} from '~/utils/pitwallConceptModel'

export * from '~/utils/pitwallConceptModel'


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

// ============================================
// Elenchi lunghi, elenchi vuoti, ricerca
// ============================================

/**
 * Quante righe si mostrano prima di offrire "mostra le altre".
 *
 * Non sono numeri di comodo: gli elenchi veri arrivano a 50 permessi per verso,
 * 60 gare, 32 persone in una stanza e 80 risultati di ricerca. Un elenco senza
 * tetto e' due metri di scroll prima di arrivare alla riga sotto.
 */
export const PITWALL_CONCEPT_LIST_LIMITS = Object.freeze({
  races: 3,
  people: 8,
  crew: 8,
  search: 8,
  wallAvatars: 5,
})

/** Sotto questa soglia il filtro rapido dentro una colonna non serve a nulla. */
export const PITWALL_CONCEPT_FILTER_FROM = 10

/** Lunghezza minima per cercare, la stessa del servizio reale. */
export const PITWALL_CONCEPT_SEARCH_MIN_CHARS = 2

export interface PitwallConceptSplit<T> {
  visible: T[]
  hidden: number
}

/**
 * Le prime N righe, piu' quelle che non si possono nascondere.
 *
 * Una riga "fissata" e' una che chiede una decisione. Tagliarla sarebbe lo
 * stesso difetto dello scroll interno che la Classica ha gia' tolto: una
 * richiesta arrivata dopo finirebbe fuori vista senza che nulla lo segnali.
 * Per questo il tetto puo' essere superato, ma solo da righe fissate.
 */
export function splitPitwallConceptList<T>(
  items: readonly T[],
  limit: number,
  isPinned: (item: T) => boolean = () => false,
): PitwallConceptSplit<T> {
  const pinned = items.filter(isPinned)
  const room = Math.max(0, limit - pinned.length)
  let taken = 0
  const visible = items.filter((item) => {
    if (isPinned(item)) return true
    if (taken >= room) return false
    taken += 1
    return true
  })
  return { visible, hidden: items.length - visible.length }
}

/**
 * L'ordine in cui si guarda un elenco di persone: prima chi aspetta una
 * risposta da te, poi la richiesta che hai mandato tu, poi chi e' in gara
 * adesso, poi il resto in ordine alfabetico.
 */
export function sortPitwallConceptLinks(
  links: readonly PitwallConceptLink[],
  racingIds: readonly string[] = [],
  people = PITWALL_CONCEPT_PEOPLE,
): PitwallConceptLink[] {
  const racing = new Set(racingIds)
  const weight = (link: PitwallConceptLink): number => {
    if (link.access === 'incoming') return 0
    if (link.access === 'pending') return 1
    return racing.has(link.personId) ? 2 : 3
  }
  return [...links].sort((left, right) => (
    weight(left) - weight(right)
    || pitwallConceptNicknameById(left.personId, people)
      .localeCompare(pitwallConceptNicknameById(right.personId, people), 'it-IT')
  ))
}

/** Una riga che chiede una decisione non si nasconde mai dietro un limite. */
export function isPitwallConceptPinnedLink(link: PitwallConceptLink): boolean {
  return link.access === 'incoming'
}

export type PitwallConceptSearchState =
  | 'idle'
  | 'too-short'
  | 'none'
  | 'ready'
  | 'capped'

export interface PitwallConceptSearchResult {
  /** Persone che si possono aggiungere, gia' tagliate al tetto. */
  entries: PitwallConceptPerson[]
  /** Persone trovate ma gia' in un elenco: si mostrano, non si nascondono. */
  linked: PitwallConceptPerson[]
  state: PitwallConceptSearchState
  /** Quante aggiungibili sono state tolte dal taglio. */
  hidden: number
  /** Quante gia' collegate sono state tolte dal taglio. */
  linkedHidden: number
}

/**
 * Quante persone gia' collegate si mostrano sotto la ricerca.
 *
 * Sono contesto, non azioni: bastano poche righe per rispondere "ce l'hai
 * gia'". Senza tetto diventavano quaranta righe grigie sotto i risultati veri -
 * cioe' lo stesso difetto che questa schermata esiste per chiudere.
 */
export const PITWALL_CONCEPT_LINKED_PREVIEW = 3

/**
 * Cerca una persona da aggiungere.
 *
 * Chi e' gia' in un elenco viene **mostrato a parte**, non nascosto: prima
 * spariva e basta, quindi cercare `mario` non dava risultati e la conclusione
 * ovvia era "non e' iscritto" invece di "ce l'hai gia'". Nascondere una
 * risposta e' peggio che darla scomoda.
 */
export function searchPitwallConceptDirectory(
  query: string,
  linked: Iterable<string> = [
    ...PITWALL_CONCEPT_LINKS_ASSIST.map(link => link.personId),
    ...PITWALL_CONCEPT_LINKS_ASSISTED.map(link => link.personId),
  ],
  people = PITWALL_CONCEPT_PEOPLE,
  limit = PITWALL_CONCEPT_LIST_LIMITS.search,
): PitwallConceptSearchResult {
  const needle = query.trim()
  const empty = { entries: [], linked: [], hidden: 0, linkedHidden: 0 }
  if (!needle) return { ...empty, state: 'idle' }
  if (needle.replace(/^@/, '').length < PITWALL_CONCEPT_SEARCH_MIN_CHARS) {
    return { ...empty, state: 'too-short' }
  }

  const taken = new Set<string>([PITWALL_CONCEPT_CURRENT_USER_ID, ...linked])
  const matches = filterPitwallConceptPeople(needle, people)
  const addable = matches.filter(person => !taken.has(person.id))
  const already = matches.filter(
    person => person.id !== PITWALL_CONCEPT_CURRENT_USER_ID && taken.has(person.id),
  )
  const shownLinked = already.slice(0, PITWALL_CONCEPT_LINKED_PREVIEW)
  const linkedHidden = already.length - shownLinked.length

  if (!addable.length) {
    return { entries: [], linked: shownLinked, hidden: 0, linkedHidden, state: 'none' }
  }
  return {
    entries: addable.slice(0, limit),
    linked: shownLinked,
    hidden: Math.max(0, addable.length - limit),
    linkedHidden,
    state: addable.length > limit ? 'capped' : 'ready',
  }
}

/**
 * Cosa dire quando un elenco e' vuoto.
 *
 * I due versi non sono la stessa frase: in uno aspetti che qualcuno ti
 * autorizzi, nell'altro sei tu a doverlo fare. Un testo solo per entrambi
 * direbbe la cosa giusta a meta' delle persone.
 */
export function describePitwallConceptEmpty(direction: PitwallConceptDirection): string {
  return direction === 'assist'
    ? 'Nessuno ti ha ancora autorizzato. Cerca il suo nickname e chiedigli di poterlo assistere.'
    : 'Non hai ancora autorizzato nessuno. Cerca il suo nickname e lascia che ti assista.'
}

export interface PitwallConceptWallSummary {
  shown: string[]
  extra: number
}

/** I primi volti, e quanti restano fuori: sedici avatar in fila non si leggono. */
export function pitwallConceptWallSummary(
  personIds: readonly string[],
  max = PITWALL_CONCEPT_LIST_LIMITS.wallAvatars,
): PitwallConceptWallSummary {
  return {
    shown: personIds.slice(0, max),
    extra: Math.max(0, personIds.length - max),
  }
}

/** Gli stessi nomi in una riga sola, senza diventare un paragrafo. */
export function describePitwallConceptWall(
  personIds: readonly string[],
  max = PITWALL_CONCEPT_LIST_LIMITS.wallAvatars,
  people = PITWALL_CONCEPT_PEOPLE,
): string {
  const summary = pitwallConceptWallSummary(personIds, max)
  const names = pitwallConceptNicknames(summary.shown, people).join(', ')
  if (!summary.extra) return names
  return `${names} e altri ${summary.extra}`
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

/**
 * Quante persone entrano in una gara. E' il tetto vero delle regole Firestore
 * (`allowedUids <= 32`): superarlo non da' un errore comprensibile, quindi la
 * pagina lo dice prima invece di lasciar fallire l'invito.
 */
export const PITWALL_CONCEPT_MAX_ROOM_PEOPLE = 32

export function pitwallConceptRoomIsFull(race: PitwallConceptRace | null): boolean {
  return (race?.members.length ?? 0) >= PITWALL_CONCEPT_MAX_ROOM_PEOPLE
}

/**
 * Chi non si nasconde mai dietro il limite dell'equipaggio: chi ha il volante
 * (applica lui la strategia), chi gestisce la gara e chi e' invitato e non e'
 * ancora entrato, che e' una riga in attesa di una decisione.
 */
export function isPitwallConceptPinnedMember(member: PitwallConceptMember): boolean {
  return member.driving || member.role === 'manager' || member.role === 'invited'
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
