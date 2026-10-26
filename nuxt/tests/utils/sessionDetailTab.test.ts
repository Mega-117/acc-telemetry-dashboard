// PIP-635: il dettaglio sessione parte dalla Telemetria solo quando i giri possono esserci.
import { describe, expect, it } from 'vitest'
import { initialDetailTab, type DetailTabContext } from '~/utils/sessionDetailTab'

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
})
