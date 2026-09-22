// PIP-441: builder puro del sommario calendario `users/{uid}/raceCalendarIndex/v1`.
import { describe, expect, it } from 'vitest'
import {
  RACE_CALENDAR_INDEX_MAX_EVENTS,
  RACE_CALENDAR_INDEX_SCHEMA_VERSION,
  applyRaceCalendarIndexMutation,
  buildRaceCalendarIndexDocument,
  canServeRaceCalendarFromIndex,
  isRaceCalendarIndexUsable,
  normalizeRaceCalendarIndexEvent,
  raceCalendarIndexPath
} from '~/services/projections/raceCalendarIndexProjectionService'

function event(id: string, startsAt: string, extra: Record<string, unknown> = {}) {
  return { id, title: `Gara ${id}`, startsAt, trackName: 'Monza', carName: null, createdBy: 'u1', createdByRole: 'pilot', createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z', ...extra }
}

describe('raceCalendarIndexProjectionService', () => {
  it('normalizza gli eventi come il lettore della collection (null -> stringa vuota)', () => {
    expect(normalizeRaceCalendarIndexEvent('e1', { title: 'Sprint', startsAt: '2026-10-01T18:00:00.000Z', carName: null })).toEqual({
      id: 'e1', title: 'Sprint', startsAt: '2026-10-01T18:00:00.000Z', trackName: '', carName: '', simGridUrl: '', raceUrl: '',
      createdBy: '', createdByRole: '', createdAt: '', updatedAt: ''
    })
    expect(raceCalendarIndexPath('u1')).toBe('users/u1/raceCalendarIndex/v1')
  })

  it('ordina per data di inizio, taglia a 25 e segnala il troncamento', () => {
    const events = Array.from({ length: 30 }, (_, index) => event(`e${index}`, `2026-10-${String(30 - index).padStart(2, '0')}T18:00:00.000Z`))
    const doc = buildRaceCalendarIndexDocument(events, { updatedAt: '2026-09-22T10:00:00.000Z' })
    expect(doc).toMatchObject({ version: RACE_CALENDAR_INDEX_SCHEMA_VERSION, updatedAt: '2026-09-22T10:00:00.000Z', truncated: true })
    expect(doc.events).toHaveLength(RACE_CALENDAR_INDEX_MAX_EVENTS)
    expect(doc.events[0]!.id).toBe('e29')
    expect(doc.events.map((item) => item.startsAt)).toEqual([...doc.events.map((item) => item.startsAt)].sort())
    const small = buildRaceCalendarIndexDocument([event('b', '2026-10-02T00:00:00.000Z'), event('a', '2026-10-01T00:00:00.000Z')])
    expect(small.truncated).toBe(false)
    expect(small.events.map((item) => item.id)).toEqual(['a', 'b'])
    expect(buildRaceCalendarIndexDocument([event('a', '2026-10-01T00:00:00.000Z')], { knownComplete: false }).truncated).toBe(true)
  })

  it('applica create, update e delete a un sommario completo rispettando l\'ordine', () => {
    const base = buildRaceCalendarIndexDocument([event('a', '2026-10-01T00:00:00.000Z'), event('c', '2026-10-03T00:00:00.000Z')])
    const created = applyRaceCalendarIndexMutation(base, { type: 'create', event: event('b', '2026-10-02T00:00:00.000Z') }, '2026-09-22T10:00:00.000Z')!
    expect(created.events.map((item) => item.id)).toEqual(['a', 'b', 'c'])
    expect(created.updatedAt).toBe('2026-09-22T10:00:00.000Z')
    const updated = applyRaceCalendarIndexMutation(created, { type: 'update', eventId: 'a', patch: { startsAt: '2026-10-04T00:00:00.000Z', title: 'Endurance' } })!
    expect(updated.events.map((item) => item.id)).toEqual(['b', 'c', 'a'])
    expect(updated.events[2]).toMatchObject({ title: 'Endurance', createdBy: 'u1', createdAt: '2026-09-01T00:00:00.000Z' })
    const deleted = applyRaceCalendarIndexMutation(updated, { type: 'delete', eventId: 'c' })!
    expect(deleted.events.map((item) => item.id)).toEqual(['b', 'a'])
    expect(deleted.truncated).toBe(false)
  })

  it('rifiuta di mutare un sommario troncato, assente o senza l\'evento da aggiornare', () => {
    const truncated = { ...buildRaceCalendarIndexDocument([event('a', '2026-10-01T00:00:00.000Z')]), truncated: true }
    expect(applyRaceCalendarIndexMutation(truncated, { type: 'delete', eventId: 'a' })).toBeNull()
    expect(applyRaceCalendarIndexMutation(null, { type: 'create', event: event('a', '2026-10-01T00:00:00.000Z') })).toBeNull()
    const base = buildRaceCalendarIndexDocument([event('a', '2026-10-01T00:00:00.000Z')])
    expect(applyRaceCalendarIndexMutation(base, { type: 'update', eventId: 'missing', patch: { title: 'x' } })).toBeNull()
  })

  it('un sommario serve maxItems voci solo se non e\' troncato o ne conserva abbastanza', () => {
    const complete = buildRaceCalendarIndexDocument([event('a', '2026-10-01T00:00:00.000Z')])
    expect(canServeRaceCalendarFromIndex(complete, 25)).toBe(true)
    const truncated = { ...complete, events: Array.from({ length: 25 }, (_, index) => normalizeRaceCalendarIndexEvent(`e${index}`, {})), truncated: true }
    expect(canServeRaceCalendarFromIndex(truncated, 8)).toBe(true)
    expect(canServeRaceCalendarFromIndex(truncated, 26)).toBe(false)
    expect(isRaceCalendarIndexUsable(complete)).toBe(true)
    expect(isRaceCalendarIndexUsable({ ...complete, version: 2 })).toBe(false)
    expect(isRaceCalendarIndexUsable({ version: 1, events: [] })).toBe(false)
    expect(isRaceCalendarIndexUsable(null)).toBe(false)
  })
})
