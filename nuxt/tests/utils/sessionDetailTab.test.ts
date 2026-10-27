// PIP-635: il dettaglio sessione parte dalla Telemetria solo quando i giri possono esserci.
import { describe, expect, it } from 'vitest'
import { initialDetailTab, lapTokenInArchive, type DetailTabContext } from '~/utils/sessionDetailTab'

const base: DetailTabContext = { evo: false, foreign: false, hasLapToken: true, desktop: true, viewingPilot: false }

describe('initialDetailTab', () => {
  it('opens Telemetria in the desktop app and for a coach viewing a pilot', () => {
    expect(initialDetailTab(base)).toBe('avanzata')
    expect(initialDetailTab({ ...base, desktop: false, viewingPilot: true })).toBe('avanzata')
  })

  it('stays on Sessione where Telemetria cannot have laps', () => {
    expect(initialDetailTab({ ...base, evo: true })).toBe('sessione')
    expect(initialDetailTab({ ...base, foreign: true })).toBe('sessione')
    expect(initialDetailTab({ ...base, hasLapToken: false })).toBe('sessione')
    expect(initialDetailTab({ ...base, desktop: false })).toBe('sessione')
  })

  it('PIP-647: in the browser opens Telemetria for a session still in the online archive (30 days)', () => {
    expect(initialDetailTab({ ...base, desktop: false, inArchive: true })).toBe('avanzata')
    expect(initialDetailTab({ ...base, desktop: false, inArchive: true, foreign: true })).toBe('sessione')
    const now = Date.UTC(2026, 9, 27, 12)
    expect(lapTokenInArchive('20261027_100000', now)).toBe(true)
    expect(lapTokenInArchive('20260928_100000', now)).toBe(true)
    expect(lapTokenInArchive('20260926_100000', now)).toBe(false)
    expect(lapTokenInArchive(null, now)).toBe(false)
    expect(lapTokenInArchive('bad', now)).toBe(false)
  })
})
