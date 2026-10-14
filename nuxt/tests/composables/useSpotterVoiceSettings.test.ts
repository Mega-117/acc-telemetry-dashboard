import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSpotterVoiceSettings } from '~/composables/useSpotterVoiceSettings'

const storage = new Map<string, string>()

beforeEach(() => {
  storage.clear()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.stubGlobal('CustomEvent', class {
    constructor(public type: string) {}
  })
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    },
    dispatchEvent: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('useSpotterVoiceSettings session modes', () => {
  it('PIP-533: target voice defaults on in every session; a switched-off target becomes "no session" once', () => {
    const settings = useSpotterVoiceSettings()
    settings.load(); expect(settings.targetLapVoiceEnabled.value).toBe(true)
    expect(settings.targetLapSessionModes.value).toEqual(['practice', 'qualify', 'race'])
    settings.setTargetLapVoiceEnabled(false); settings.load()
    expect(settings.targetLapVoiceEnabled.value).toBe(true)
    expect(settings.targetLapSessionModes.value).toEqual([])
    expect(storage.get('acc.spotter.targetLap.enabled')).toBe('1')
    expect(storage.get('acc.spotter.targetLap.sessionModes')).toBe('none')
    expect(settings.pressureWarningsEnabled.value).toBe(true)
    settings.setTargetLapSessionModes(['race']); settings.load()
    expect(settings.targetLapSessionModes.value).toEqual(['race'])
    expect(window.dispatchEvent).toHaveBeenCalled()
  })

  it('defaults pressure warnings to enabled in all sessions without changing other defaults', () => {
    const settings = useSpotterVoiceSettings()
    settings.load()
    expect(settings.pressureWarningsEnabled.value).toBe(true)
    expect(settings.pressureWarningSessionModes.value).toEqual(['practice', 'qualify', 'race'])
    expect(settings.lapTimeSessionModes.value).toEqual(['practice'])
  })

  it('persists the pressure master separately and reloads changes from another window', () => {
    const settings = useSpotterVoiceSettings()
    settings.load()
    settings.setPressureWarningSessionModes(['qualify', 'race'])
    expect(storage.get('acc.spotter.pressureWarnings.sessionModes')).toBe('qualify,race')
    // PIP-533: an old global switch-off migrates to "no session" on the next load.
    settings.togglePressureWarnings()
    expect(storage.get('acc.spotter.pressureWarnings.enabled')).toBe('0')
    settings.load()
    expect(settings.pressureWarningsEnabled.value).toBe(true)
    expect(settings.pressureWarningSessionModes.value).toEqual([])
    storage.set('acc.spotter.pressureWarnings.enabled', '1')
    storage.set('acc.spotter.pressureWarnings.sessionModes', 'race')
    settings.load()
    expect(settings.pressureWarningsEnabled.value).toBe(true)
    expect(settings.pressureWarningSessionModes.value).toEqual(['race'])
    // No session is a real choice now: the alert is off everywhere.
    settings.setPressureWarningSessionModes([])
    expect(settings.pressureWarningSessionModes.value).toEqual([])
    expect(storage.get('acc.spotter.pressureWarnings.sessionModes')).toBe('none')
    expect(window.dispatchEvent).toHaveBeenCalled()
  })

  it('defaults both existing installations and new installs to practice only', () => {
    const settings = useSpotterVoiceSettings()
    settings.load()
    expect(settings.referenceSessionModes.value).toEqual(['practice'])
    expect(settings.lapTimeSessionModes.value).toEqual(['practice'])
  })

  it('persists independent reference and lap-time selections', () => {
    const settings = useSpotterVoiceSettings()
    settings.load()
    settings.setReferenceSessionModes(['practice', 'race'])
    settings.setLapTimeSessionModes(['qualify'])

    expect(storage.get('acc.trackVoiceReferences.sessionModes')).toBe('practice,race')
    expect(storage.get('acc.spotter.trainingCoach.sessionModes')).toBe('qualify')
    expect(settings.referenceSessionModes.value).toEqual(['practice', 'race'])
    expect(settings.lapTimeSessionModes.value).toEqual(['qualify'])
  })

  it('keeps selected modes when the master is switched off', () => {
    const settings = useSpotterVoiceSettings()
    settings.load()
    settings.setReferenceSessionModes(['practice', 'qualify'])
    settings.setReferencesEnabled(false)

    expect(settings.referencesEnabled.value).toBe(false)
    expect(settings.referenceSessionModes.value).toEqual(['practice', 'qualify'])
    expect(storage.get('acc.trackVoiceReferences.sessionModes')).toBe('practice,qualify')
  })

  it('PIP-533: toggling away the last mode turns the alert off and survives a reload', () => {
    const settings = useSpotterVoiceSettings()
    settings.load()
    settings.toggleReferenceSessionMode('practice')
    expect(settings.referenceSessionModes.value).toEqual([])
    settings.load()
    expect(settings.referenceSessionModes.value).toEqual([])
  })
})
