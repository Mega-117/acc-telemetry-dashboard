import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  sets: [] as Array<{ path: string, data: Record<string, unknown> }>,
  updates: [] as Array<{ path: string, data: Record<string, unknown> }>,
  callers: [] as string[],
  /** Documenti per path esatto, letti da trackedGetDoc. */
  docs: new Map<string, Record<string, unknown>>(),
  /** Risultati delle query, nell'ordine in cui il servizio le fa. */
  queryResults: [] as Array<Array<{ id: string, data: Record<string, unknown> }>>,
  /** Ascoltatori vivi, per caller: e' cosi' che si prova il "senza ricaricare". */
  listeners: new Map<string, (snapshot: unknown) => void>(),
  listenerErrors: new Map<string, (error: Error) => void>(),
  stopped: [] as string[],
  failWrites: null as string | null
}))

vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, ...segments: string[]) => ({ path: segments.join('/') }),
  doc: (parent: unknown, ...segments: string[]) => {
    const base = typeof parent === 'object' && parent !== null && 'path' in parent
      ? String((parent as { path: string }).path)
      : ''
    return { path: [base, ...segments].filter(Boolean).join('/') }
  },
  query: (ref: unknown) => ref,
  where: () => ({}),
  limit: () => ({}),
  orderBy: () => ({}),
  startAt: () => ({}),
  endAt: () => ({})
}))

vi.mock('~/composables/useFirebaseTracker', () => ({
  trackedGetDoc: async (ref: { path: string }, caller: string) => {
    mocks.callers.push(caller)
    const data = mocks.docs.get(ref.path)
    return { exists: () => data !== undefined, data: () => data }
  },
  trackedGetDocs: async (_query: unknown, caller: string) => {
    mocks.callers.push(caller)
    const rows = mocks.queryResults.shift() ?? []
    return { docs: rows.map(row => ({ id: row.id, data: () => row.data })) }
  },
  trackedOnSnapshot: (
    _query: unknown,
    caller: string,
    next: (snapshot: unknown) => void,
    onError?: (error: Error) => void
  ) => {
    mocks.callers.push(caller)
    mocks.listeners.set(caller, next)
    if (onError) mocks.listenerErrors.set(caller, onError)
    return () => { mocks.stopped.push(caller) }
  },
  trackedSetDoc: async (ref: { path: string }, data: Record<string, unknown>, caller: string) => {
    mocks.callers.push(caller)
    if (mocks.failWrites) throw new Error(mocks.failWrites)
    mocks.sets.push({ path: ref.path, data })
  },
  trackedUpdateDoc: async (ref: { path: string }, data: Record<string, unknown>, caller: string) => {
    mocks.callers.push(caller)
    if (mocks.failWrites) throw new Error(mocks.failWrites)
    mocks.updates.push({ path: ref.path, data })
  }
}))

import { createPitwallEngineerService } from '~/services/pitwall/pitwallEngineerService'

const ENGINEER = 'ingegnere-1'
const DRIVER = 'pilota-1'
const NOW = () => Date.parse('2026-08-31T10:00:00.000Z')

function build() {
  return createPitwallEngineerService({ db: {} as never, engineerUid: ENGINEER, now: NOW })
}

function grant(engineerUid: string, status: 'pending' | 'granted' | 'revoked') {
  return {
    schemaVersion: 1,
    driverUid: ENGINEER,
    engineerUid,
    status,
    createdAt: '2026-08-31T09:00:00.000Z',
    updatedAt: '2026-08-31T09:00:00.000Z'
  }
}

/** Le letture di profilo dentro un listener sono asincrone: si lasciano finire. */
async function settle() {
  for (let index = 0; index < 20; index += 1) await Promise.resolve()
}

beforeEach(() => {
  mocks.sets = []
  mocks.updates = []
  mocks.callers = []
  mocks.docs = new Map()
  mocks.queryResults = []
  mocks.listeners = new Map()
  mocks.listenerErrors = new Map()
  mocks.stopped = []
  mocks.failWrites = null
})

// Il difetto di UX segnalato: una richiesta arrivava, ma non si vedeva finche'
// non si ricaricava la pagina. Chi la riceve non ha motivo di ricaricare, e la
// funzione sembrava rotta pur funzionando.
describe('le richieste arrivano senza ricaricare la pagina', () => {
  it('consegna subito la richiesta e completa il nome un istante dopo', async () => {
    const service = build()
    const seen: Array<Array<{ engineerUid: string, nickname: string | null, status: string }>> = []
    service.watchIncomingRequests(requests => seen.push(requests))

    mocks.docs.set(`publicProfiles/${DRIVER}`, { nickname: 'RICO117' })
    mocks.listeners.get('pitwall.watchIncomingRequests')?.({
      docs: [{ data: () => grant(DRIVER, 'pending') }]
    })

    // Prima consegna: la richiesta c'e' gia', il nome non ancora.
    expect(seen[0]).toEqual([
      expect.objectContaining({ engineerUid: DRIVER, status: 'pending', nickname: null })
    ])

    await settle()
    expect(seen[seen.length - 1]).toEqual([
      expect.objectContaining({ engineerUid: DRIVER, nickname: 'RICO117' })
    ])
  })

  it('non rilegge lo stesso profilo a ogni aggiornamento', async () => {
    const service = build()
    service.watchIncomingRequests(() => {})
    mocks.docs.set(`publicProfiles/${DRIVER}`, { nickname: 'RICO117' })

    const push = () => mocks.listeners.get('pitwall.watchIncomingRequests')?.({
      docs: [{ data: () => grant(DRIVER, 'pending') }]
    })
    push()
    await settle()
    push()
    await settle()

    const profileReads = mocks.callers.filter(caller => caller === 'pitwall.requesterProfile')
    expect(profileReads).toHaveLength(1)
  })

  it('un profilo illeggibile lascia la richiesta visibile senza nome', async () => {
    const service = build()
    const seen: Array<Array<{ nickname: string | null }>> = []
    service.watchIncomingRequests(requests => seen.push(requests))

    // Nessun documento profilo: il nome manca, la richiesta no.
    mocks.listeners.get('pitwall.watchIncomingRequests')?.({
      docs: [{ data: () => grant('sconosciuto', 'pending') }]
    })
    await settle()

    expect(seen[seen.length - 1]).toHaveLength(1)
    expect(seen[seen.length - 1][0]?.nickname).toBeNull()
  })

  it('un permesso negato diventa un messaggio, non una schermata caduta', () => {
    const service = build()
    const errors: string[] = []
    service.watchIncomingRequests(() => {}, error => errors.push(error.message))

    mocks.listenerErrors.get('pitwall.watchIncomingRequests')?.(new Error('missing permissions'))
    expect(errors).toEqual(['missing permissions'])
  })

  it('smette di ascoltare quando glielo si chiede', () => {
    const service = build()
    const stop = service.watchIncomingRequests(() => {})
    stop()
    expect(mocks.stopped).toContain('pitwall.watchIncomingRequests')
  })
})

// L'altra meta': l'ingegnere che aspetta di essere autorizzato. Chiedergli di
// ricaricare proprio nel momento in cui la funzione diventa utile e' il punto
// peggiore in cui farlo.
describe('essere autorizzati si vede da soli', () => {
  it('annuncia gli uid dei piloti che hanno concesso', () => {
    const service = build()
    const seen: string[][] = []
    service.watchGrantedPilots(uids => seen.push(uids))

    mocks.listeners.get('pitwall.watchGrantedPilots')?.({
      docs: [
        { data: () => ({ ...grant(ENGINEER, 'granted'), driverUid: DRIVER }) },
        { data: () => ({ ...grant(ENGINEER, 'granted'), driverUid: 'pilota-2' }) }
      ]
    })

    expect(seen[0]).toEqual([DRIVER, 'pilota-2'])
  })

  it('riporta un errore invece di restare muto', () => {
    const service = build()
    const errors: string[] = []
    service.watchGrantedPilots(() => {}, error => errors.push(error.message))
    mocks.listenerErrors.get('pitwall.watchGrantedPilots')?.(new Error('permission-denied'))
    expect(errors).toEqual(['permission-denied'])
  })
})

describe('chiedere il collegamento', () => {
  it('crea la richiesta in attesa quando non esiste ancora', async () => {
    const result = await build().requestLink(DRIVER)
    expect(result).toEqual({ ok: true, alreadyGranted: false })
    expect(mocks.sets[0]?.path).toBe(`pitwallGrants/${DRIVER}__${ENGINEER}`)
    expect(mocks.sets[0]?.data).toEqual(expect.objectContaining({ status: 'pending' }))
  })

  it('riconosce di essere gia autorizzato senza riscrivere niente', async () => {
    mocks.docs.set(`pitwallGrants/${DRIVER}__${ENGINEER}`, { ...grant(ENGINEER, 'granted'), driverUid: DRIVER })
    const result = await build().requestLink(DRIVER)
    expect(result).toEqual({ ok: true, alreadyGranted: true })
    expect(mocks.sets).toHaveLength(0)
    expect(mocks.updates).toHaveLength(0)
  })

  it('riporta in attesa un permesso che era stato revocato', async () => {
    mocks.docs.set(`pitwallGrants/${DRIVER}__${ENGINEER}`, { ...grant(ENGINEER, 'revoked'), driverUid: DRIVER })
    const result = await build().requestLink(DRIVER)
    expect(result).toEqual({ ok: true, alreadyGranted: false })
    expect(mocks.updates[0]?.data).toEqual(expect.objectContaining({ status: 'pending' }))
  })

  it('un pilota non valido si rifiuta prima di scrivere', async () => {
    const result = await build().requestLink('')
    expect(result).toEqual({ ok: false, reason: 'Pilota non valido.' })
    expect(mocks.sets).toHaveLength(0)
  })

  it('un rifiuto dei permessi diventa un motivo leggibile', async () => {
    mocks.failWrites = 'Missing or insufficient permissions.'
    const result = await build().requestLink(DRIVER)
    expect(result).toEqual({ ok: false, reason: 'Missing or insufficient permissions.' })
  })
})

describe('decidere e revocare', () => {
  it('il pilota concede scrivendo lo stato sul permesso', async () => {
    const result = await build().decideRequest('ingegnere-2', 'granted')
    expect(result).toEqual({ ok: true })
    expect(mocks.updates[0]?.path).toBe(`pitwallGrants/${ENGINEER}__ingegnere-2`)
    expect(mocks.updates[0]?.data).toEqual(expect.objectContaining({ status: 'granted' }))
  })

  it('ritirarsi da un collegamento e una revoca, non una cancellazione', async () => {
    const result = await build().withdraw(DRIVER)
    expect(result).toEqual({ ok: true })
    expect(mocks.updates[0]?.data).toEqual(expect.objectContaining({ status: 'revoked' }))
  })

  it('pre-autorizzare crea gia un permesso concesso', async () => {
    const result = await build().preAuthorise('ingegnere-2')
    expect(result).toEqual({ ok: true })
    expect(mocks.sets[0]?.data).toEqual(expect.objectContaining({ status: 'granted' }))
  })

  it('una pre-autorizzazione senza destinatario non parte', async () => {
    const result = await build().preAuthorise('')
    expect(result).toEqual({ ok: false, reason: 'Utente non valido.' })
    expect(mocks.sets).toHaveLength(0)
  })

  it('un errore di scrittura diventa un motivo, non un eccezione', async () => {
    mocks.failWrites = 'permission-denied'
    expect(await build().decideRequest('x', 'granted')).toEqual({ ok: false, reason: 'permission-denied' })
    expect(await build().withdraw(DRIVER)).toEqual({ ok: false, reason: 'permission-denied' })
    expect(await build().preAuthorise('ingegnere-2')).toEqual({ ok: false, reason: 'permission-denied' })
  })
})

describe('elenco di chi assisto', () => {
  it('mette il nome del pilota, non il suo identificativo', async () => {
    mocks.queryResults.push([{ id: `${DRIVER}__${ENGINEER}`, data: { ...grant(ENGINEER, 'granted'), driverUid: DRIVER } }])
    mocks.docs.set(`pitwallSessions/${DRIVER}`, {
      schemaVersion: 1,
      driverUid: DRIVER,
      sessionId: 's1',
      online: true,
      updatedAt: new Date(NOW()).toISOString()
    })
    mocks.docs.set(`publicProfiles/${DRIVER}`, { nickname: 'RICO117' })

    const pilots = await build().listLinkedPilots()
    expect(pilots).toHaveLength(1)
    expect(pilots[0]?.nickname).toBe('RICO117')
    expect(pilots[0]?.reachable).toBe(true)
  })

  it('senza profilo mostra l identificativo, che e brutto ma vero', async () => {
    mocks.queryResults.push([{ id: `${DRIVER}__${ENGINEER}`, data: { ...grant(ENGINEER, 'granted'), driverUid: DRIVER } }])
    const pilots = await build().listLinkedPilots()
    expect(pilots[0]?.nickname).toBe(DRIVER)
    expect(pilots[0]?.reachable).toBe(false)
  })

  it('una presenza vecchia non conta come raggiungibile', async () => {
    mocks.queryResults.push([{ id: `${DRIVER}__${ENGINEER}`, data: { ...grant(ENGINEER, 'granted'), driverUid: DRIVER } }])
    mocks.docs.set(`pitwallSessions/${DRIVER}`, {
      schemaVersion: 1,
      driverUid: DRIVER,
      sessionId: 's1',
      online: true,
      updatedAt: '2026-08-31T08:00:00.000Z'
    })
    const pilots = await build().listLinkedPilots()
    expect(pilots[0]?.reachable).toBe(false)
  })

  it('legge la presenza di un pilota su richiesta', async () => {
    mocks.docs.set(`pitwallSessions/${DRIVER}`, {
      schemaVersion: 1,
      driverUid: DRIVER,
      sessionId: 's1',
      online: true,
      updatedAt: new Date(NOW()).toISOString()
    })
    const presence = await build().readPilotPresence(DRIVER)
    expect(presence.reachable).toBe(true)
    expect(presence.session?.driverUid).toBe(DRIVER)
  })
})

describe('cercare una persona per nome', () => {
  it('non interroga il database sotto due lettere', async () => {
    const found = await build().searchUsers('r')
    expect(found).toEqual([])
    expect(mocks.callers).toHaveLength(0)
  })

  it('trova un nome scritto in minuscolo e non restituisce se stessi', async () => {
    mocks.queryResults.push([
      { id: DRIVER, data: { nickname: 'RICO117' } },
      { id: ENGINEER, data: { nickname: 'RICOchet' } }
    ])
    const found = await build().searchUsers('ric')
    expect(found.map(entry => entry.uid)).toEqual([DRIVER])
  })
})

describe('inviare la strategia', () => {
  it('scrive l ordine in attesa sul PC del pilota', async () => {
    const sent = await build().sendOrder({ driverUid: DRIVER, plan: { fuelLiters: 60 }, revision: 42 })
    expect(sent.ok).toBe(true)
    if (!sent.ok) return
    expect(mocks.sets[0]?.path).toBe(`pitwallSessions/${DRIVER}/orders/${sent.orderId}`)
    expect(mocks.sets[0]?.data).toEqual(expect.objectContaining({ status: 'pending', revision: 42 }))
  })

  it('un invio rifiutato non viene spacciato per riuscito', async () => {
    mocks.failWrites = 'permission-denied'
    const sent = await build().sendOrder({ driverUid: DRIVER, plan: { fuelLiters: 60 }, revision: 1 })
    expect(sent.ok).toBe(false)
  })
})
