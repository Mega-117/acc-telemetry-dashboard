import { describe, expect, it } from 'vitest'
import { gameSwitchDestination } from '~/services/ui/gameSwitchDestination'
import { buildCommonTrackOverview } from '~/services/projections/buildCommonTrackOverview'
import type { SessionDocument } from '~/types/telemetry'

describe('shared simulator lists', () => {
  it('shows the fastest car per layout unless filtered, also for a future simulator', () => {
    const row = (id: string, car: string, variant: string, date: string, best: number) => ({sessionId:id,
      meta:{gameId:'future',track:'Monza',car,trackVariant:variant,date_start:date},
      summary:{laps:1,lapsValid:1,bestLap:best,totalTime:best}}) as SessionDocument
    const result=buildCommonTrackOverview([
      row('one','Ferrari','GP','2026-10-03T22:08:00Z',115000),
      row('two','Ford','GP','2026-10-02',90000),
      row('three','Ferrari','Short','2026-10-01',60000),
    ],'future')
    expect(result[0]).toMatchObject({bestLap:'1:30.000',referenceLabel:'Ford',lastSession:'2026-10-03'})
  })
  it.each(['/panoramica', '/sessioni', '/piste', '/hud', '/piloti/qa'])('retains section %s', path => {
    expect(gameSwitchDestination(path)).toBeNull()
  })
  it.each([['/sessioni/one', '/sessioni'], ['/piste/Monza%20GP/', '/piste']])('leaves game-owned detail %s', (path, expected) => {
    expect(gameSwitchDestination(path)).toBe(expected)
  })
  it('keeps only selected game, deduplicates and preserves route identities and recency', () => {
    const session = (id: string, game: string, track: string, date: string) => ({ sessionId: id,
      meta: { gameId: game, track, date_start: date }, summary: {} }) as SessionDocument
    const one = session('one', 'evo', 'Monza', '2026-10-03')
    const rows = buildCommonTrackOverview([one, one, session('two','evo','Monza','2026-10-04'), session('three','acc','Spa','2026-10-05'), session('four','evo','Unknown','2026-10-01')], 'evo')
    expect(rows.filter(row => row.sessions > 0)).toHaveLength(2)
    expect(rows[0]).toMatchObject({id:'monza',sessions:2,lastSession:'2026-10-04',image:'/tracks/track_monza.png'})
    expect(rows[0]?.bestQualy).toBeUndefined()
    expect(rows[1]?.image).toBeUndefined()
    expect(buildCommonTrackOverview([], 'future')).toEqual([])
  })
})
