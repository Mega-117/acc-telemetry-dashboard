// PIP-441: il calendario gare si legge da un sommario (1 lettura) e ogni modifica lo
// riscrive nello stesso batch dell'evento.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

const fake = vi.hoisted(() => ({ getDoc: vi.fn(), getDocs: vi.fn(), setDoc: vi.fn(), batches: [] as any[] }))
const mockCurrentUser = vi.hoisted(() => ({ value: null as { uid: string } | null }))
vi.mock('~/config/firebase', () => ({ db: {} }))
vi.mock('firebase/firestore', () => ({
  doc: (...parts: any[]) => {
    // doc(db, 'users', uid, 'raceCalendar', id) | doc(db, path) | doc(collectionPath) => auto id
    if (parts.length === 1) return { path: `${parts[0]}/auto-id`, id: 'auto-id' }
    const path = parts.slice(1).join('/')
    return { path, id: path.split('/').pop() }
  },
  collection: (_db: unknown, ...parts: string[]) => parts.join('/'),
  query: (value: unknown, ...clauses: any[]) => ({ path: value, clauses }),
  orderBy: (field: string, direction: string) => ({ orderBy: field, direction }),
  startAfter: (cursor: any) => ({ after: cursor.id }),
  limit: (value: number) => ({ limit: value })
}))
vi.mock('~/composables/useFirebaseTracker', () => ({
  trackedGetDoc: fake.getDoc,
  trackedGetDocs: fake.getDocs,
  trackedSetDoc: fake.setDoc,
  trackedWriteBatch: () => {
    const ops: any[] = []
    const batch = {
      set: (ref: any, data: any) => ops.push({ type: 'set', path: ref.path, data }),
      update: (ref: any, data: any) => ops.push({ type: 'update', path: ref.path, data }),
      delete: (ref: any) => ops.push({ type: 'delete', path: ref.path }),
      commit: vi.fn(async () => { fake.batches.push(ops) })
    }
    return batch
  }
}))
vi.mock('~/composables/useFirebaseAuth', () => ({
  useFirebaseAuth: () => ({ currentUser: ref(mockCurrentUser.value) })
}))

import {
  clearRaceCalendarCache,
  createRaceCalendarEvent,
  deleteRaceCalendarEvent,
  loadRaceCalendarEvents,
  loadUpcomingRaceCalendarEvents,
  updateRaceCalendarEvent
} from '~/repositories/raceCalendarRepository'
import { buildRaceCalendarIndexDocument } from '~/services/projections/raceCalendarIndexProjectionService'

let summaries: Map<string, any>
let events: Array<{ id: string; data: any }>

function eventData(startsAt: string, title = 'Gara') {
  return { title, startsAt, trackName: 'Monza', carName: null, simGridUrl: null, raceUrl: null, createdBy: 'u1', createdByRole: 'pilot', createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-22T10:00:00Z'))
  summaries = new Map()
  events = []
  fake.batches.length = 0
  mockCurrentUser.value = { uid: 'u1' }
  fake.getDoc.mockReset().mockImplementation(async (ref: any) => {
    const data = summaries.get(ref.path)
    return { exists: () => data !== undefined, data: () => data }
  })
  fake.getDocs.mockReset().mockImplementation(async (q: any) => {
    const max = q.clauses.find((clause: any) => clause.limit)?.limit ?? Infinity
    const ordered = [...events].sort((a, b) => a.data.startsAt.localeCompare(b.data.startsAt))
    const after = q.clauses.find((clause: any) => clause.after)?.after
    const sorted = ordered.slice(after ? ordered.findIndex(e => e.id === after) + 1 : 0).slice(0, max)
    return { docs: sorted.map((item) => ({ id: item.id, data: () => item.data })) }
  })
  fake.setDoc.mockReset().mockImplementation(async (ref: any, data: any) => { summaries.set(ref.path, data) })
  clearRaceCalendarCache()
})
afterEach(() => vi.useRealTimers())

describe('raceCalendarRepository', () => {
  it('serve il calendario dal sommario con una sola lettura, poi dalla cache', async () => {
    summaries.set('users/u1/raceCalendarIndex/v1', buildRaceCalendarIndexDocument([
      { id: 'b', ...eventData('2026-10-02T00:00:00.000Z') }, { id: 'a', ...eventData('2026-10-01T00:00:00.000Z') }
    ]))
    const loaded = await loadRaceCalendarEvents('u1', 25)
    expect(loaded.map((item) => item.id)).toEqual(['a', 'b'])
    expect(loaded[0]).toMatchObject({ title: 'Gara', trackName: 'Monza', carName: '', createdByRole: 'pilot' })
    expect(fake.getDoc).toHaveBeenCalledTimes(1)
    expect(fake.getDocs).not.toHaveBeenCalled()
    expect(await loadRaceCalendarEvents('u1', 25)).toBe(loaded)
    // Un altro maxItems riusa il sommario gia' letto (0 letture).
    expect(await loadRaceCalendarEvents('u1', 1)).toHaveLength(1)
    expect(fake.getDoc).toHaveBeenCalledTimes(1)
  })

  it('sommario assente: query come prima e l\'owner scrive il sommario una volta', async () => {
    events = [{ id: 'a', data: eventData('2026-10-01T00:00:00.000Z') }, { id: 'b', data: eventData('2026-10-02T00:00:00.000Z') }]
    const loaded = await loadRaceCalendarEvents('u1', 25)
    expect(loaded.map((item) => item.id)).toEqual(['a', 'b'])
    expect(fake.getDocs).toHaveBeenCalledTimes(1)
    expect(fake.setDoc).toHaveBeenCalledTimes(1)
    const written = summaries.get('users/u1/raceCalendarIndex/v1')
    expect(written).toMatchObject({ version: 1, truncated: false })
    expect(written.events.map((item: any) => item.id)).toEqual(['a', 'b'])
    // Prossimo avvio: una lettura del sommario, nessuna query.
    clearRaceCalendarCache('u1')
    await loadRaceCalendarEvents('u1', 25)
    expect(fake.getDocs).toHaveBeenCalledTimes(1)
    expect(fake.getDoc).toHaveBeenCalledTimes(2)
  })

  it('sommario assente per un non-owner (coach): query e nessuna scrittura', async () => {
    mockCurrentUser.value = { uid: 'coach' }
    events = [{ id: 'a', data: eventData('2026-10-01T00:00:00.000Z') }]
    expect(await loadRaceCalendarEvents('u1', 8)).toHaveLength(1)
    expect(fake.setDoc).not.toHaveBeenCalled()
    expect(fake.getDocs.mock.calls[0]![0].clauses).toContainEqual({ limit: 8 })
  })

  it('sommario non leggibile (rules non pubblicate, offline): query come prima, senza errore', async () => {
    mockCurrentUser.value = { uid: 'coach' }
    events = [{ id: 'a', data: eventData('2026-10-01T00:00:00.000Z') }]
    fake.getDoc.mockRejectedValue(new Error('permission-denied'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect((await loadRaceCalendarEvents('u1', 25)).map((item) => item.id)).toEqual(['a'])
    expect(fake.getDocs).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })

  it('sommario con versione vecchia o troncato oltre maxItems: fallback alla query', async () => {
    summaries.set('users/u1/raceCalendarIndex/v1', { version: 99, updatedAt: 'x', events: [], truncated: false })
    events = [{ id: 'a', data: eventData('2026-10-01T00:00:00.000Z') }]
    expect(await loadRaceCalendarEvents('u1', 25)).toHaveLength(1)
    expect(fake.getDocs).toHaveBeenCalledTimes(1)
    clearRaceCalendarCache()
    summaries.set('users/u1/raceCalendarIndex/v1', { ...buildRaceCalendarIndexDocument([{ id: 'a', ...eventData('2026-10-01T00:00:00.000Z') }]), truncated: true })
    expect(await loadRaceCalendarEvents('u1', 25)).toHaveLength(1)
    expect(fake.getDocs).toHaveBeenCalledTimes(2)
  })

  it('create/update/delete scrivono evento e sommario nello stesso batch, senza letture extra', async () => {
    summaries.set('users/u1/raceCalendarIndex/v1', buildRaceCalendarIndexDocument([{ id: 'a', ...eventData('2026-10-01T00:00:00.000Z') }]))
    await loadRaceCalendarEvents('u1', 25)
    fake.getDoc.mockClear()

    const created = await createRaceCalendarEvent('u1', { title: '  Sprint ', startsAt: '2026-09-30T00:00:00.000Z', trackName: 'Spa', createdBy: 'u1', createdByRole: 'pilot' })
    expect(created.id).toBe('auto-id')
    expect(fake.getDoc).not.toHaveBeenCalled()
    expect(fake.getDocs).not.toHaveBeenCalled()
    expect(fake.batches[0].map((op: any) => [op.type, op.path])).toEqual([
      ['set', 'users/u1/raceCalendar/auto-id'], ['set', 'users/u1/raceCalendarIndex/v1']
    ])
    expect(fake.batches[0][0].data).toMatchObject({ title: 'Sprint', trackName: 'Spa', carName: null, createdAt: '2026-09-22T10:00:00.000Z' })
    expect(fake.batches[0][1].data.events.map((item: any) => item.id)).toEqual(['auto-id', 'a'])
    expect(fake.batches[0][1].data.events[0]).toMatchObject({ title: 'Sprint', carName: '', createdByRole: 'pilot' })
    // La cache serve la lista aggiornata senza letture.
    expect((await loadRaceCalendarEvents('u1', 25)).map((item) => item.id)).toEqual(['auto-id', 'a'])
    expect(fake.getDoc).not.toHaveBeenCalled()

    await updateRaceCalendarEvent('u1', 'a', { title: 'Endurance', startsAt: '2026-09-29T00:00:00.000Z', trackName: 'Monza', carName: 'Ferrari' })
    expect(fake.batches[1].map((op: any) => [op.type, op.path])).toEqual([
      ['update', 'users/u1/raceCalendar/a'], ['set', 'users/u1/raceCalendarIndex/v1']
    ])
    expect(fake.batches[1][1].data.events.map((item: any) => item.id)).toEqual(['a', 'auto-id'])
    expect(fake.batches[1][1].data.events[0]).toMatchObject({ title: 'Endurance', carName: 'Ferrari', createdBy: 'u1', createdAt: '2026-09-01T00:00:00.000Z' })

    await deleteRaceCalendarEvent('u1', 'auto-id')
    expect(fake.batches[2].map((op: any) => [op.type, op.path])).toEqual([
      ['delete', 'users/u1/raceCalendar/auto-id'], ['set', 'users/u1/raceCalendarIndex/v1']
    ])
    expect(fake.batches[2][1].data.events.map((item: any) => item.id)).toEqual(['a'])
    expect(fake.getDoc).not.toHaveBeenCalled()
    expect(fake.getDocs).not.toHaveBeenCalled()
  })

  it('senza sommario noto una modifica lo legge (1 lettura) e, se non basta, riparte dalla collection', async () => {
    summaries.set('users/u1/raceCalendarIndex/v1', buildRaceCalendarIndexDocument([{ id: 'a', ...eventData('2026-10-01T00:00:00.000Z') }]))
    await deleteRaceCalendarEvent('u1', 'a')
    expect(fake.getDoc).toHaveBeenCalledTimes(1)
    expect(fake.getDocs).not.toHaveBeenCalled()
    expect(fake.batches[0][1].data.events).toEqual([])

    clearRaceCalendarCache()
    summaries.delete('users/u1/raceCalendarIndex/v1')
    events = Array.from({ length: 27 }, (_, index) => ({ id: `e${index}`, data: eventData(`2026-11-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`) }))
    await createRaceCalendarEvent('u1', { title: 'Nuova', startsAt: '2026-10-01T00:00:00.000Z', trackName: 'Spa' })
    expect(fake.getDocs).toHaveBeenCalledTimes(1)
    const summary = fake.batches[1][1].data
    expect(summary.truncated).toBe(true)
    expect(summary.events).toHaveLength(25)
    expect(summary.events[0].id).toBe('auto-id')
  })
})


it('keeps legacy ACC and explicit EVO separate using a complete index', async () => {
 summaries.set('users/u1/raceCalendarIndex/v1', buildRaceCalendarIndexDocument([
  {id:'old', ...eventData('2099-01-01')}, {id:'evo', ...eventData('2099-01-02'), gameId:'evo'}
 ]))
 expect((await loadUpcomingRaceCalendarEvents('u1','evo')).map(e=>e.id)).toEqual(['evo'])
 expect((await loadUpcomingRaceCalendarEvents('u1','acc')).map(e=>e.id)).toEqual(['old'])
 expect(fake.getDocs).not.toHaveBeenCalled()
})
it('finds EVO beyond a truncated mixed index without writing a migration', async () => {
 events=Array.from({length:101},(_,i)=>({id:`e${i}`,data:{...eventData('2099-01-01'),gameId:i===100?'evo':'acc'}}))
 summaries.set('users/u1/raceCalendarIndex/v1',buildRaceCalendarIndexDocument(events.map(e=>({id:e.id,...e.data}))))
 expect((await loadUpcomingRaceCalendarEvents('u1','evo')).map(e=>e.id)).toEqual(['e100'])
 expect(fake.getDocs).toHaveBeenCalledTimes(2)
 expect(fake.setDoc).not.toHaveBeenCalled()
})
it('writes EVO identity in event and index, and preserves it on legacy edits', async () => {
 const data={...eventData('2099-01-01'),gameId:'evo',createdByRole:'pilot' as const}
 summaries.set('users/u1/raceCalendarIndex/v1',buildRaceCalendarIndexDocument([]))
 await createRaceCalendarEvent('u1',data)
 expect(fake.batches[0][0].data.gameId).toBe('evo')
 expect(fake.batches[0][1].data.events[0].gameId).toBe('evo')
 const {gameId,...patch}=data
 await updateRaceCalendarEvent('u1','auto-id',{...patch,title:'changed'})
 expect(fake.batches[1][0].data).not.toHaveProperty('gameId')
 expect(fake.batches[1][1].data.events[0].gameId).toBe(gameId)
})
