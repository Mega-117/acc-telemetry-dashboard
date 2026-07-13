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

  it('does not allow toggling away the last selected mode', () => {
    const settings = useSpotterVoiceSettings()
    settings.load()
    settings.toggleReferenceSessionMode('practice')
    expect(settings.referenceSessionModes.value).toEqual(['practice'])
  })
})
