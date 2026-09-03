// La presa vera del Pit Wall, provata con stanza e permessi finti (PIP-360).
//
// Ogni riga della tabella di traduzione ha qui il suo ramo: i permessi nelle
// quattro parole della pagina, le gare con o senza presenza in diretta, gli
// avvisi derivati (richieste, inviti, permessi arrivati durante la sessione),
// la ricerca con il debounce, le azioni che finiscono sui servizi giusti.
import { computed, nextTick, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const fakes = vi.hoisted(() => ({ link: null as unknown, trust: null as unknown }))

vi.mock('~/config/firebase', () => ({ db: {} }))
vi.mock('firebase/firestore', () => ({ doc: () => ({ path: 'publicProfiles/me' }) }))
vi.mock('~/composables/useFirebaseTracker', () => ({
  trackedGetDoc: async () => ({ exists: () => true, data: () => ({ nickname: 'enricos' }) }),
}))
vi.mock('~/composables/useFirebaseAuth', async () => {
  const { ref: makeRef } = await import('vue')
  return { useFirebaseAuth: () => ({ currentUser: makeRef({ uid: 'me' }) }) }
})
vi.mock('~/composables/usePitwallRoom', () => ({ usePitwallRoom: () => fakes.link }))
vi.mock('~/composables/usePitwallLink', () => ({ usePitwallLink: () => fakes.trust }))

import { NOTICE_PREFIX, linkFromIncoming, linkFromOutgoing, usePitwallLiveStore } from '~/composables/usePitwallLiveStore'
import type { PitwallRoom } from '~/services/pitwall/pitwallRoomContract'

const NOW = Date.parse('2026-09-03T10:00:00.000Z')

function room(overrides: Partial<PitwallRoom> = {}): PitwallRoom {
  return {
    schemaVersion: 2,
    roomId: 'r1',
    label: 'Ferrari 296 GT3',
    hostUid: 'pilota',
    managerUids: ['pilota'],
    memberUids: ['pilota'],
    allowedUids: ['pilota', 'me'],
    vehicleFingerprint: 'fp',
    createdAt: '2026-09-03T09:00:00.000Z',
    updatedAt: '2026-09-03T09:00:00.000Z',
    track: 'Monza',
    raceNumber: 47,
    closedAt: null,
    ...overrides,
  }
}

function outgoing(driverUid: string, status: string, extra: Record<string, unknown> = {}) {
  return { driverUid, nickname: driverUid, status, scope: 'always', expiresAtMs: null, requestedScope: 'always', usable: status === 'granted', session: null, reachable: false, ...extra }
}

function incoming(engineerUid: string, status: string, extra: Record<string, unknown> = {}) {
  return { engineerUid, nickname: engineerUid, status, createdAt: '2026-09-03T09:00:00.000Z', scope: status === 'granted' ? 'always' : null, expiresAtMs: null, requestedScope: 'always', ...extra }
}

function makeLink() {
  const roomRef = ref<PitwallRoom | null>(null)
  const executor = ref({ executor: null as { uid: string } | null, reason: 'nobody-driving', conflicting: [] })
  /** Le gare che la pulizia automatica ha chiuso: e' una scrittura, si guarda. */
  const closedByService: string[] = []
  return {
    closedByService,
    service: () => ({
      uid: 'me',
      closeRoom: async (roomId: string) => {
        closedByService.push(roomId)
        return { ok: true as const, value: true as const }
      },
    }),
    nowTick: ref(NOW),
    rooms: ref<PitwallRoom[]>([]),
    room: roomRef,
    crew: ref<{ uid: string, nickname: string, role: 'manager' | 'member', invited: boolean, driving: boolean, online: boolean, connecting: boolean }[]>([]),
    executor,
    executorLabel: computed(() => (executor.value.reason === 'ready' ? 'al volante' : 'Nessuno al volante')),
    selectedRoomId: computed(() => roomRef.value?.roomId ?? null),
    roomClosed: computed(() => Boolean(roomRef.value?.closedAt)),
    amMember: ref(true),
    canSend: ref(false),
    carSnapshot: ref(null),
    orderStatus: ref(null),
    orderReason: ref(null),
    orderFields: ref({}),
    notice: ref<string | null>(null),
    lastError: ref<string | null>(null),
    selectRoom: vi.fn(async (roomId: string) => { roomRef.value = fakes.link ? (fakes.link as ReturnType<typeof makeLink>).rooms.value.find(entry => entry.roomId === roomId) ?? null : null }),
    leave: vi.fn(async () => {}),
    invite: vi.fn(async () => {}),
    promote: vi.fn(async () => {}),
    revoke: vi.fn(async () => {}),
    closeRoom: vi.fn(async () => {}),
    sendPlan: vi.fn(async () => true),
    start: vi.fn(),
    stop: vi.fn(),
  }
}

function makeTrust() {
  const incomingRef = ref<ReturnType<typeof incoming>[]>([])
  const outgoingRef = ref<ReturnType<typeof outgoing>[]>([])
  return {
    incoming: incomingRef,
    outgoing: outgoingRef,
    pendingIncoming: computed(() => incomingRef.value.filter(entry => entry.status === 'pending')),
    grantedIncoming: computed(() => incomingRef.value.filter(entry => entry.status === 'granted')),
    searchResults: ref<{ uid: string, nickname: string }[]>([]),
    searchTerm: ref(''),
    search: vi.fn(async () => {}),
    requestLink: vi.fn(async () => {}),
    withdrawRequest: vi.fn(async () => {}),
    preAuthorise: vi.fn(async () => {}),
    decide: vi.fn(async () => {}),
    setExpiry: vi.fn(async () => {}),
    refreshIncoming: vi.fn(async () => {}),
    refreshPilots: vi.fn(async () => {}),
    watchLive: vi.fn(),
    stop: vi.fn(),
    notice: ref<string | null>(null),
    lastError: ref<string | null>(null),
  }
}

const link = makeLink()
const trust = makeTrust()
fakes.link = link
fakes.trust = trust
const store = usePitwallLiveStore()

async function settle() {
  for (let index = 0; index < 10; index += 1) await Promise.resolve()
  await nextTick()
}

beforeEach(() => {
  link.rooms.value = []
  link.room.value = null
  link.crew.value = []
  trust.incoming.value = []
  trust.outgoing.value = []
  trust.searchResults.value = []
  vi.clearAllMocks()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('i permessi nelle quattro parole della pagina', () => {
  it('traduce ogni stato del servizio, e tace su quelli che non si mostrano', () => {
    const until = new Date(2026, 8, 3, 23, 40).getTime()
    expect(linkFromOutgoing(outgoing('a', 'granted') as never)).toEqual({ personId: 'a', access: 'always' })
    expect(linkFromOutgoing(outgoing('b', 'granted', { scope: 'once', expiresAtMs: until }) as never)).toEqual({ personId: 'b', access: 'today', until: '23:40' })
    expect(linkFromOutgoing(outgoing('c', 'pending') as never)).toEqual({ personId: 'c', access: 'pending' })
    expect(linkFromOutgoing(outgoing('d', 'revoked') as never)).toBeNull()
    // Concesso ma scaduto: il servizio lo dice con `usable`, e non si mostra.
    expect(linkFromOutgoing(outgoing('e', 'granted', { usable: false }) as never)).toBeNull()

    expect(linkFromIncoming(incoming('f', 'pending') as never, NOW)).toEqual({ personId: 'f', access: 'incoming' })
    expect(linkFromIncoming(incoming('g', 'granted') as never, NOW)).toEqual({ personId: 'g', access: 'always' })
    expect(linkFromIncoming(incoming('h', 'granted', { scope: 'once', expiresAtMs: until }) as never, NOW)).toEqual({ personId: 'h', access: 'today', until: '23:40' })
    expect(linkFromIncoming(incoming('i', 'granted', { scope: 'once', expiresAtMs: NOW - 1 }) as never, NOW)).toBeNull()
    expect(linkFromIncoming(incoming('j', 'revoked') as never, NOW)).toBeNull()
  })

  it('i due versi vengono dai due elenchi del servizio', async () => {
    trust.outgoing.value = [outgoing('pilota', 'granted'), outgoing('altro', 'pending')]
    trust.incoming.value = [incoming('popo', 'pending'), incoming('ing2', 'granted')]
    expect(store.links.value.assist).toEqual([{ personId: 'pilota', access: 'always' }, { personId: 'altro', access: 'pending' }])
    expect(store.links.value.assisted).toEqual([{ personId: 'popo', access: 'incoming' }, { personId: 'ing2', access: 'always' }])
    // La prima lettura semina i permessi che c'erano gia', senza avvisare:
    // "X ti ha autorizzato" per un permesso vecchio non e' una notizia.
    await nextTick()
    expect(store.notices.value.filter(notice => notice.kind === 'granted')).toEqual([])
  })

  it('la scadenza si cambia solo sui permessi che si posseggono', () => {
    expect(store.canEditExpiry('assisted')).toBe(true)
    expect(store.canEditExpiry('assist')).toBe(false)
    store.setExpiry('assist', 'pilota', '23:40')
    expect(trust.setExpiry).not.toHaveBeenCalled()
    store.setExpiry('assisted', 'popo', '23:40')
    expect(trust.setExpiry).toHaveBeenCalledTimes(1)
    const [uid, expiresAtMs] = trust.setExpiry.mock.calls[0] as [string, number]
    expect(uid).toBe('popo')
    expect(expiresAtMs).toBeGreaterThan(Date.now())
  })

  it('autorizzare, decidere, annullare e rimuovere finiscono sul servizio giusto', () => {
    store.askToAssist('pilota')
    expect(trust.requestLink).toHaveBeenCalledWith('pilota', 'always')
    store.cancelRequest('pilota')
    expect(trust.withdrawRequest).toHaveBeenCalledWith('pilota')
    store.allowToAssistMe('popo', 'always')
    expect(trust.preAuthorise).toHaveBeenCalledWith('popo', 'always', null)
    store.allowToAssistMe('popo', 'today', '23:40')
    const [, scope, expiresAtMs] = trust.preAuthorise.mock.calls[1] as [string, string, number]
    expect(scope).toBe('once')
    expect(expiresAtMs).toBeGreaterThan(Date.now())
    store.decideRequest('popo', 'reject')
    expect(trust.decide).toHaveBeenCalledWith('popo', 'revoked')
    store.decideRequest('popo', 'always')
    expect(trust.decide).toHaveBeenCalledWith('popo', 'granted', 'always', null)
    // Rimuovere e' revocare nel verso che possiedo, ritirare nell'altro.
    store.removeLink('assisted', 'popo')
    expect(trust.decide).toHaveBeenLastCalledWith('popo', 'revoked')
    store.removeLink('assist', 'pilota')
    expect(trust.withdrawRequest).toHaveBeenLastCalledWith('pilota')
  })
})

describe('la gara del pilota, vista dal pilota', () => {
  // "In pista" nasce da "le persone che mi hanno autorizzato": per costruzione
  // non contiene me. Chi guidava apriva la pagina e non vedeva la gara che il
  // suo stesso computer aveva appena aperto.
  it('non compare fra le persone in pista, ma c e', () => {
    link.rooms.value = [room({ hostUid: 'me', managerUids: ['me'], memberUids: ['me'], allowedUids: ['popo'] })]
    expect(store.races.value).toEqual([])
    expect(store.myRoom.value).toMatchObject({
      id: 'r1',
      label: 'Ferrari 296 GT3',
      track: 'Monza',
      carNumber: 47,
      invitedIds: ['popo'],
    })
  })

  it('le gare in cui non entra piu nessuno si chiudono da sole, quella in corso no', async () => {
    // Le stanze non si cancellano - sono la memoria della corsa - ma finora non
    // finivano nemmeno: l'elenco diventava otto gare identiche di giorni diversi.
    const vecchia = room({
      roomId: 'vecchia', managerUids: ['me'], memberUids: ['me'],
      createdAt: '2026-08-01T09:00:00.000Z', updatedAt: '2026-08-01T09:00:00.000Z',
    })
    const corrente = room({ roomId: 'corrente', managerUids: ['me'], memberUids: ['me'], lastLiveAtMs: NOW })
    link.room.value = corrente
    link.rooms.value = [vecchia, corrente]
    await nextTick()

    expect(link.closedByService).toEqual(['vecchia'])

    // Non si riprova su una gara gia' trattata: l'elenco arriva in diretta.
    link.rooms.value = [vecchia, corrente]
    await nextTick()
    expect(link.closedByService).toEqual(['vecchia'])
  })

  it('la gara di un altro in cui sono entrato non e la mia: sono l ingegnere, non il pilota', () => {
    // Visto da popo il 2026-09-04: membro della stanza di RICO117, si vedeva
    // "La tua gara" con "il tuo PC l'ha gia' aggiunto".
    link.rooms.value = [room({ hostUid: 'pilota', memberUids: ['pilota', 'me'] })]
    expect(store.myRoom.value).toBeNull()
  })

  it('senza una gara aperta si dice che non c e, invece di mostrare il nulla', () => {
    link.rooms.value = []
    expect(store.myRoom.value).toBeNull()
  })

  it('una gara chiusa non e piu la tua gara', () => {
    link.rooms.value = [room({ hostUid: 'me', memberUids: ['me'], closedAt: '2026-09-03T12:00:00.000Z' })]
    expect(store.myRoom.value).toBeNull()
  })

  it('dopo due timbri persi si dice dormiente, invece di farla sembrare viva', () => {
    const mia = room({ hostUid: 'me', memberUids: ['me'], createdAt: '2026-09-01T09:00:00.000Z', updatedAt: '2026-09-01T09:00:00.000Z' })
    link.rooms.value = [{ ...mia, lastLiveAtMs: NOW }]
    expect(store.myRoom.value?.state).toBe('live')

    link.rooms.value = [{ ...mia, lastLiveAtMs: NOW - 60 * 60_000 }]
    expect(store.myRoom.value?.state).toBe('dormant')
  })

  it('chi ha il volante lo si dice solo della gara che si sta guardando in diretta', () => {
    // Altrove sarebbe una deduzione da un elenco di identificativi: meglio non
    // dirlo che dirlo a caso.
    const mia = room({ hostUid: 'me', memberUids: ['me'], lastLiveAtMs: NOW })
    link.rooms.value = [mia]
    link.executor.value = { executor: { uid: 'me' }, reason: 'ready', conflicting: [] }
    expect(store.myRoom.value?.drivingId).toBeNull()

    link.room.value = mia
    expect(store.myRoom.value?.drivingId).toBe('me')
  })
})

describe('le gare e gli avvisi', () => {
  it('una riga per persona in pista, con pista e vettura lette dalla sua presenza', () => {
    link.rooms.value = [room()]
    trust.outgoing.value = [outgoing('pilota', 'granted', {
      reachable: true,
      session: { online: true, updatedAt: new Date(NOW).toISOString(), car: 'ferrari_296_gt3', track: 'nurburgring' },
    })]
    const [race] = store.races.value
    expect(race).toMatchObject({
      id: 'r1',
      hostId: 'pilota',
      carNumber: 47,
      carModel: 'Ferrari 296 GT3',
      track: 'Nurburgring',
      session: 'In pista',
      closed: false,
      live: true,
      joinable: true,
    })
    // L'invito resta un avviso: e' una cosa da decidere, non una gara in pista.
    expect(store.notices.value).toEqual([{ id: 'inv:r1', kind: 'invite', personId: 'pilota', raceId: 'r1' }])
  })

  it('chi non e in pista non compare, e chi smette sparisce da solo', () => {
    link.rooms.value = [room()]
    // Autorizzato ma con ACC spento: la stanza esiste ancora, la riga no.
    trust.outgoing.value = [outgoing('pilota', 'granted', { reachable: false })]
    expect(store.races.value).toEqual([])

    trust.outgoing.value = [outgoing('pilota', 'granted', { reachable: true, session: { online: true, updatedAt: new Date(NOW).toISOString() } })]
    expect(store.races.value).toHaveLength(1)

    // Spegne il gioco: il battito invecchia, reachable cade, la riga sparisce.
    trust.outgoing.value = [outgoing('pilota', 'granted', { reachable: false })]
    expect(store.races.value).toEqual([])
  })

  it('in pista ma non ancora invitati: si vede la persona e si dice che non si entra', () => {
    // Il PC del pilota aggiunge gli autorizzati alla sua stanza a intervalli:
    // in mezzo, la persona e' viva ma la sua stanza non e' nostra. Meglio
    // dirlo che offrire un bottone che non porta da nessuna parte.
    link.rooms.value = []
    trust.outgoing.value = [outgoing('pilota', 'granted', { reachable: true, session: { online: true, updatedAt: new Date(NOW).toISOString() } })]
    const [race] = store.races.value
    expect(race).toMatchObject({ id: 'driver:pilota', hostId: 'pilota', joinable: false, members: [] })

    store.enterRace(race!.id)
    expect(link.selectRoom).not.toHaveBeenCalled()
    expect(link.notice.value).toContain('non ti ha ancora aggiunto')
  })

  it('due persone sulla stessa vettura sono una riga sola', async () => {
    // Endurance: due piloti che si danno il cambio stanno nella stessa stanza.
    // Due righe che portano allo stesso pit stop sarebbero solo un doppione.
    link.rooms.value = [room({ memberUids: ['pilota', 'secondo'], allowedUids: ['pilota', 'secondo', 'me'] })]
    const live = { online: true, updatedAt: new Date(NOW).toISOString() }
    trust.outgoing.value = [
      outgoing('pilota', 'granted', { reachable: true, session: live }),
      outgoing('secondo', 'granted', { reachable: true, session: live }),
    ]
    expect(store.races.value.map(race => race.id)).toEqual(['r1'])
    expect(store.races.value[0]!.hostId).toBe('pilota')

    // Lo store e' un singleton: il permesso nuovo di `secondo` accende un
    // avviso che altrimenti resterebbe acceso nei test successivi.
    await nextTick()
    for (const notice of store.notices.value.filter(entry => entry.kind === 'granted')) {
      store.dismissNotice(notice.id)
    }
  })

  it('di uno stesso pilota si apre la stanza aperta adesso, non quelle di ieri', () => {
    // Le stanze non si chiudono mai: dello stesso pilota ne restano molte.
    link.rooms.value = [
      room({ roomId: 'vecchia', createdAt: '2026-09-01T08:00:00.000Z' }),
      room({ roomId: 'oggi', createdAt: '2026-09-03T08:00:00.000Z' }),
      room({ roomId: 'chiusa', createdAt: '2026-09-03T09:00:00.000Z', closedAt: '2026-09-03T10:00:00.000Z' }),
    ]
    trust.outgoing.value = [outgoing('pilota', 'granted', { reachable: true, session: { online: true, updatedAt: new Date(NOW).toISOString() } })]
    expect(store.races.value.map(race => race.id)).toEqual(['oggi'])
  })

  it('rifiutare un invito e una memoria locale; accettarlo apre la stanza', async () => {
    link.rooms.value = [room()]
    expect(store.notices.value).toHaveLength(1)
    store.rejectNotice('inv:r1')
    expect(store.notices.value).toEqual([])
    store.acceptNotice('inv:r1')
    await settle()
    expect(link.selectRoom).toHaveBeenCalledWith('r1')
    expect(store.notices.value).toHaveLength(1)
  })

  it('la gara selezionata legge equipaggio e volante dalla presenza in diretta', () => {
    link.rooms.value = [room({ memberUids: ['pilota', 'me'], allowedUids: ['pilota', 'me'] })]
    link.room.value = link.rooms.value[0]!
    link.crew.value = [
      { uid: 'pilota', nickname: 'RICO117', role: 'manager', invited: false, driving: true, online: true, connecting: false },
      { uid: 'me', nickname: 'popo', role: 'member', invited: false, driving: false, online: false, connecting: true },
    ]
    link.executor.value = { executor: { uid: 'pilota' }, reason: 'ready', conflicting: [] }
    const race = store.selectedRace.value!
    expect(race.live).toBe(true)
    expect(race.session).toBe('In pista')
    expect(race.members).toEqual([
      { personId: 'pilota', role: 'manager', driving: true, online: true },
      { personId: 'me', role: 'member', driving: false, online: true },
    ])
    expect(race.reason.kind).toBe('grant')
    // Le persone hanno il nickname che la presenza porta con se'.
    expect(store.people.value.find(person => person.id === 'pilota')?.handle).toBe('@RICO117')
  })

  it('una richiesta in arrivo e un avviso; accettarla per oggi passa l orario al servizio', () => {
    trust.incoming.value = [incoming('popo', 'pending')]
    expect(store.notices.value).toEqual([{ id: 'req:popo', kind: 'request', personId: 'popo' }])
    store.acceptNotice('req:popo', 'today', '23:40')
    const [uid, decision, scope, expiresAtMs] = trust.decide.mock.calls[0] as [string, string, string, number]
    expect([uid, decision, scope]).toEqual(['popo', 'granted', 'once'])
    expect(expiresAtMs).toBeGreaterThan(Date.now())
    store.rejectNotice('req:popo')
    expect(trust.decide).toHaveBeenLastCalledWith('popo', 'revoked')
  })

  it('un permesso arrivato durante la sessione avvisa una volta sola', async () => {
    // Lo store e' gia' stato seminato dal test dei due versi: da qui in poi un
    // permesso nuovo e' una notizia. Ripetere l'elenco non la ripete.
    trust.outgoing.value = [outgoing('pilota', 'granted'), outgoing('nuovo', 'granted')]
    await nextTick()
    expect(store.notices.value).toContainEqual({ id: `${NOTICE_PREFIX.granted}nuovo`, kind: 'granted', personId: 'nuovo' })
    expect(store.notices.value.filter(notice => notice.personId === 'pilota')).toEqual([])
    store.dismissNotice('grant:nuovo')
    expect(store.notices.value.filter(notice => notice.kind === 'granted')).toEqual([])
    trust.outgoing.value = [outgoing('nuovo', 'granted')]
    await nextTick()
    expect(store.notices.value.filter(notice => notice.kind === 'granted')).toEqual([])
  })

  it('le azioni sulla gara selezionano prima la stanza, se non lo era gia', async () => {
    link.rooms.value = [room({ roomId: 'r2' })]
    store.inviteToRace('r2', 'ospite')
    await settle()
    expect(link.selectRoom).toHaveBeenCalledWith('r2')
    expect(link.invite).toHaveBeenCalledWith('ospite')
    store.promoteInRace('r2', 'x')
    store.removeFromRace('r2', 'x')
    store.leaveRace('r2')
    store.closeRace('r2')
    await settle()
    expect(link.promote).toHaveBeenCalledWith('x')
    expect(link.revoke).toHaveBeenCalledWith('x')
    expect(link.leave).toHaveBeenCalled()
    expect(link.closeRoom).toHaveBeenCalled()
    // Gia' selezionata: nessuna seconda selezione.
    expect(link.selectRoom).toHaveBeenCalledTimes(1)
  })
})

describe('la ricerca e le persone', () => {
  it('interroga la directory con un ritardo, e i risultati diventano persone', async () => {
    vi.useFakeTimers()
    store.searchQuery.value = 'ri'
    await nextTick()
    expect(trust.searchTerm.value).toBe('ri')
    expect(trust.search).not.toHaveBeenCalled()
    vi.advanceTimersByTime(300)
    expect(trust.search).toHaveBeenCalledTimes(1)
    trust.searchResults.value = [{ uid: 'rico', nickname: 'RICO117' }]
    expect(store.found.value.entries).toEqual([{ id: 'rico', handle: '@RICO117' }])
    // Un verso solo non basta a dire "ce l'hai gia'": resta proponibile per l'altro.
    trust.outgoing.value = [outgoing('rico', 'granted')]
    expect(store.found.value.entries.map(person => person.id)).toEqual(['rico'])
    // Con entrambi i versi resta visibile, ma fra i collegati.
    trust.incoming.value = [incoming('rico', 'granted')]
    expect(store.found.value.entries).toEqual([])
    expect(store.found.value.linked.map(person => person.id)).toEqual(['rico'])
    // Sotto i due caratteri la ricerca si spegne e svuota.
    store.searchQuery.value = 'r'
    await nextTick()
    expect(trust.searchResults.value).toEqual([])
  })

  it('l avvio carica il mio nickname e accende gli ascolti; l arresto li spegne', async () => {
    store.start()
    await settle()
    expect(link.start).toHaveBeenCalled()
    expect(trust.watchLive).toHaveBeenCalled()
    expect(store.meId.value).toBe('me')
    expect(store.people.value.find(person => person.id === 'me')?.handle).toBe('@enricos')
    expect(store.demo).toBe(false)
    store.halt()
    expect(link.stop).toHaveBeenCalled()
    expect(trust.stop).toHaveBeenCalled()
  })
})
