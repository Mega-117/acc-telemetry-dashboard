// PIP-695: the pure part of choosing "Tu" and "Riferimento".
import { describe, expect, it } from 'vitest'
import {
  chooseDefaultReference, choiceBlock, classifyLink, dateBucket, groupMyLaps, lapKey, lapStatus, leaderboard, runConditions, lapKind, sameKindFirst, matchesDriver, normalizeSearch,
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
  it('shows the current session first, then by date, laps by number with the fastest valid starred', () => {
    const laps = [
      lap({ sessionToken: '20261001_100000', lapNumber: 2, lapTimeMs: 101000 }),
      lap({ sessionToken: '20261031_170000', lapNumber: 3, lapTimeMs: 99000, status: 'invalid' }),
      lap({ sessionToken: '20261031_170000', lapNumber: 1, lapTimeMs: 100500 }),
      lap({ sessionToken: '20261031_170000', lapNumber: 2, lapTimeMs: 100200 }),
      lap({ sessionToken: '20261030_100000', lapNumber: 1, lapTimeMs: 100900 }),
      lap({ sessionToken: '20261031_120000', lapNumber: 1, lapTimeMs: 100800 }),
      lap({ sessionToken: '20261031_170000', lapNumber: 2, lapTimeMs: 100200 }),
    ]
    const groups = groupMyLaps(laps, '20261031_170000', now)
    expect(groups.map(g => g.bucket)).toEqual(['current', 'today', 'yesterday', 'older'])
    const current = groups[0]!.sessions[0]!
    expect(current.current).toBe(true)
    expect(current.laps.map(l => l.lapNumber)).toEqual([1, 2, 3])
    // The invalid lap 3 is faster, but the star goes to the fastest valid one.
    expect(current.laps.filter(l => l.best).map(l => l.lapNumber)).toEqual([2])
    expect(current.bestKey).toBe(lapKey('me', '20261031_170000', 2))
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
  it('lists the best lap per driver fastest first, with the gap to my best and my row marked', () => {
    const rows = leaderboard([
      { libId: 'a', uid: 'u1', lapTimeMs: 101000, recordedAt: null },
      { libId: 'b', uid: 'me', lapTimeMs: 100500, recordedAt: null },
      { libId: 'c', uid: 'u2', lapTimeMs: 99800, recordedAt: null },
      { libId: 'd', uid: 'u1', lapTimeMs: 100900, recordedAt: null },
    ], { u1: 'Mike', u2: 'Ann' }, 'me', 100500)
    expect(rows.map(r => [r.rank, r.uid, r.lapTimeMs])).toEqual([[1, 'u2', 99800], [2, 'me', 100500], [3, 'u1', 100900]])
    expect(rows[0]!.gapMs).toBe(-700)
    expect(rows[1]!.mine).toBe(true)
    expect(rows[2]!.nickname).toBe('Mike')
    expect(leaderboard([{ libId: 'a', uid: 'u1', lapTimeMs: 1, recordedAt: null }], {}, null, null)[0]!.gapMs).toBeNull()
  })
  it('my row shows my real best when the library only has an older, slower lap of mine (01/11)', () => {
    const rows = leaderboard([
      { libId: 'old', uid: 'me', lapTimeMs: 103585, recordedAt: null },
      { libId: 'r', uid: 'rico', lapTimeMs: 102635, recordedAt: null },
    ], {}, 'me', 102842, true)
    expect(rows.map(r => [r.rank, r.uid, r.lapTimeMs, r.libId])).toEqual([[1, 'rico', 102635, 'r'], [2, 'me', 102842, 'old']])
    expect(rows[1]!.gapMs).toBe(0)
    // A faster library lap of mine stays as it is, and the gaps use it too.
    const faster = leaderboard([{ libId: 'x', uid: 'me', lapTimeMs: 100000, recordedAt: null }, { libId: 'y', uid: 'b', lapTimeMs: 102000, recordedAt: null }], {}, 'me', 103000, true)
    expect(faster.map(r => [r.uid, r.lapTimeMs, r.gapMs])).toEqual([['me', 100000, 0], ['b', 102000, 2000]])
  })
  it('a coach looking at a pilot never gets the pilot best on the coach row (01/11)', () => {
    const rows = leaderboard([{ libId: 'c', uid: 'coach', lapTimeMs: 105000, recordedAt: null }], {}, 'coach', 100000, false)
    expect(rows[0]!.lapTimeMs).toBe(105000)
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
    expect(pick).toEqual({ id: 'library:x', reason: { kind: 'stepUp', driver: 'RICO117', pct: 1.2 } })
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
    expect(runConditions({ fuelL: 43.7, tyreCompound: 'dry', conditions: { airC: 15, roadC: 18 } })).toEqual({ fuelL: 43.7, tyre: 'dry', airC: 15, roadC: 18 })
    expect(runConditions({ fuelL: null, conditions: null })).toBeNull()
    expect(runConditions(null)).toBeNull()
  })
})
