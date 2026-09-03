import { describe, expect, it } from 'vitest'
import {
  PITWALL_CONCEPT_CORE_PEOPLE,
  PITWALL_CONCEPT_CURRENT_USER_ID,
  PITWALL_CONCEPT_DEFAULT_EXPIRY,
  PITWALL_CONCEPT_DEFAULT_PRESSURES,
  PITWALL_CONCEPT_EXPIRY_PRESETS,
  PITWALL_CONCEPT_FILLER_PEOPLE,
  PITWALL_CONCEPT_LINKS_ASSIST,
  PITWALL_CONCEPT_LINKS_ASSISTED,
  PITWALL_CONCEPT_LINKED_PREVIEW,
  PITWALL_CONCEPT_LIST_LIMITS,
  PITWALL_CONCEPT_MAX_ROOM_PEOPLE,
  PITWALL_CONCEPT_PEOPLE,
  PITWALL_CONCEPT_RACES,
  buildPitwallConceptCrowd,
  describePitwallConceptEmpty,
  describePitwallConceptWall,
  isPitwallConceptPinnedLink,
  pitwallConceptRoomIsFull,
  pitwallConceptWallSummary,
  sortPitwallConceptLinks,
  splitPitwallConceptList,
  describePitwallConceptAccess,
  describePitwallConceptMember,
  describePitwallConceptNotice,
  describePitwallConceptReason,
  filterPitwallConceptPeople,
  getPitwallConceptLinks,
  getPitwallConceptPerson,
  isPitwallConceptGranted,
  normalizePitwallConceptExpiry,
  pitwallConceptAmInvited,
  pitwallConceptAmMember,
  pitwallConceptCanLeave,
  pitwallConceptCanPromote,
  pitwallConceptCanRemove,
  pitwallConceptInitials,
  pitwallConceptInitialsById,
  pitwallConceptIsManager,
  pitwallConceptNickname,
  pitwallConceptNicknameById,
  pitwallConceptNicknames,
  pitwallConceptSendBlock,
  pitwallConceptWallIds,
  resolvePitwallConceptExecutor,
  searchPitwallConceptDirectory,
  stepPitwallConceptPressure,
} from '~/utils/pitwallConcept'
import type { PitwallConceptLink } from '~/utils/pitwallConcept'

describe('Pitwall Concept mock model', () => {
  it('conosce le persone solo per nickname, mai per nome e cognome', () => {
    expect(getPitwallConceptPerson('mario')).toEqual({ id: 'mario', handle: '@mariorossi' })
    expect(getPitwallConceptPerson('chi-non-esiste')).toBeNull()
    expect(pitwallConceptNickname(PITWALL_CONCEPT_PEOPLE[1]!)).toBe('mariorossi')
    expect(pitwallConceptNicknameById('mario')).toBe('mariorossi')
    // Un id sconosciuto non deve stampare "undefined" a schermo.
    expect(pitwallConceptNicknameById('chi-non-esiste')).toBe('chi-non-esiste')
    expect(PITWALL_CONCEPT_PEOPLE.every(person => !('name' in person))).toBe(true)
  })

  it('ricava le iniziali dal nickname e le tiene distinguibili', () => {
    expect(pitwallConceptInitialsById('mario')).toBe('MI')
    expect(pitwallConceptInitialsById('gallo')).toBe('MG')
    expect(pitwallConceptInitialsById('martina')).toBe('MC')
    expect(pitwallConceptInitialsById('chi-non-esiste')).toBe('??')
    // Un nickname di una lettera sola non deve produrre una sigla vuota.
    expect(pitwallConceptInitials({ id: 'x', handle: '@x' })).toBe('XX')
    expect(pitwallConceptInitials({ id: 'vuoto', handle: '@' })).toBe('??')
    // Nessuna sigla ripetuta fra le persone che raccontano il prototipo. Il
    // riempitivo (`pilota01`…) serve a stressare gli elenchi, non a essere
    // riconosciuto a colpo d'occhio: li' le sigle possono ripetersi.
    const initials = PITWALL_CONCEPT_CORE_PEOPLE.map(pitwallConceptInitials)
    expect(new Set(initials).size).toBe(initials.length)
  })

  it('parla di durata e mai del gergo interno del permesso', () => {
    expect(describePitwallConceptAccess({ personId: 'mario', access: 'always' })).toBe('Sempre')
    expect(describePitwallConceptAccess({ personId: 'andrea', access: 'today', until: '23:40' }))
      .toBe('Fino alle 23:40')
    // Una scadenza mancante non deve produrre "Fino alle undefined".
    expect(describePitwallConceptAccess({ personId: 'andrea', access: 'today' })).toBe('Fino alle 00:00')
  })

  it('accetta solo orari di scadenza validi', () => {
    expect(normalizePitwallConceptExpiry('9:05')).toBe('09:05')
    expect(normalizePitwallConceptExpiry(' 23:40 ')).toBe('23:40')
    expect(normalizePitwallConceptExpiry('00:00')).toBe('00:00')
    expect(normalizePitwallConceptExpiry('25:00')).toBe(PITWALL_CONCEPT_DEFAULT_EXPIRY)
    expect(normalizePitwallConceptExpiry('12:75')).toBe(PITWALL_CONCEPT_DEFAULT_EXPIRY)
    expect(normalizePitwallConceptExpiry('mezzanotte')).toBe(PITWALL_CONCEPT_DEFAULT_EXPIRY)
    expect(normalizePitwallConceptExpiry('')).toBe(PITWALL_CONCEPT_DEFAULT_EXPIRY)
    // Le proposte rapide devono essere orari che il normalizzatore accetta.
    for (const preset of PITWALL_CONCEPT_EXPIRY_PRESETS) {
      expect(normalizePitwallConceptExpiry(preset)).toBe(preset)
    }
  })

  it('tiene i due versi separati e coerenti con la directory', () => {
    expect(getPitwallConceptLinks('assist')).toBe(PITWALL_CONCEPT_LINKS_ASSIST)
    expect(getPitwallConceptLinks('assisted')).toBe(PITWALL_CONCEPT_LINKS_ASSISTED)
    for (const link of [...PITWALL_CONCEPT_LINKS_ASSIST, ...PITWALL_CONCEPT_LINKS_ASSISTED]) {
      expect(getPitwallConceptPerson(link.personId)).not.toBeNull()
      if (link.access === 'today') expect(normalizePitwallConceptExpiry(link.until ?? '')).toBe(link.until)
    }
  })

  it('filtra per nickname, con o senza chiocciola', () => {
    expect(filterPitwallConceptPeople('mar').map(person => person.id))
      .toEqual(['mario', 'marco', 'gallo', 'martina'])
    expect(filterPitwallConceptPeople('@lucab').map(person => person.id)).toEqual(['luca'])
    expect(filterPitwallConceptPeople('')).toHaveLength(PITWALL_CONCEPT_PEOPLE.length)
  })

  it('propone solo persone non ancora collegate, e niente a query vuota', () => {
    expect(searchPitwallConceptDirectory('').state).toBe('idle')
    expect(searchPitwallConceptDirectory('  ').state).toBe('idle')
    // "mariorossi" e' gia' fra chi posso assistere: non deve ricomparire come
    // aggiungibile, ma nemmeno sparire (vedi lo stato "ce l'hai gia'").
    const found = searchPitwallConceptDirectory('mar')
    expect(found.entries.map(person => person.id)).toEqual(['gallo', 'martina'])
    expect(found.linked.map(person => person.id)).toEqual(['mario', 'marco'])
    expect(searchPitwallConceptDirectory('enricos').entries).toEqual([])
    expect(searchPitwallConceptDirectory('nessuno').state).toBe('none')
  })

  it('descrive gare vive con equipaggio preso dalla directory', () => {
    for (const race of PITWALL_CONCEPT_RACES) {
      expect(getPitwallConceptPerson(race.reason.personId)).not.toBeNull()
      expect(race.members.every(member => getPitwallConceptPerson(member.personId) !== null)).toBe(true)
      // Chi ha aperto la gara deve essere dentro: senza, nessuno potrebbe gestirla.
      expect(race.members.some(member => member.personId === race.hostId)).toBe(true)
    }
    // Non guido mai io: il prototipo racconta il muretto, non il volante.
    const driving = PITWALL_CONCEPT_RACES.flatMap(race => race.members.filter(member => member.driving))
    expect(driving.every(member => member.personId !== PITWALL_CONCEPT_CURRENT_USER_ID)).toBe(true)
  })

  it('mantiene i comandi pressione deterministici e limitati', () => {
    expect(stepPitwallConceptPressure(PITWALL_CONCEPT_DEFAULT_PRESSURES.FL, 1)).toBe(25.1)
    expect(stepPitwallConceptPressure(35, 1)).toBe(35)
    expect(stepPitwallConceptPressure(20, -1)).toBe(20)
  })
})

describe('Pitwall Concept: le due facce di una richiesta', () => {
  it('dice la stessa richiesta con due parole diverse ai due lati', () => {
    // Chi ha chiesto aspetta; chi ha ricevuto deve rispondere. La parola cambia
    // perche' cambia chi puo' fare qualcosa.
    expect(describePitwallConceptAccess({ personId: 'x', access: 'pending' })).toBe('In attesa')
    expect(describePitwallConceptAccess({ personId: 'x', access: 'incoming' })).toBe('Ti ha chiesto')
    expect(isPitwallConceptGranted({ personId: 'x', access: 'always' })).toBe(true)
    expect(isPitwallConceptGranted({ personId: 'x', access: 'today', until: '22:00' })).toBe(true)
    expect(isPitwallConceptGranted({ personId: 'x', access: 'pending' })).toBe(false)
    expect(isPitwallConceptGranted({ personId: 'x', access: 'incoming' })).toBe(false)
  })

  it('mostra chi e gia in un elenco invece di nasconderlo', () => {
    // "alessandro" e' una richiesta mandata, "paolo" una ricevuta: entrambi
    // hanno gia' una riga con la loro azione, quindi non sono da aggiungere.
    // Ma sparire risponderebbe "non esiste" a chi chiede "chi e'?", ed e' il
    // difetto che questa forma chiude: si mostrano, spenti.
    for (const term of ['alessandro', 'paolo']) {
      const found = searchPitwallConceptDirectory(term)
      expect(found.entries).toEqual([])
      expect(found.linked.map(person => person.id)).toHaveLength(1)
      expect(found.state).toBe('none')
    }
    // Con un elenco esplicito la funzione resta pura e non guarda le fixture.
    expect(searchPitwallConceptDirectory('mar', []).entries.map(person => person.id))
      .toEqual(['mario', 'marco', 'gallo', 'martina'])
  })

  it('non cerca sotto due lettere, come il servizio reale', () => {
    expect(searchPitwallConceptDirectory('m').state).toBe('too-short')
    expect(searchPitwallConceptDirectory('@m').state).toBe('too-short')
    expect(searchPitwallConceptDirectory('ma').state).not.toBe('too-short')
  })

  it('taglia anche l elenco di chi hai gia, che e contesto e non azioni', () => {
    // Senza tetto erano quaranta righe grigie sotto i risultati veri: lo stesso
    // difetto che questa schermata esiste per chiudere.
    const linked = PITWALL_CONCEPT_FILLER_PEOPLE.map(person => person.id)
    const found = searchPitwallConceptDirectory('pilota', linked)
    expect(found.linked).toHaveLength(PITWALL_CONCEPT_LINKED_PREVIEW)
    expect(found.linkedHidden).toBe(PITWALL_CONCEPT_FILLER_PEOPLE.length - PITWALL_CONCEPT_LINKED_PREVIEW)
    expect(found.entries).toEqual([])
    expect(found.state).toBe('none')
  })

  it('dichiara il taglio invece di troncare in silenzio', () => {
    // Il riempitivo esiste per questo: una ricerca larga trova decine di voci,
    // e il tetto va detto, non subito.
    const found = searchPitwallConceptDirectory('pilota', [])
    expect(found.state).toBe('capped')
    expect(found.entries).toHaveLength(PITWALL_CONCEPT_LIST_LIMITS.search)
    expect(found.hidden).toBeGreaterThan(0)
    expect(found.entries.length + found.hidden).toBe(PITWALL_CONCEPT_FILLER_PEOPLE.length)
  })
})

describe('Pitwall Concept: elenchi lunghi e vuoti', () => {
  const rows = (count: number) => Array.from({ length: count }, (_unused, index) => index)

  it('mostra le prime N e dice quante ne restano', () => {
    expect(splitPitwallConceptList(rows(3), 8)).toEqual({ visible: [0, 1, 2], hidden: 0 })
    expect(splitPitwallConceptList(rows(8), 8).hidden).toBe(0)
    const split = splitPitwallConceptList(rows(50), 8)
    expect(split.visible).toHaveLength(8)
    expect(split.hidden).toBe(42)
    expect(splitPitwallConceptList([], 8)).toEqual({ visible: [], hidden: 0 })
  })

  it('non nasconde mai una riga che chiede una decisione', () => {
    // E' la regola che tiene insieme tutto: un limite che nasconde una
    // richiesta e' lo stesso difetto dello scroll interno tolto dalla Classica.
    const items = [...rows(20), 'decidi']
    const split = splitPitwallConceptList(items, 3, item => item === 'decidi')
    expect(split.visible).toContain('decidi')
    expect(split.visible).toHaveLength(3)
    expect(split.hidden).toBe(18)
  })

  it('con piu righe fissate del limite le tiene comunque tutte', () => {
    const items = ['a', 'b', 'c', 'd', 1, 2, 3]
    const split = splitPitwallConceptList(items, 2, item => typeof item === 'string')
    expect(split.visible).toEqual(['a', 'b', 'c', 'd'])
    expect(split.hidden).toBe(3)
  })

  it('mette in cima chi aspetta una risposta, poi chi e in gara', () => {
    const links: PitwallConceptLink[] = [
      { personId: 'martina', access: 'always' },
      { personId: 'gallo', access: 'always' },
      { personId: 'alessandro', access: 'pending' },
      { personId: 'paolo', access: 'incoming' },
    ]
    expect(sortPitwallConceptLinks(links, ['martina']).map(link => link.personId))
      .toEqual(['paolo', 'alessandro', 'martina', 'gallo'])
    // A parita' di peso decide l'ordine alfabetico, non quello di arrivo.
    expect(sortPitwallConceptLinks(links).map(link => link.personId))
      .toEqual(['paolo', 'alessandro', 'marcog', 'martinac'].map(nickname =>
        nickname === 'marcog' ? 'gallo' : nickname === 'martinac' ? 'martina' : nickname))
  })

  it('dice cose diverse ai due elenchi vuoti', () => {
    // Un testo solo direbbe la cosa giusta a meta' delle persone: in un verso
    // aspetti, nell'altro sei tu a dover fare qualcosa.
    expect(describePitwallConceptEmpty('assist')).toContain('Nessuno ti ha ancora autorizzato')
    expect(describePitwallConceptEmpty('assisted')).toContain('Non hai ancora autorizzato nessuno')
    expect(describePitwallConceptEmpty('assist')).not.toBe(describePitwallConceptEmpty('assisted'))
  })

  it('riassume il muretto invece di stampare sedici nomi', () => {
    expect(pitwallConceptWallSummary([], 5)).toEqual({ shown: [], extra: 0 })
    expect(pitwallConceptWallSummary(['a'], 5)).toEqual({ shown: ['a'], extra: 0 })
    const many = Array.from({ length: 16 }, (_unused, index) => `p${index}`)
    expect(pitwallConceptWallSummary(many, 5)).toEqual({ shown: many.slice(0, 5), extra: 11 })
    expect(describePitwallConceptWall(['mario', 'luca'], 5)).toBe('mariorossi, lucab')
    expect(describePitwallConceptWall(['mario', 'luca', 'marco'], 2)).toBe('mariorossi, lucab e altri 1')
  })

  it('dice quando una gara e piena, con il tetto vero delle regole', () => {
    const race = PITWALL_CONCEPT_RACES[0]!
    expect(pitwallConceptRoomIsFull(race)).toBe(false)
    expect(pitwallConceptRoomIsFull(null)).toBe(false)
    const full = {
      ...race,
      members: Array.from({ length: PITWALL_CONCEPT_MAX_ROOM_PEOPLE }, (_unused, index) => ({
        personId: `p${index}`, role: 'member' as const, driving: false, online: true,
      })),
    }
    expect(pitwallConceptRoomIsFull(full)).toBe(true)
  })

  it('lo scenario affollato porta gli elenchi ai tetti veri', () => {
    const crowd = buildPitwallConceptCrowd()
    expect(crowd.links.assist.length).toBeGreaterThan(PITWALL_CONCEPT_LIST_LIMITS.people)
    expect(crowd.links.assisted.length).toBeGreaterThan(PITWALL_CONCEPT_LIST_LIMITS.people)
    expect(crowd.races.length).toBeGreaterThan(PITWALL_CONCEPT_LIST_LIMITS.races)
    // Le due richieste stanno in fondo all'elenco: e' li' che si vede se il
    // limite le nasconde.
    const incoming = crowd.links.assisted.filter(link => link.access === 'incoming')
    expect(incoming.length).toBeGreaterThanOrEqual(2)
    const split = splitPitwallConceptList(
      sortPitwallConceptLinks(crowd.links.assisted),
      PITWALL_CONCEPT_LIST_LIMITS.people,
      isPitwallConceptPinnedLink,
    )
    for (const link of incoming) expect(split.visible).toContain(link)
    // Ogni persona citata esiste davvero nella directory.
    for (const race of crowd.races) {
      for (const member of race.members) {
        expect(getPitwallConceptPerson(member.personId), member.personId).not.toBeNull()
      }
    }
  })
})

describe('Pitwall Concept: la gara, i ruoli e chi applica', () => {
  const race = () => PITWALL_CONCEPT_RACES[0]!
  const invitedRace = () => PITWALL_CONCEPT_RACES[1]!

  it('distingue chi e entrato da chi e solo invitato', () => {
    expect(pitwallConceptAmMember(race())).toBe(true)
    expect(pitwallConceptAmInvited(race())).toBe(false)
    expect(pitwallConceptAmMember(invitedRace())).toBe(false)
    expect(pitwallConceptAmInvited(invitedRace())).toBe(true)
    expect(pitwallConceptAmMember(null)).toBe(false)
    expect(pitwallConceptAmInvited(null)).toBe(false)
  })

  it('elegge chi applica solo quando uno solo ha il volante', () => {
    expect(resolvePitwallConceptExecutor(race())).toEqual({ state: 'ready', driverId: 'mario' })
    // Nessuno al volante: non si indovina, e la seconda gara serve a mostrarlo.
    expect(resolvePitwallConceptExecutor(invitedRace()).state).toBe('nobody-driving')
    expect(resolvePitwallConceptExecutor(null).state).toBe('nobody-driving')
    const contested = { ...race(), members: race().members.map(member => ({ ...member, driving: true })) }
    expect(resolvePitwallConceptExecutor(contested)).toEqual({ state: 'multiple-driving', driverId: null })
  })

  it('unisce piu nickname senza cadere nella trappola di map', () => {
    // `ids.map(pitwallConceptNicknameById)` passerebbe l'indice come directory
    // e farebbe esplodere la pagina: il difetto e' arrivato fino al browser.
    expect(pitwallConceptNicknames(pitwallConceptWallIds(race()))).toEqual(['enricos', 'lucab'])
    expect(pitwallConceptNicknames([])).toEqual([])
  })

  it('tiene fuori dal muretto chi guida e chi e solo invitato', () => {
    // Me stesso resta nell'elenco: la domanda e' "chi c'e'", e vedersi dentro
    // e' la conferma di esserci. Una sola funzione per la home e per la gara.
    expect(pitwallConceptWallIds(race())).toEqual(['enrico', 'luca'])
    expect(pitwallConceptWallIds(null)).toEqual([])
  })

  it('protegge chi ha aperto la gara da uscite, degradi ed espulsioni', () => {
    const host = race().members.find(member => member.personId === 'mario')!
    // Sono manager, ma mario ha aperto la gara: non lo tolgo e non lo promuovo.
    expect(pitwallConceptIsManager(race())).toBe(true)
    expect(pitwallConceptCanRemove(race(), host)).toBe(false)
    expect(pitwallConceptCanPromote(race(), host)).toBe(false)
    expect(pitwallConceptCanLeave(race())).toBe(true)
    expect(pitwallConceptCanLeave({ ...race(), hostId: PITWALL_CONCEPT_CURRENT_USER_ID })).toBe(false)
    const plain = race().members.find(member => member.personId === 'luca')!
    expect(pitwallConceptCanPromote(race(), plain)).toBe(true)
    expect(pitwallConceptCanRemove(race(), plain)).toBe(true)
  })

  it('usa le stesse parole della vista classica per le pastiglie', () => {
    expect(describePitwallConceptMember({ personId: 'mario', role: 'manager', driving: true, online: true }))
      .toBe('AL VOLANTE')
    expect(describePitwallConceptMember({ personId: 'andrea', role: 'invited', driving: false, online: false }))
      .toBe('invitato · non ancora entrato')
    expect(describePitwallConceptMember({ personId: 'enrico', role: 'manager', driving: false, online: true }))
      .toBe('gestisce la gara')
    expect(describePitwallConceptMember({ personId: 'enrico', role: 'manager', driving: false, online: false }))
      .toBe('gestisce la gara · offline')
    expect(describePitwallConceptMember({ personId: 'luca', role: 'member', driving: false, online: true }))
      .toBe('presente')
    expect(describePitwallConceptMember({ personId: 'luca', role: 'member', driving: false, online: false }))
      .toBe('offline')
  })

  it('spiega perche sei dentro senza nominare i permessi', () => {
    expect(describePitwallConceptReason({ kind: 'grant', personId: 'mario' }))
      .toBe('Sei dentro perché mariorossi ti ha autorizzato.')
    expect(describePitwallConceptReason({ kind: 'invite', personId: 'marco' }))
      .toBe('marcom ti ha invitato a questa gara.')
  })

  it('dichiara il motivo del blocco, nell ordine in cui conta', () => {
    // Il primo motivo vero vince: dirne uno piu' avanti sarebbe una bugia utile
    // a nessuno. "Nessuna modifica" arriva per ultimo perche' e' il meno grave.
    expect(pitwallConceptSendBlock(null, true)).toBe('Nessuna gara selezionata.')
    expect(pitwallConceptSendBlock({ ...race(), closed: true }, true))
      .toBe('Questa gara è chiusa: non accetta più strategie.')
    expect(pitwallConceptSendBlock(invitedRace(), true)).toBe('Non sei ancora entrato in questa gara.')
    const entered = {
      ...invitedRace(),
      members: invitedRace().members.map(member =>
        member.personId === PITWALL_CONCEPT_CURRENT_USER_ID ? { ...member, role: 'member' as const } : member),
    }
    expect(pitwallConceptSendBlock(entered, true)).toBe('Nessuno è al volante: nessun ordine parte.')
    const contested = { ...race(), members: race().members.map(member => ({ ...member, driving: true })) }
    expect(pitwallConceptSendBlock(contested, true))
      .toBe('Due piloti risultano al volante: nessun ordine parte finché non è chiaro chi guida.')
    expect(pitwallConceptSendBlock(race(), false)).toBe('Nessuna modifica da inviare.')
    expect(pitwallConceptSendBlock(race(), true)).toBeNull()
  })

  it('scrive gli avvisi con le parole della pagina', () => {
    expect(describePitwallConceptNotice({ id: 1, kind: 'request', personId: 'paolo' }).title)
      .toBe('paolov vuole assisterti')
    expect(describePitwallConceptNotice({ id: 2, kind: 'invite', personId: 'marco', raceId: 'race-12' }))
      .toEqual({ title: 'marcom ti invita a una gara', body: '#12 · Spa-Francorchamps · Qualifica · 20 min' })
    // Un invito a una gara sparita non deve stampare "undefined".
    expect(describePitwallConceptNotice({ id: 3, kind: 'invite', personId: 'marco', raceId: 'boh' }).body)
      .toBe('Gara non più disponibile.')
    expect(describePitwallConceptNotice({ id: 4, kind: 'granted', personId: 'mario' }).title)
      .toBe('mariorossi ti ha autorizzato')
  })
})
