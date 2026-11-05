// PIP-695: the pure part of choosing "Tu" and "Riferimento".
import { describe, expect, it } from 'vitest'
import {
  chooseDefaultReference, choiceBlock, classifyLink, dateBucket, mySessionRows, sessionKindBests, lapKey, lapStatus, driverBestRows, runConditions, lapKind, sameKindFirst, matchesDriver, normalizeSearch,
  parseSessionLink, pctFaster, sameTrackName, sessionDate, whenParts, type LapChoice, type LapEntryLike,
} from '~/services/telemetry/lapChoice'

const now = new Date(2026, 9, 31, 18, 0, 0)
const lap = (o: Partial<LapChoice> & { lapNumber: number, sessionToken: string, lapTimeMs: number }): LapChoice => ({
  key: lapKey('me', o.sessionToken, o.lapNumber), ref: { kind: 'local', id: 'x' }, ownerUid: 'me', driver: 'Bob117', mine: true, status: 'valid', ...o,
})
const entry = (id: string, lapTimeMs: number, extra: Partial<LapEntryLike> = {}): LapEntryLike => ({ id, lapNumber: 1, lapTimeMs, valid: true, complete: true, origin: 'local', sessionToken: 't', ...extra })

describe('lapChoice: status and dates', () => {
  it('tells every status, incomplete first and unknown never as valid', () => {
    expect(lapStatus(true, true)).toBe('valid')
    expect(lapStatus(false, true)).toBe('invalid')
    expect(lapStatus(null, true)).toBe('unknown')
    expect(lapStatus(true, false)).toBe('incomplete')
  })
  it('reads a session token as the local wall clock and words it Oggi / Ieri / date', () => {
    // The library gives its recordedAt as a session token: it is a date too (PIP-695 live check).
    expect(sessionDate('', '20261029_165322')?.getDate()).toBe(29)
    const d = sessionDate('20261031_175200')!
    expect([d.getDate(), d.getHours(), d.getMinutes()]).toEqual([31, 17, 52])
    expect(whenParts(d, now)).toEqual({ day: 'today', dm: '31/10', hm: '17:52' })
    expect(whenParts(sessionDate('20261030_090000'), now)?.day).toBe('yesterday')
    expect(whenParts(sessionDate('20261024_163900'), now)).toEqual({ day: 'date', dm: '24/10', hm: '16:39' })
    expect(sessionDate('bad')).toBeNull()
    expect(sessionDate(null, '2026-10-20T10:00:00Z')).toBeInstanceOf(Date)
    expect(whenParts(null, now)).toBeNull()
  })
  it('puts sessions in Oggi / Ieri / Questa settimana / Prima', () => {
    expect(dateBucket(sessionDate('20261031_080000'), now)).toBe('today')
    expect(dateBucket(sessionDate('20261030_080000'), now)).toBe('yesterday')
    expect(dateBucket(sessionDate('20261026_080000'), now)).toBe('week')
    expect(dateBucket(sessionDate('20261001_080000'), now)).toBe('older')
    expect(dateBucket(null, now)).toBe('older')
  })
})

describe('lapChoice: I miei giri', () => {
  // 02/11 (user, as Track Titan): one row per past session, newest first, with its best qualifying and race lap.
  it('lists past sessions newest first with the qualifying and race lap of their summary', () => {
    const laps = [
      lap({ sessionToken: '20261001_100000', lapNumber: 2, lapTimeMs: 101000 }),
      lap({ sessionToken: '20261031_170000', lapNumber: 1, lapTimeMs: 100500 }),
      lap({ sessionToken: '20261030_100000', lapNumber: 1, lapTimeMs: 103900, status: 'unknown' }),
      lap({ sessionToken: '20261030_100000', lapNumber: 7, lapTimeMs: 100900, status: 'unknown' }),
      lap({ sessionToken: '20261030_100000', lapNumber: 9, lapTimeMs: 99000, status: 'invalid' }),
      lap({ sessionToken: '20261030_100000', lapNumber: 7, lapTimeMs: 100900, status: 'unknown' }),
    ]
    const rows = mySessionRows(laps, '20261031_170000', { '20261030_100000': { qualifyMs: 100901, raceMs: 103900 } })
    // The shown session is not a row (its laps are listed above).
    expect(rows.map(r => r.token)).toEqual(['20261030_100000', '20261001_100000'])
    const oct30 = rows[0]!
    expect(oct30.laps.map(l => l.lapNumber)).toEqual([1, 7, 9])
    // Times within 1 ms; the invalid lap 9 is faster but never used.
    expect(oct30.qualify?.lapNumber).toBe(7)
    expect(oct30.race?.lapNumber).toBe(1)
    // The summary names valid laps only.
    expect(oct30.race?.status).toBe('valid')
    expect(oct30.laps.filter(l => l.best).map(l => l.lapNumber)).toEqual([7])
    // No summary: only the fastest valid lap.
    expect(rows[1]!.qualify).toBeNull()
    expect(rows[1]!.race).toBeNull()
    expect(rows[1]!.best?.lapNumber).toBe(2)
  })
  // 02/11 (user): race best = fastest lap of the highest fuel band reached, even if a lighter band was quicker; 20-40 L never.
  it('takes the race best from the highest fuel band and the qualifying best with its fuel', () => {
    const band = (timeMs: number, fuel: number) => ({ timeMs, fuel, airTemp: 15, roadTemp: 18, grip: 'Optimum' })
    const empty = { '40-60': {}, '60-80': {}, '80-100': {}, '100+': {} }
    const bests = sessionKindBests({ best_qualy_ms: 102000, best_qualy_conditions: { airTemp: 14, roadTemp: 19, grip: 'Optimum' }, best_race_ms: 103000,
      best_by_grip: {
        Optimum: { bestQualy: 102000, bestQualyFuel: 9, raceBestByFuelBucket: { ...empty, '60-80': band(103000, 70), '80-100': band(104500, 85) } },
        Fast: { bestQualy: null, raceBestByFuelBucket: { ...empty, '80-100': band(104200, 90) } },
      } })
    expect(bests.raceMs).toBe(104200)
    expect(bests.raceConditions?.fuelL).toBe(90)
    expect(bests.qualifyMs).toBe(102000)
    expect(bests.qualifyConditions).toMatchObject({ fuelL: 9, airC: 14, grip: 'optimum' })
    // Only 20-40 L race laps: no race best (best_session_race_ms is not used).
    expect(sessionKindBests({ best_qualy_ms: null, best_by_grip: { Optimum: { raceBestByFuelBucket: empty } } }).raceMs).toBeNull()
  })
  it('never gives qualifying and race the same lap', () => {
    const t = '20261030_100000'
    const rows = mySessionRows([lap({ sessionToken: t, lapNumber: 1, lapTimeMs: 100000 }), lap({ sessionToken: t, lapNumber: 2, lapTimeMs: 100001 })], null,
      { [t]: { qualifyMs: 100000, raceMs: 100000 } })
    expect(rows[0]!.qualify?.lapNumber).toBe(1)
    expect(rows[0]!.race?.lapNumber).toBe(2)
  })
})

describe('lapChoice: search and leaderboard', () => {
  it('ignores case, accents and spaces, and accepts a part of the name', () => {
    expect(normalizeSearch('  Ré  Mì ')).toBe('re mi')
    expect(matchesDriver('RICO117', 'ico')).toBe(true)
    expect(matchesDriver('Jérôme', 'JEROME')).toBe(true)
    expect(matchesDriver('Bob', 'zz')).toBe(false)
    expect(matchesDriver(null, '')).toBe(true)
  })
  // 02/11 (user): at most two rows per driver, best qualifying and best race (the Worker's slots).
  it('lists best qualifying and best race per driver, drivers by their fastest row', () => {
    const rows = driverBestRows([
      { libId: 'a', uid: 'u1', lapTimeMs: 101000, recordedAt: null, kind: 'qualify' },
      { libId: 'b', uid: 'u1', lapTimeMs: 103000, recordedAt: null, kind: 'race', stintFuelL: 95 },
      { libId: 'c', uid: 'u2', lapTimeMs: 100500, recordedAt: null, fuelL: 9 },
      // Older entries without kind: by their fuel (over 20 L = race, unknown = qualifying).
      { libId: 'd', uid: 'me', lapTimeMs: 104000, recordedAt: null, fuelL: 70 },
    ], { u1: 'Mike', u2: 'Ann' }, 'me')
    expect(rows.map(r => [r.rank, r.uid, r.kind, r.entry.libId])).toEqual([[1, 'u2', 'qualify', 'c'], [2, 'u1', 'qualify', 'a'], [2, 'u1', 'race', 'b'], [3, 'me', 'race', 'd']])
    expect(rows[1]!.nickname).toBe('Mike')
    expect(rows[3]!.mine).toBe(true)
  })
})

describe('lapChoice: default reference', () => {
  it('my best valid lap when it beats Tu', () => {
    const pick = chooseDefaultReference({ you: entry('y', 101000), mine: [entry('y', 101000), entry('b', 100000), entry('c', 99000, { valid: false })], stepUp: null })
    expect(pick).toEqual({ id: 'b', reason: { kind: 'myBest' } })
  })
  it('a lap of another car never counts as my best', () => {
    const pick = chooseDefaultReference({ you: entry('y', 101000), mine: [entry('y', 101000), entry('o', 99000, { note: 'Auto diversa' })], stepUp: null })
    expect(pick?.reason.kind).toBe('sessionBest')
  })
  it('when Tu is already my best: the driver a step ahead, with how much faster', () => {
    const you = entry('y', 100000)
    const pick = chooseDefaultReference({ you, mine: [you, entry('s', 100400)], stepUp: entry('library:x', 98800, { driver: 'RICO117', origin: 'library' }) })
    expect(pick).toEqual({ id: 'library:x', reason: { kind: 'stepUp', driver: 'RICO117', pct: 1.2, relaxed: null } })
  })
  it('else my next best lap, else any other whole lap, else nothing', () => {
    const you = entry('y', 100000)
    expect(chooseDefaultReference({ you, mine: [you, entry('s', 100400)], stepUp: null })).toEqual({ id: 's', reason: { kind: 'nextBest' } })
    expect(chooseDefaultReference({ you, mine: [you, entry('i', 99000, { valid: false })], stepUp: null })?.id).toBe('i')
    expect(chooseDefaultReference({ you, mine: [you], stepUp: null })).toBeNull()
    expect(chooseDefaultReference({ you: null, mine: [entry('a', 1)], stepUp: null })?.reason.kind).toBe('myBest')
  })
  it('works out the step in percent', () => {
    expect(pctFaster(99000, 100000)).toBe(1)
    expect(pctFaster(1, 0)).toBe(0)
  })
})

describe('lapChoice: same lap and links', () => {
  it('never the same lap on both sides, never an incomplete lap', () => {
    const a = lap({ sessionToken: 't', lapNumber: 1, lapTimeMs: 1 })
    expect(choiceBlock(null, null)).toBe('none')
    expect(choiceBlock(a, a.key)).toBe('sameLap')
    expect(choiceBlock({ ...a, status: 'incomplete' }, null)).toBe('incomplete')
    expect(choiceBlock(a, 'other')).toBeNull()
  })
  it('tells a lap link, a session link, nothing and anything else apart', () => {
    expect(classifyLink('')).toBe('empty')
    expect(classifyLink(`https://app.racercore.app/giro#${'a'.repeat(32)}.${'b'.repeat(32)}`)).toBe('lap')
    expect(classifyLink('https://app.racercore.app/sessioni/abc?userId=u1')).toBe('session')
    expect(classifyLink('ciao')).toBe('unknown')
    expect(parseSessionLink('https://x/sessioni/abc?userId=u1&tab=telemetria')).toEqual({ sessionId: 'abc', userId: 'u1' })
    expect(parseSessionLink(null)).toBeNull()
  })
  it('compares track names loosely', () => {
    expect(sameTrackName('Spa', 'spa')).toBe(true)
    expect(sameTrackName('monza', 'Spa')).toBe(false)
    expect(sameTrackName('', 'spa')).toBe(false)
  })
  it('compares like with like: 20 L or less is qualifying, more is race (01/11)', () => {
    expect([lapKind(8.8), lapKind(20), lapKind(20.1), lapKind(null), lapKind(0)]).toEqual(['qualify', 'qualify', 'race', null, null])
    const laps = [{ id: 'q', fuel: 10 }, { id: 'r', fuel: 60 }]
    expect(sameKindFirst(laps, l => lapKind(l.fuel), 'race').map(l => l.id)).toEqual(['r'])
    expect(sameKindFirst(laps, l => lapKind(l.fuel), null).map(l => l.id)).toEqual(['q', 'r'])
    expect(sameKindFirst([{ id: 'q', fuel: 10 }], l => lapKind(l.fuel), 'race').map(l => l.id)).toEqual(['q'])
    // The default reference: my faster qualifying lap is skipped for a race lap of mine.
    const lap = (id: string, ms: number) => ({ id, lapNumber: 1, lapTimeMs: ms, valid: true, complete: true, origin: 'local', sessionToken: 't' })
    const fuel: Record<string, number> = { you: 60, q: 10, r: 55 }
    const pick = chooseDefaultReference({ you: lap('you', 104000), mine: [lap('you', 104000), lap('q', 100000), lap('r', 103500)], stepUp: null, kindOf: id => lapKind(fuel[id]) })
    expect(pick).toEqual({ id: 'r', reason: { kind: 'myBest' } })
  })
  it('reads the conditions of a lap file, none when the file has none (01/11)', () => {
    expect(runConditions({ fuelL: 43.7, tyreCompound: 'dry', conditions: { airC: 15, roadC: 18 } })).toEqual({ fuelL: 43.7, tyre: 'dry', airC: 15, roadC: 18, grip: null })
    // 01/11: grip from the lap, else the session row; unknown words stay unknown.
    expect(runConditions({ fuelL: null, conditions: { airC: null, roadC: null, grip: 'Optimum' } }, { track_grip_status: 'Wet', air_temp: 14 }))
      .toEqual({ fuelL: null, tyre: null, airC: 14, roadC: null, grip: 'optimum' })
    expect(runConditions({ fuelL: null, conditions: null }, { track_grip_status: 'Unknown' })).toBeNull()
    expect(runConditions({ fuelL: null, conditions: null }, { track_grip_status: 'Opt' })).toEqual({ fuelL: null, tyre: null, airC: null, roadC: null, grip: 'optimum' })
    expect(runConditions({ fuelL: null, conditions: null })).toBeNull()
    expect(runConditions(null)).toBeNull()
  })
})
