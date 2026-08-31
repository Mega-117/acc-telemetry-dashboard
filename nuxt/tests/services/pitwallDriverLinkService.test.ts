import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  updates: [] as Array<{ path: string, data: Record<string, unknown> }>,
  sets: [] as Array<{ path: string, data: Record<string, unknown> }>,
  grant: null as unknown,
  orderListener: null as null | ((snapshot: unknown) => void),
  submitted: [] as unknown[],
  submitResult: { accepted: true, status: 'applied', reason: null, fields: {} } as Record<string, unknown>,
  accReady: true as boolean,
  statusCalls: 0
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
  where: () => ({})
}))

// Il servizio passa dal tracker dei costi Firebase, non da firebase/firestore
// diretto: il mock deve seguire la stessa strada, altrimenti proverebbe una
// via che in produzione non esiste.
vi.mock('~/composables/useFirebaseTracker', () => ({
  trackedGetDoc: async () => ({
    exists: () => mocks.grant !== null,
    data: () => mocks.grant
  }),
  trackedOnSnapshot: (_q: unknown, _caller: string, next: (snapshot: unknown) => void) => {
    mocks.orderListener = next
    return () => { mocks.orderListener = null }
  },
  trackedSetDoc: async (ref: { path: string }, data: Record<string, unknown>) => {
    mocks.sets.push({ path: ref.path, data })
  },
  trackedUpdateDoc: async (ref: { path: string }, data: Record<string, unknown>) => {
    mocks.updates.push({ path: ref.path, data })
  }
}))

import { startPitwallDriverLink } from '~/services/pitwall/pitwallDriverLinkService'

const DRIVER = 'pilota-1'
const ENGINEER = 'ingegnere-1'

function orderSnapshot(orders: Array<{ id: string, status?: string, revision?: number }>) {
  return {
    docChanges: () => orders.map(order => ({
      type: 'added' as const,
      doc: {
        id: order.id,
        data: () => ({
          schemaVersion: 1,
          orderId: order.id,
          revision: order.revision ?? 1,
          senderId: ENGINEER,
          issuedAt: '2026-08-30T15:00:00.000Z',
          status: order.status ?? 'pending',
          plan: { fuelLiters: 60 }
        })
      }
    }))
  }
}

// Ogni consegna fa piu' salti asincroni: chiedere se e il momento, scrivere
// lo stato, leggere il permesso, applicare, scrivere l esito. Il conteggio
// copre due ordini in coda con margine.
async function settle() {
  for (let index = 0; index < 60; index += 1) await Promise.resolve()
}

function start() {
  return startPitwallDriverLink({
    db: {} as never,
    driverUid: DRIVER,
    sessionId: 's-1',
    electronApi: {
      pitwallSubmitRemoteOrder: async (payload) => {
        mocks.submitted.push(payload)
        return mocks.submitResult as never
      },
      pitwallGetLinkStatus: async () => {
        mocks.statusCalls += 1
        return {
          trustedSender: true,
          driverUid: DRIVER,
          applying: false,
          accReady: mocks.accReady,
          accReason: mocks.accReady ? null : 'Auto non ancora ferma ai box.'
        }
      }
    },
    now: () => Date.parse('2026-08-30T15:00:00.000Z'),
    log: { warn: () => {}, error: () => {} }
  })
}

beforeEach(() => {
  mocks.updates = []
  mocks.sets = []
  mocks.submitted = []
  mocks.orderListener = null
  mocks.grant = { driverUid: DRIVER, engineerUid: ENGINEER, status: 'granted' }
  mocks.submitResult = { accepted: true, status: 'applied', reason: null, fields: {} }
  mocks.accReady = true
  mocks.statusCalls = 0
  vi.useFakeTimers()
})

describe('lato pilota del collegamento', () => {
  it('annuncia la presenza appena parte, cosi l ingegnere lo trova', async () => {
    const handle = start()
    await settle()
    const presence = mocks.sets.find(entry => entry.path === `pitwallSessions/${DRIVER}`)
    expect(presence?.data).toMatchObject({ driverUid: DRIVER, online: true, sessionId: 's-1' })
    handle.stop()
  })

  it('allega alla presenza equipaggio e fotografia strategia veri, nella stessa scrittura', async () => {
    const handle = startPitwallDriverLink({
      db: {} as never,
      driverUid: DRIVER,
      sessionId: 's-1',
      electronApi: {},
      now: () => Date.parse('2026-08-30T15:00:00.000Z'),
      log: { warn: () => {}, error: () => {} },
      readCarContext: async () => ({
        car: 'ferrari_296_gt3',
        track: 'nurburgring',
        crew: [
          { driverIndex: 0, name: 'Enrico Rossi', current: false },
          { driverIndex: 1, name: 'Marco Bianchi', current: true },
        ],
        strategy: { fuelToAdd: 42, tyreSet: 3, pressures: { FL: 24.4, FR: 26.1, RL: 24.8, RR: 25.9 }, compound: 'wet' },
      }),
    })
    await settle()
    const presence = mocks.sets.find(entry => entry.path === `pitwallSessions/${DRIVER}`)
    expect(presence?.data).toMatchObject({
      car: 'ferrari_296_gt3',
      crew: [
        { driverIndex: 0, name: 'Enrico Rossi', current: false },
        { driverIndex: 1, name: 'Marco Bianchi', current: true },
      ],
      strategy: { fuelToAdd: 42, tyreSet: 3, compound: 'wet' },
    })
    // Una sola scrittura: la fotografia viaggia dentro il battito esistente.
    expect(mocks.sets.filter(entry => entry.path === `pitwallSessions/${DRIVER}`)).toHaveLength(1)
    handle.stop()
  })

  it('se la fotografia non e leggibile pubblica la sola presenza, senza inventare', async () => {
    const handle = startPitwallDriverLink({
      db: {} as never,
      driverUid: DRIVER,
      sessionId: 's-1',
      electronApi: {},
      now: () => Date.parse('2026-08-30T15:00:00.000Z'),
      log: { warn: () => {}, error: () => {} },
      readCarContext: async () => { throw new Error('ACC spento') },
    })
    await settle()
    const presence = mocks.sets.find(entry => entry.path === `pitwallSessions/${DRIVER}`)
    expect(presence?.data).toMatchObject({ online: true })
    expect(presence?.data).not.toHaveProperty('crew')
    expect(presence?.data).not.toHaveProperty('strategy')
    handle.stop()
  })

  it('consegna un ordine a Electron e ne riscrive l esito', async () => {
    const handle = start()
    await settle()
    mocks.orderListener?.(orderSnapshot([{ id: 'ordine-1' }]))
    await settle()

    expect(mocks.submitted).toHaveLength(1)
    const applied = mocks.updates.filter(entry => entry.path.endsWith('orders/ordine-1'))
    // Prima dichiara che ci sta lavorando, poi scrive l'esito: l'ingegnere
    // vede qualcosa muoversi invece di restare su "inviato".
    expect(applied[0]?.data).toMatchObject({ status: 'applying' })
    expect(applied[1]?.data).toMatchObject({ status: 'applied' })
    handle.stop()
  })

  it('rilegge il permesso a ogni ordine e lo passa a Electron', async () => {
    const handle = start()
    await settle()
    mocks.orderListener?.(orderSnapshot([{ id: 'ordine-1' }]))
    await settle()

    expect(mocks.submitted[0]).toMatchObject({
      grant: { driverUid: DRIVER, engineerUid: ENGINEER, status: 'granted' }
    })
    handle.stop()
  })

  it('non riapplica lo stesso ordine quando Firestore lo riconsegna', async () => {
    const handle = start()
    await settle()
    mocks.orderListener?.(orderSnapshot([{ id: 'ordine-1' }]))
    await settle()
    // Riconnessione: lo stesso documento torna indietro.
    mocks.orderListener?.(orderSnapshot([{ id: 'ordine-1' }]))
    await settle()

    expect(mocks.submitted).toHaveLength(1)
    handle.stop()
  })

  it('ignora un ordine gia concluso invece di rifarlo', async () => {
    const handle = start()
    await settle()
    mocks.orderListener?.(orderSnapshot([{ id: 'ordine-vecchio', status: 'applied' }]))
    await settle()

    expect(mocks.submitted).toHaveLength(0)
    handle.stop()
  })

  it('consegna un ordine alla volta, anche se ne arrivano due insieme', async () => {
    const handle = start()
    await settle()
    mocks.orderListener?.(orderSnapshot([{ id: 'a' }, { id: 'b', revision: 2 }]))
    await settle()

    expect(mocks.submitted).toHaveLength(2)
    // In coda, non in parallelo: il primo esito e' scritto prima che parta il secondo.
    const orderOfWrites = mocks.updates.map(entry => `${entry.path.split('/').pop()}:${entry.data.status}`)
    expect(orderOfWrites).toEqual(['a:applying', 'a:applied', 'b:applying', 'b:applied'])
    handle.stop()
  })

  it('un rifiuto di Electron viene scritto come esito, non nascosto', async () => {
    mocks.submitResult = { accepted: false, status: 'rejected', reason: 'Collegamento non autorizzato.', fields: {} }
    const handle = start()
    await settle()
    mocks.orderListener?.(orderSnapshot([{ id: 'ordine-1' }]))
    await settle()

    const last = mocks.updates.filter(entry => entry.path.endsWith('orders/ordine-1')).pop()
    expect(last?.data).toMatchObject({ status: 'rejected' })
    expect((last?.data.result as { reason: string }).reason).toMatch(/non autorizzato/i)
    handle.stop()
  })

  it('se il ponte Electron manca, lo dichiara invece di lasciare l ordine appeso', async () => {
    const handle = startPitwallDriverLink({
      db: {} as never,
      driverUid: DRIVER,
      sessionId: 's-1',
      electronApi: {},
      now: () => Date.now(),
      log: { warn: () => {}, error: () => {} }
    })
    await settle()
    mocks.orderListener?.(orderSnapshot([{ id: 'ordine-1' }]))
    await settle()

    const last = mocks.updates.filter(entry => entry.path.endsWith('orders/ordine-1')).pop()
    expect(last?.data).toMatchObject({ status: 'rejected' })
    handle.stop()
  })

  it('fermandosi dichiara il pilota non piu raggiungibile', async () => {
    const handle = start()
    await settle()
    mocks.sets = []
    await handle.goOffline()
    expect(mocks.sets[0]?.data).toMatchObject({ online: false })
    handle.stop()
  })

  it('dopo lo stop non consegna piu niente', async () => {
    const handle = start()
    await settle()
    const listener = mocks.orderListener
    handle.stop()
    listener?.(orderSnapshot([{ id: 'ordine-tardivo' }]))
    await settle()
    expect(mocks.submitted).toHaveLength(0)
  })
})

// Segnalato da un utente reale: mentre un ordine aspettava, ogni tentativo
// sospendeva gli overlay e portava ACC in primo piano, rendendo il PC
// inutilizzabile. Aspettare deve essere silenzioso.
describe('un ordine che aspetta non disturba il pilota', () => {
  it('non consegna nulla a Electron finche ACC non e pronto', async () => {
    mocks.accReady = false
    const handle = start()
    await settle()
    mocks.orderListener?.(orderSnapshot([{ id: 'ordine-1' }]))
    await settle()

    // Ha solo chiesto se era il momento: nessun ordine consegnato, nessuno
    // stato scritto, quindi niente overlay sospesi e niente focus rubato.
    expect(mocks.statusCalls).toBeGreaterThan(0)
    expect(mocks.submitted).toHaveLength(0)
    expect(mocks.updates.filter(entry => entry.path.endsWith('orders/ordine-1'))).toHaveLength(0)
    handle.stop()
  })

  it('consegna appena ACC diventa pronto, senza che l ordine sia andato perso', async () => {
    mocks.accReady = false
    const handle = start()
    await settle()
    mocks.orderListener?.(orderSnapshot([{ id: 'ordine-1' }]))
    await settle()
    expect(mocks.submitted).toHaveLength(0)

    // Il pilota rientra ai box.
    mocks.accReady = true
    mocks.orderListener?.(orderSnapshot([{ id: 'ordine-1' }]))
    await settle()

    expect(mocks.submitted).toHaveLength(1)
    const last = mocks.updates.filter(entry => entry.path.endsWith('orders/ordine-1')).pop()
    expect(last?.data).toMatchObject({ status: 'applied' })
    handle.stop()
  })
})
