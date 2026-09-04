// Le gare in diretta (PIP-360): un invito arrivato mentre si guarda altrove
// compare da solo. Sono le stesse due query di `listRooms`, ascoltate.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  callers: [] as string[],
  listeners: new Map<string, (snapshot: unknown) => void>(),
  errors: new Map<string, (error: Error) => void>(),
  stopped: [] as string[],
  wheres: [] as string[],
  orderBys: [] as string[],
  /** Documenti letti per path: cio' che `trackedGetDoc` trova. */
  docs: new Map<string, Record<string, unknown>>(),
  sets: [] as { path: string, data: Record<string, unknown> }[],
  updates: [] as { path: string, data: Record<string, unknown> }[],
}))

vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, ...segments: string[]) => ({ path: segments.join('/') }),
  doc: (parent: unknown, ...segments: string[]) => ({ path: segments.join('/'), parent }),
  query: (ref: unknown) => ref,
  where: (field: string) => { mocks.wheres.push(field); return {} },
  orderBy: (field: string) => { mocks.orderBys.push(field); return {} },
  limit: () => ({}),
  serverTimestamp: () => ({}),
}))

vi.mock('~/composables/useFirebaseTracker', () => ({
  trackedGetDoc: async (ref: { path: string }) => {
    const data = mocks.docs.get(ref.path)
    return { exists: () => data != null, data: () => data }
  },
  trackedGetDocs: async () => ({ docs: [] }),
  trackedOnDocSnapshot: () => () => {},
  trackedOnSnapshot: (
    _query: unknown,
    caller: string,
    next: (snapshot: unknown) => void,
    onError?: (error: Error) => void
  ) => {
    mocks.callers.push(caller)
    mocks.listeners.set(caller, next)
    if (onError) mocks.errors.set(caller, onError)
    return () => { mocks.stopped.push(caller) }
  },
  trackedRunTransaction: async () => {},
  trackedSetDoc: async (ref: { path: string }, data: Record<string, unknown>) => { mocks.sets.push({ path: ref.path, data }) },
  trackedUpdateDoc: async (ref: { path: string }, data: Record<string, unknown>) => { mocks.updates.push({ path: ref.path, data }) },
  trackedDeleteDoc: async () => {},
}))

import { createPitwallRoomService } from '~/services/pitwall/pitwallRoomService'

function snapshotOf(rows: Array<{ id: string, createdAt: string }>) {
  return { docs: rows.map(row => ({ id: row.id, data: () => ({ roomId: row.id, createdAt: row.createdAt }) })) }
}

beforeEach(() => {
  mocks.callers = []
  mocks.listeners = new Map()
  mocks.errors = new Map()
  mocks.stopped = []
  mocks.wheres = []
  mocks.orderBys = []
  mocks.docs = new Map()
  mocks.sets = []
  mocks.updates = []
})

describe('ensureRoomForVehicle: il puntatore della vettura', () => {
  const NOW = Date.parse('2026-09-04T10:00:00.000Z')
  const FP = 'impronta-1'

  function pointer(roomId: string) {
    mocks.docs.set(`pitwallVehicles/${FP}`, { fingerprint: FP, roomId, createdBy: 'me', expiresAtMs: NOW + 60_000 })
  }

  function storedRoom(roomId: string, overrides: Record<string, unknown> = {}) {
    mocks.docs.set(`pitwallRooms/${roomId}`, {
      schemaVersion: 2, roomId, label: '#1', hostUid: 'me', managerUids: ['me'], memberUids: ['me'], allowedUids: [],
      vehicleFingerprint: FP, createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z', ...overrides,
    })
  }

  it('una gara aperta a cui appartengo si ritrova, senza scrivere niente', async () => {
    pointer('vecchia')
    storedRoom('vecchia')
    const service = createPitwallRoomService({ db: {} as never, uid: 'me', now: () => NOW, newRoomId: () => 'nuova' })
    const result = await service.ensureRoomForVehicle({ fingerprint: FP, label: '#1' })
    expect(result.ok && result.value.roomId).toBe('vecchia')
    expect(mocks.sets).toEqual([])
  })

  it('una gara chiusa e memoria, non una porta: si conia una stanza nuova e il puntatore si riscrive', async () => {
    // Chi riapre il Pitwall dopo averlo chiuso vuole una gara nuova: rientrare
    // in quella archiviata la farebbe sembrare viva a chi la guarda da fuori.
    pointer('chiusa')
    storedRoom('chiusa', { closedAt: '2026-09-03T00:00:00.000Z' })
    const service = createPitwallRoomService({ db: {} as never, uid: 'me', now: () => NOW, newRoomId: () => 'nuova' })
    const result = await service.ensureRoomForVehicle({ fingerprint: FP, label: '#1', seedAllowedUids: ['popo', 'me'] })
    expect(result.ok && result.value.roomId).toBe('nuova')
    expect(mocks.sets.map(set => set.path)).toEqual(['pitwallRooms/nuova', `pitwallVehicles/${FP}`])
    expect(mocks.sets[0]!.data).toMatchObject({ hostUid: 'me', memberUids: ['me'], managerUids: ['me'], allowedUids: ['popo'] })
    expect(mocks.sets[1]!.data).toMatchObject({ roomId: 'nuova', createdBy: 'me' })
  })
})

describe('watchRooms', () => {
  it('ascolta le stanze in cui sono e quelle a cui sono invitato, e le fonde in un elenco solo', () => {
    const service = createPitwallRoomService({ db: {} as never, uid: 'me' })
    const seen: string[][] = []
    const stop = service.watchRooms(rooms => seen.push(rooms.map(room => room.roomId)))

    expect(mocks.callers).toEqual(['pitwallRoom.watchJoined', 'pitwallRoom.watchInvited'])
    expect(mocks.wheres).toEqual(['memberUids', 'allowedUids'])

    mocks.listeners.get('pitwallRoom.watchJoined')!(snapshotOf([{ id: 'a', createdAt: '2026-09-01T00:00:00.000Z' }]))
    expect(seen.at(-1)).toEqual(['a'])

    // La stessa stanza sta in entrambe le query (chi entra resta invitato): una riga sola,
    // e la piu' recente per prima.
    mocks.listeners.get('pitwallRoom.watchInvited')!(snapshotOf([
      { id: 'a', createdAt: '2026-09-01T00:00:00.000Z' },
      { id: 'b', createdAt: '2026-09-02T00:00:00.000Z' },
    ]))
    expect(seen.at(-1)).toEqual(['b', 'a'])

    // Un invito ritirato sparisce alla lettura successiva, senza ricaricare.
    mocks.listeners.get('pitwallRoom.watchInvited')!(snapshotOf([{ id: 'a', createdAt: '2026-09-01T00:00:00.000Z' }]))
    expect(seen.at(-1)).toEqual(['a'])

    stop()
    expect(mocks.stopped).toEqual(['pitwallRoom.watchJoined', 'pitwallRoom.watchInvited'])
  })

  it('chiede le gare dalla piu recente, perche il tetto taglia prima di ordinare', () => {
    const service = createPitwallRoomService({ db: {} as never, uid: 'me' })
    service.watchRooms(() => {})
    // Senza ordine nella query, trenta gare su trentacinque le sceglieva
    // Firestore per id - che qui e' casuale - e le piu' recenti potevano non
    // esserci. Un ordine per verso, non uno solo.
    expect(mocks.orderBys).toEqual(['createdAt', 'createdAt'])
  })

  it('senza l indice composito si riattacca senza ordine, invece di lasciare la pagina senza gare', () => {
    const service = createPitwallRoomService({ db: {} as never, uid: 'me' })
    const failures: string[] = []
    const seen: string[][] = []
    service.watchRooms(rooms => seen.push(rooms.map(room => room.roomId)), error => failures.push(error.message))

    mocks.errors.get('pitwallRoom.watchInvited')!(new Error('The query requires an index'))

    // L'ascolto ordinato viene chiuso e rifatto senza ordine: nessun errore
    // mostrato, perche' c'era ancora un piano B.
    expect(mocks.stopped).toEqual(['pitwallRoom.watchInvited'])
    expect(failures).toEqual([])
    expect(mocks.orderBys).toEqual(['createdAt', 'createdAt'])

    // E le gare continuano ad arrivare.
    mocks.listeners.get('pitwallRoom.watchInvited')!(snapshotOf([{ id: 'a', createdAt: '2026-09-01T00:00:00.000Z' }]))
    expect(seen.at(-1)).toEqual(['a'])
  })

  it('quando non c e piu un piano B, l errore arriva a chi guarda senza fermare l altro ascolto', () => {
    const service = createPitwallRoomService({ db: {} as never, uid: 'me' })
    const failures: string[] = []
    service.watchRooms(() => {}, error => failures.push(error.message))

    // Il primo errore fa ripiegare sulla query senza ordine; il secondo non ha
    // piu' niente da provare e va detto.
    mocks.errors.get('pitwallRoom.watchInvited')!(new Error('permission-denied'))
    mocks.errors.get('pitwallRoom.watchInvited')!(new Error('permission-denied'))

    expect(failures).toEqual(['permission-denied'])
    expect(mocks.stopped).toEqual(['pitwallRoom.watchInvited'])
  })
})
