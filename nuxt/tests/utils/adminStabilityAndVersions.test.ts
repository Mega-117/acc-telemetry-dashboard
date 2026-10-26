// PIP-615 / PIP-631: settimana di stabilita' e problemi per versione.
import { describe, expect, it, vi } from 'vitest'
import { parseStabilityState, stabilityWeekDay } from '~/utils/adminStabilityWeek'
import { compareVersions, summarizeByVersion, channelLabel } from '~/utils/adminVersionSummary'
import { loadStabilityState, resetStabilityWeek } from '~/repositories/adminStabilityRepository'

const at = (iso: string) => new Date(iso).getTime()

describe('stabilityWeekDay', () => {
  it('the start day is day 1, the eighth day completes the week', () => {
    expect(stabilityWeekDay('2026-10-25', at('2026-10-25T20:00:00'))).toEqual({ day: 1, complete: false })
    expect(stabilityWeekDay('2026-10-25', at('2026-10-26T09:00:00'))).toEqual({ day: 2, complete: false })
    expect(stabilityWeekDay('2026-10-25', at('2026-10-31T23:00:00'))).toEqual({ day: 7, complete: false })
    expect(stabilityWeekDay('2026-10-25', at('2026-11-01T08:00:00'))).toEqual({ day: 7, complete: true })
    expect(stabilityWeekDay('2026-10-27', at('2026-10-26T08:00:00'))).toEqual({ day: 0, complete: false })
    expect(stabilityWeekDay('bad', at('2026-10-26T08:00:00'))).toBeNull()
  })

  it('parses only a valid state', () => {
    expect(parseStabilityState({ schemaVersion: 1, startedAt: '2026-10-25', resets: [{ at: 'x', reason: 'r', task: null, by: 'a' }, null] })?.resets).toHaveLength(1)
    expect(parseStabilityState({ schemaVersion: 2, startedAt: '2026-10-25', resets: [] })).toBeNull()
  })
})

describe('stability repository', () => {
  it('reads with the admin token and resets with a JSON body', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ schemaVersion: 1, startedAt: '2026-10-28', resets: [] }), { status: 200 }))
    const deps = { getToken: async () => 'tok', origin: 'https://w.example', fetchImpl: fetchImpl as unknown as typeof fetch }
    expect((await loadStabilityState(deps)).startedAt).toBe('2026-10-28')
    await resetStabilityWeek(deps, 'HUD bloccato', 'PIP-700', '2026-10-28')
    const [url, init] = fetchImpl.mock.calls[1] as unknown as [string, RequestInit]
    expect(url).toBe('https://w.example/v1/admin/stability')
    expect(init.method).toBe('PUT')
    expect(JSON.parse(String(init.body))).toEqual({ action: 'reset', reason: 'HUD bloccato', task: 'PIP-700', startDay: '2026-10-28' })
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok')
  })

  it('a non admin gets a clear message', async () => {
    const deps = { getToken: async () => 'tok', origin: 'https://w.example', fetchImpl: (async () => new Response('{}', { status: 403 })) as unknown as typeof fetch }
    await expect(loadStabilityState(deps)).rejects.toThrow('Solo un admin')
  })
})

describe('summarizeByVersion', () => {
  it('groups installations, anomaly bundles and errors per channel and version, newest first', () => {
    const rows = summarizeByVersion({
      installations: [{ suiteVersion: '0.5.1', channel: 'main' }, { suiteVersion: '0.5.2-dev.1', channel: 'develop' }, { suiteVersion: '0.5.1', channel: 'main' }],
      bundles: [
        { kind: 'anomaly', trigger: 'app.unclean-exit', version: '0.5.1', channel: 'main' },
        { kind: 'anomaly', trigger: 'incident.main-stall', version: '0.5.2-dev.1', channel: 'develop' },
        { kind: 'anomaly', trigger: 'incident.hud-ipc-error', version: '0.5.2-dev.1', channel: 'develop' },
        { kind: 'daily', trigger: null, version: '0.5.1', channel: 'main' },
      ],
      errors: [{ version: '0.5.1', channel: 'main' }, { version: null, channel: null }],
    })
    expect(rows.map(r => [r.channel, r.version, r.installations, r.crashes, r.stalls, r.otherAnomalies, r.errors])).toEqual([
      ['develop', '0.5.2-dev.1', 1, 0, 1, 1, 0],
      ['main', '0.5.1', 2, 1, 0, 0, 1],
      ['versioni vecchie', 'non dichiarata', 0, 0, 0, 0, 1],
    ])
    expect(channelLabel('main')).toBe('Produzione')
  })

  it('orders versions numerically, a dev build after its base series', () => {
    expect(['0.4.9', '0.5.2-dev.1', '0.5.1', '0.5.10', '0.5.2'].sort(compareVersions)).toEqual(['0.4.9', '0.5.1', '0.5.2-dev.1', '0.5.2', '0.5.10'])
  })
})
