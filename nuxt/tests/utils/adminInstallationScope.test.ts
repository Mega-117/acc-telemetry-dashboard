import { describe, expect, it } from 'vitest'
import {
  compareSuiteVersion,
  isActiveWithinDays,
  isOnLatestVersion,
  latestVersionByChannel,
  summarizeStabilityPopulation
} from '~/utils/adminInstallationScope'

const NOW = Date.parse('2026-10-15T12:00:00Z')
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString()
const inst = (over: Record<string, unknown>) => ({
  ownerUid: 'u', installationId: 'i', lastContactAt: daysAgo(1), suiteVersion: '0.4.5-dev.3', channel: 'develop', ...over
}) as any

describe('adminInstallationScope', () => {
  it('confronta versioni: numeri, prerelease numerico, release sopra dev', () => {
    expect(compareSuiteVersion('0.4.5-dev.10', '0.4.5-dev.9')).toBe(1)
    expect(compareSuiteVersion('0.4.6-dev.1', '0.4.5-dev.9')).toBe(1)
    expect(compareSuiteVersion('0.4.5', '0.4.5-dev.9')).toBe(1)
    expect(compareSuiteVersion('v0.4.5', '0.4.5')).toBe(0)
    expect(compareSuiteVersion('0.4.5-dev.2', '0.4.5-dev.3')).toBe(-1)
  })

  it('attiva negli ultimi 7 giorni: confine, mai visto, data futura', () => {
    expect(isActiveWithinDays(inst({ lastContactAt: daysAgo(6.9) }), NOW)).toBe(true)
    expect(isActiveWithinDays(inst({ lastContactAt: daysAgo(7.1) }), NOW)).toBe(false)
    expect(isActiveWithinDays(inst({ lastContactAt: null }), NOW)).toBe(false)
    expect(isActiveWithinDays(inst({ lastContactAt: new Date(NOW + 3_600_000).toISOString() }), NOW)).toBe(false)
    expect(isActiveWithinDays(null, NOW)).toBe(false)
  })

  it('ultima versione per canale e appartenenza', () => {
    const list = [inst({ suiteVersion: '0.4.5-dev.3' }), inst({ suiteVersion: '0.4.4' , channel: 'main' }), inst({ suiteVersion: '0.4.3', channel: 'main' })]
    const latest = latestVersionByChannel(list)
    expect(latest.get('develop')).toBe('0.4.5-dev.3')
    expect(latest.get('main')).toBe('0.4.4')
    expect(isOnLatestVersion(list[2], latest)).toBe(false)
    expect(isOnLatestVersion(inst({ suiteVersion: null }), latest)).toBe(false)
  })

  it('popolazione del cancello: esclude test, inattive e versioni vecchie', () => {
    const list = [
      inst({ ownerUid: 'real-1' }),
      inst({ ownerUid: 'real-2', suiteVersion: '0.4.4-dev.9' }),
      inst({ ownerUid: 'real-3', lastContactAt: daysAgo(20), suiteVersion: '0.4.9-dev.1' }),
      inst({ ownerUid: '9pRwnLZ3ciZwl4X5eQ5vjKUHy6z2', suiteVersion: '0.9.0-dev.1' })
    ]
    const summary = summarizeStabilityPopulation(list, NOW)
    expect(summary).toMatchObject({ active: 2, onLatest: 1, counted: 1, testHidden: 1 })
    expect(summary.byChannel.develop).toEqual({ counted: 1, version: '0.4.5-dev.3' })
  })
})
