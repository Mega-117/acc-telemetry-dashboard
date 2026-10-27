import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { translate } from '~/i18n'

const page = readFileSync(resolve(process.cwd(), 'app/pages/spotter.vue'), 'utf8')
const picker = readFileSync(resolve(process.cwd(), 'app/components/spotter/SessionModePicker.vue'), 'utf8')
const runtime = readFileSync(resolve(process.cwd(), 'app/pages/spotter-audio-runtime.vue'), 'utf8')

describe('Spotter session settings wiring', () => {
  it('uses the same accessible multi-select picker for references, coach and lap alerts', () => {
    // PIP-260: terzo picker per la voce dedicata "Feedback coach"
    // PIP-533: the target voice has its sessions too.
    expect(page.match(/<SessionModePicker/g)).toHaveLength(5)
    // PIP-665: the picker labels are dictionary keys; the Italian texts stay the same.
    expect(page).toContain(":label=\"t('spotter.targetVoiceSessions')\"")
    expect(page).toContain(":label=\"t('spotter.pressureAlertsSessions')\"")
    expect(page).toContain(":label=\"t('spotter.trackReferencesSessions')\"")
    expect(page).toContain(":label=\"t('spotter.coachSessions')\"")
    expect(page).toContain(":label=\"t('spotter.lapAlertsSessions')\"")
    expect(translate('it', 'spotter.targetVoiceSessions')).toBe('Sessioni abilitate per la voce target')
    expect(translate('it', 'spotter.pressureAlertsSessions')).toBe('Sessioni abilitate per gli avvisi pressioni')
    expect(translate('it', 'spotter.trackReferencesSessions')).toBe('Sessioni abilitate per i riferimenti pista')
    expect(translate('it', 'spotter.coachSessions')).toBe('Sessioni abilitate per il feedback coach')
    expect(translate('it', 'spotter.lapAlertsSessions')).toBe('Sessioni abilitate per gli avvisi giro')
    expect(picker).toContain('role="group"')
    expect(picker).toContain(':aria-pressed="modelValue.includes(mode)"')
    expect(picker).toContain("practice: 'spotter.sessions.practice'")
    expect(translate('it', 'spotter.sessions.practice')).toBe('Prove libere')
    expect(translate('en', 'spotter.sessions.practice')).toBe('Practice')
  })

  it('gates all audio sources through the shared session policy', () => {
    expect(runtime).toContain('referencesAllowedForSession')
    expect(runtime).toContain('lapTimesAllowedForSession')
    expect(runtime).toContain('coachAllowedForSession')
    expect(runtime).toContain("canAnnounce: () => canRunSpotterAudio.value && audioFeatureAvailable(fastState.value, 'pressureRecommendation') && isSpotterFeatureAllowed(")
    expect(runtime).toContain('pressureWarningSessionModes.value')
    expect(runtime).toContain('isSpotterFeatureAllowed(')
    expect(runtime).toContain('fastState.value.sessionType')
  })

  it('resets only the reference lap state on a real session-type boundary', () => {
    expect(runtime).toContain('watch(() => fastState.value.sessionType')
    expect(runtime).toContain('isSpotterSessionChange(previousSessionType, sessionType)')
    expect(runtime).toContain('resetTrackVoiceReferenceLapState()')
    expect(runtime).toContain('La FIFO audio resta intatta')
  })

  it('routes lap and pressure announcements through the coherent fast-state coordinator', () => {
    // Ordering and the independent lap toggle are exercised by the mounted
    // renderer tests in components/spotterAudioRuntime.test.ts.
    expect(runtime).toMatch(/createFinishLineVoiceRuntime\(\{\s*pressure: pressureVoiceRuntime,\s*announceLap: announceLapTime,/)
    expect(runtime).toMatch(/watch\(fastState, frame => \{\s*if \(canRunSpotterAudio.value\)\s*\{\s*finishLineVoiceRuntime.update\(frame\)/)
    expect(runtime).not.toContain('watch(() => liveLap.value.lapsCompleted')
    expect(runtime).toContain('createPressureRecommendationVoiceRuntime')
  })

  it('usa capability attestata, coda riusabile e diagnostica persistente', () => {
    expect(runtime).toContain('resolveLocalRuntimeCapability')
    expect(runtime).toContain('createVoicePlaybackQueue')
    expect(runtime).toContain('createVoiceRuntimeDiagnostics')
    expect(runtime).not.toContain('let queue = Promise.resolve()')
    expect(runtime).not.toContain('const { canEnterApp } = useFirebaseAuth()')
  })
})
