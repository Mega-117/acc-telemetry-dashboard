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

import { NOTICE_PREFIX, usePitwallLiveStore } from '~/composables/usePitwallLiveStore'
import { registerPitwallIntentControls, resetPitwallIntentForTests, setPitwallIntentStatus } from '~/composables/usePitwallIntent'
import type { PitwallRoom } from '~/services/pitwall/pitwallRoomContract'

const NOW = Date.parse('2026-09-03T10:00:00.000Z')
/** Una presenza fresca: la persona e' in pista adesso. */
const LIVE_SESSION = { online: true, updatedAt: new Date(NOW).toISOString() }

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
    // Viva adesso: senza il segno di vita la gara sarebbe dormiente, e un
    // Pitwall dormiente non e' aperto.
    lastLiveAtMs: NOW,
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
  const revokedByService: { roomId: string, uid: string }[] = []
  return {
    closedByService,
    revokedByService,
    service: () => ({
      uid: 'me',
      closeRoom: async (roomId: string) => {
        closedByService.push(roomId)
        return { ok: true as const, value: true as const }
      },
      revoke: async (roomId: string, uid: string) => {
        revokedByService.push({ roomId, uid })
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

beforeEach(async () => {
  link.rooms.value = []
  link.room.value = null
  link.crew.value = []
  link.notice.value = null
  link.revokedByService.length = 0
  trust.incoming.value = []
  trust.outgoing.value = []
  trust.searchResults.value = []
  resetPitwallIntentForTests()
  vi.clearAllMocks()
  // Lo store e' un singleton: un "X ha accettato" acceso da un test resterebbe
  // acceso in quello dopo.
  await nextTick()
  for (const notice of store.notices.value.filter(entry => entry.kind === 'granted')) store.dismissNotice(notice.id)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('la prima lettura non e una notizia', () => {
  it('semina le amicizie che c erano gia senza avvisare', async () => {
    // "X ha accettato" per un'amicizia di due mesi fa non e' una notizia.
    trust.outgoing.value = [outgoing('pilota', 'granted'), outgoing('altro', 'pending')]
    trust.incoming.value = [incoming('pilota', 'granted'), incoming('popo', 'pending')]
    await nextTick()
    expect(store.notices.value.filter(notice => notice.kind === 'granted')).toEqual([])
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
      lastLiveAtMs: Date.parse('2026-08-01T09:00:00.000Z'),
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

/** Un amico: entrambi i versi concessi. */
function befriended(uid: string, extra: Record<string, unknown> = {}) {
  trust.incoming.value = [...trust.incoming.value, incoming(uid, 'granted')]
  trust.outgoing.value = [...trust.outgoing.value, outgoing(uid, 'granted', extra)]
}

describe('gli amici, in un elenco solo', () => {
  it('amici, richiesta inviata, richiesta ricevuta: tre stati da due permessi, ordinati per cosa aspetta me', () => {
    trust.incoming.value = [incoming('amico', 'granted'), incoming('chiesto', 'granted'), incoming('chiede', 'pending')]
    trust.outgoing.value = [outgoing('amico', 'granted', { reachable: true, session: LIVE_SESSION }), outgoing('vecchio', 'granted')]
    expect(store.friends.value.map(friend => [friend.personId, friend.state, friend.racing])).toEqual([
      ['chiede', 'received', false],
      ['vecchio', 'received', false],
      ['chiesto', 'sent', false],
      ['amico', 'friends', true],
    ])
    // Chiunque sia gia' in un rapporto con me non si ripropone nella ricerca.
    trust.searchResults.value = [{ uid: 'chiesto', nickname: 'nuovochiesto' }, { uid: 'nuovo', nickname: 'nuovo' }]
    store.searchQuery.value = 'nuovo'
    expect(store.found.value.entries.map(person => person.id)).toEqual(['nuovo'])
    expect(store.found.value.linked.map(person => person.id)).toEqual(['chiesto'])
  })

  it('chiedere e accettare sono la stessa scrittura: autorizzo io e chiedo a lui', async () => {
    store.befriend('nuovo')
    await settle()
    expect(trust.preAuthorise).toHaveBeenCalledWith('nuovo', 'always', null)
    expect(trust.requestLink).toHaveBeenCalledWith('nuovo', 'always')
    expect(link.notice.value).toContain('Richiesta inviata')

    // Lui mi aveva gia' autorizzato: basta la mia parte, e siamo amici adesso.
    trust.outgoing.value = [outgoing('pronto', 'granted')]
    vi.clearAllMocks()
    store.befriend('pronto')
    await settle()
    expect(trust.preAuthorise).toHaveBeenCalledWith('pronto', 'always', null)
    expect(trust.requestLink).not.toHaveBeenCalled()
    expect(link.notice.value).toBe('Adesso siete amici.')
  })

  it('togliere un amico tocca solo i documenti che esistono, e lo toglie dalle mie gare aperte', async () => {
    befriended('ex')
    link.rooms.value = [
      room({ roomId: 'mia', hostUid: 'me', managerUids: ['me'], memberUids: ['me', 'ex'], allowedUids: ['ex'] }),
      room({ roomId: 'chiusa', hostUid: 'me', managerUids: ['me'], memberUids: ['me', 'ex'], allowedUids: ['ex'], closedAt: '2026-09-02T00:00:00.000Z' }),
      room({ roomId: 'altrui', hostUid: 'pilota', memberUids: ['pilota', 'me', 'ex'], allowedUids: ['ex'] }),
    ]
    store.unfriend('ex')
    await settle()
    expect(trust.decide).toHaveBeenCalledWith('ex', 'revoked')
    expect(trust.withdrawRequest).toHaveBeenCalledWith('ex')
    expect(link.revokedByService).toEqual([{ roomId: 'mia', uid: 'ex' }])

    // Solo la mia parte esisteva: si revoca quella e basta.
    vi.clearAllMocks()
    trust.incoming.value = [incoming('meta', 'granted')]
    trust.outgoing.value = []
    store.unfriend('meta')
    await settle()
    expect(trust.decide).toHaveBeenCalledWith('meta', 'revoked')
    expect(trust.withdrawRequest).not.toHaveBeenCalled()
  })

  it('il mio Pitwall: senza il lato pilota lo dice, con il lato pilota apre e chiude', async () => {
    expect(store.pitwall.value.available).toBe(false)
    store.startPitwall()
    await settle()
    expect(link.notice.value).toContain('app desktop')

    const calls: string[] = []
    registerPitwallIntentControls({ open: async () => { calls.push('open') }, close: async () => { calls.push('close') } })
    setPitwallIntentStatus({ state: 'arming', roomId: null, reason: 'Si apre appena ACC e in sessione.' })
    expect(store.pitwall.value).toMatchObject({ state: 'arming', available: true })
    store.startPitwall()
    store.closePitwall()
    await settle()
    expect(calls).toEqual(['open', 'close'])
  })
})

describe('i Pitwall aperti e gli avvisi', () => {
  it('una riga per amico con il Pitwall aperto, con pista e vettura lette dalla sua presenza', () => {
    link.rooms.value = [room()]
    befriended('pilota', { reachable: true, session: { ...LIVE_SESSION, car: 'ferrari_296_gt3', track: 'nurburgring' } })
    const [race] = store.races.value
    expect(race).toMatchObject({
      id: 'r1',
      hostId: 'pilota',
      carNumber: 47,
      carModel: 'Ferrari 296 GT3',
      track: 'Nurburgring',
      session: 'Pitwall aperto',
      closed: false,
      live: true,
      joinable: true,
    })
    expect(store.friends.value[0]).toMatchObject({ personId: 'pilota', pitwallOpen: true, raceId: 'r1' })
    // L'invito resta un avviso: e' una cosa da decidere, non una gara in pista.
    expect(store.notices.value.filter(notice => notice.kind === 'invite')).toEqual([{ id: 'inv:r1', kind: 'invite', personId: 'pilota', raceId: 'r1' }])
  })

  it('un Pitwall e aperto se la gara non e chiusa e l amico e in pista: chi spegne sparisce da solo', () => {
    // Amico con ACC spento: la stanza esiste ancora, la riga no.
    link.rooms.value = [room()]
    befriended('pilota', { reachable: false })
    expect(store.races.value).toEqual([])
    expect(store.friends.value[0]).toMatchObject({ personId: 'pilota', racing: false, pitwallOpen: false })

    trust.outgoing.value = [outgoing('pilota', 'granted', { reachable: true, session: LIVE_SESSION })]
    expect(store.races.value).toHaveLength(1)

    // Senza segno di vita sulla stanza (Rules non ancora pubblicate) resta
    // aperto: e' la presenza a dire la verita', e muore in novanta secondi.
    link.rooms.value = [room({ lastLiveAtMs: null })]
    expect(store.races.value).toHaveLength(1)

    // Chiusa dal pilota: sparisce subito.
    link.rooms.value = [room({ closedAt: '2026-09-03T09:59:00.000Z' })]
    expect(store.races.value).toEqual([])

    // Spegne il gioco: il battito invecchia, reachable cade, la riga sparisce.
    link.rooms.value = [room()]
    trust.outgoing.value = [outgoing('pilota', 'granted', { reachable: false })]
    expect(store.races.value).toEqual([])
  })

  it('un permesso a un verso solo non e un Pitwall aperto: e una richiesta', () => {
    // Prima "In pista" nasceva da chi mi aveva autorizzato, e bastava un
    // verso. Adesso serve l'amicizia: chi mi ha solo chiesto non e' al muretto.
    link.rooms.value = [room()]
    trust.outgoing.value = [outgoing('pilota', 'granted', { reachable: true, session: LIVE_SESSION })]
    expect(store.races.value).toEqual([])
    expect(store.friends.value[0]).toMatchObject({ personId: 'pilota', state: 'received', racing: true, pitwallOpen: false })
  })

  it('due amici sulla stessa vettura sono una riga sola', async () => {
    // Endurance: due piloti che si danno il cambio stanno nella stessa stanza.
    // Due righe che portano allo stesso pit stop sarebbero solo un doppione.
    link.rooms.value = [room({ memberUids: ['pilota', 'secondo'], allowedUids: ['pilota', 'secondo', 'me'] })]
    befriended('pilota', { reachable: true, session: LIVE_SESSION })
    befriended('secondo', { reachable: true, session: LIVE_SESSION })
    expect(store.races.value.map(race => race.id)).toEqual(['r1'])
    expect(store.races.value[0]!.hostId).toBe('pilota')

    // Lo store e' un singleton: l'amicizia nuova di `secondo` accende un
    // avviso che altrimenti resterebbe acceso nei test successivi.
    await nextTick()
    for (const notice of store.notices.value.filter(entry => entry.kind === 'granted')) {
      store.dismissNotice(notice.id)
    }
  })

  it('di uno stesso amico si apre la stanza aperta adesso, non quelle di ieri', () => {
    // Le stanze non si chiudono mai: dello stesso pilota ne restano molte.
    link.rooms.value = [
      room({ roomId: 'vecchia', createdAt: '2026-09-01T08:00:00.000Z' }),
      room({ roomId: 'oggi', createdAt: '2026-09-03T08:00:00.000Z' }),
      room({ roomId: 'chiusa', createdAt: '2026-09-03T09:00:00.000Z', closedAt: '2026-09-03T10:00:00.000Z' }),
    ]
    befriended('pilota', { reachable: true, session: LIVE_SESSION })
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

  it('una richiesta in arrivo e un avviso; accettarla fa l amicizia, rifiutarla la scioglie', async () => {
    trust.incoming.value = [incoming('popo', 'pending')]
    expect(store.notices.value).toEqual([{ id: 'req:popo', kind: 'request', personId: 'popo' }])
    store.acceptNotice('req:popo')
    await settle()
    expect(trust.preAuthorise).toHaveBeenCalledWith('popo', 'always', null)
    expect(trust.requestLink).toHaveBeenCalledWith('popo', 'always')
    store.rejectNotice('req:popo')
    await settle()
    expect(trust.decide).toHaveBeenLastCalledWith('popo', 'revoked')
  })

  it('un amicizia completata durante la sessione avvisa una volta sola', async () => {
    // Lo store e' gia' stato seminato: da qui in poi un'amicizia nuova e' una
    // notizia ("X ha accettato"). Ripetere l'elenco non la ripete, e un verso
    // solo non basta.
    trust.outgoing.value = [outgoing('meta', 'granted')]
    await nextTick()
    expect(store.notices.value.filter(notice => notice.kind === 'granted')).toEqual([])
    befriended('nuovo')
    await nextTick()
    expect(store.notices.value).toContainEqual({ id: `${NOTICE_PREFIX.granted}nuovo`, kind: 'granted', personId: 'nuovo' })
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
    // Gia' in un rapporto con me (anche solo una richiesta): fra quelli che ho gia'.
    trust.outgoing.value = [outgoing('rico', 'granted')]
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
