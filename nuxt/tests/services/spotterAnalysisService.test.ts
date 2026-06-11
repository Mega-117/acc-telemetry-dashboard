import { describe, expect, it } from 'vitest'
import { createSpotterAnalyzer } from '~/services/spotter/spotterAnalysisService'

describe('spotterAnalysisService', () => {
  it('rileva recupero sul pilota davanti quando il gap diminuisce', () => {
    const analyzer = createSpotterAnalyzer({ cooldownMs: 0, sameMessageCooldownMs: 0 })
    analyzer.analyze({ laps_completed: 1, gap_ahead_ms: 1200, gap_behind_ms: 1600, completed_sectors: [31000, 30000, 32000] }, 1000)
    const events = analyzer.analyze({ laps_completed: 2, gap_ahead_ms: 850, gap_behind_ms: 1700, completed_sectors: [31000, 30000, 32000] }, 2000)

    expect(events[0]?.target).toBe('ahead')
    expect(events[0]?.trend).toBe('gaining')
    expect(events[0]?.messageKey).toBe('attackWindow')
    expect(events[0]?.sector).toBe(2)
  })

  it('rileva perdita dal pilota davanti quando il gap aumenta', () => {
    const analyzer = createSpotterAnalyzer({ cooldownMs: 0, sameMessageCooldownMs: 0 })
    analyzer.analyze({ laps_completed: 1, gap_ahead_ms: 900, completed_sectors: [31000, 30000, 33000] }, 1000)
    const events = analyzer.analyze({ laps_completed: 2, gap_ahead_ms: 1300, completed_sectors: [31000, 30000, 33000] }, 2000)

    expect(events[0]?.target).toBe('ahead')
    expect(events[0]?.trend).toBe('losing')
    expect(events[0]?.messageKey).toBe('aheadLosing')
    expect(events[0]?.sector).toBe(3)
  })

  it('rileva il pilota dietro che recupera quando gapBehind diminuisce', () => {
    const analyzer = createSpotterAnalyzer({ cooldownMs: 0, sameMessageCooldownMs: 0 })
    analyzer.analyze({ laps_completed: 1, gap_behind_ms: 1800, completed_sectors: [31000, 30000, 33000] }, 1000)
    const events = analyzer.analyze({ laps_completed: 2, gap_behind_ms: 1200, completed_sectors: [31000, 30000, 33000] }, 2000)

    expect(events[0]?.target).toBe('behind')
    expect(events[0]?.trend).toBe('gaining')
    expect(events[0]?.messageKey).toBe('behindClosing')
  })

  it('classifica stabile sotto soglia', () => {
    const analyzer = createSpotterAnalyzer({ cooldownMs: 0, sameMessageCooldownMs: 0 })
    analyzer.analyze({ laps_completed: 1, gap_ahead_ms: 1000, completed_sectors: [31000, 30000, 33000] }, 1000)
    const events = analyzer.analyze({ laps_completed: 2, gap_ahead_ms: 1080, completed_sectors: [31000, 30000, 33000] }, 2000)

    expect(events[0]?.trend).toBe('stable')
    expect(events[0]?.messageKey).toBe('aheadStable')
  })

  it('applica cooldown anti spam', () => {
    const analyzer = createSpotterAnalyzer({ cooldownMs: 8000, sameMessageCooldownMs: 0 })
    analyzer.analyze({ laps_completed: 1, gap_ahead_ms: 1200, completed_sectors: [31000, 30000, 32000] }, 1000)
    expect(analyzer.analyze({ laps_completed: 2, gap_ahead_ms: 900, completed_sectors: [31000, 30000, 32000] }, 2000)).toHaveLength(1)
    expect(analyzer.analyze({ laps_completed: 3, gap_ahead_ms: 700, completed_sectors: [31000, 30000, 32000] }, 3000)).toHaveLength(0)
  })
})
