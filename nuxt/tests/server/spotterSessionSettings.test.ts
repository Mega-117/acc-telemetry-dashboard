import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const page = readFileSync(resolve(process.cwd(), 'app/pages/spotter.vue'), 'utf8')
const picker = readFileSync(resolve(process.cwd(), 'app/components/spotter/SessionModePicker.vue'), 'utf8')
const runtime = readFileSync(resolve(process.cwd(), 'app/pages/spotter-audio-runtime.vue'), 'utf8')

describe('Spotter session settings wiring', () => {
  it('uses the same accessible multi-select picker for references, coach and lap alerts', () => {
    // PIP-260: terzo picker per la voce dedicata "Feedback coach"
    expect(page.match(/<SessionModePicker/g)).toHaveLength(3)
    expect(page).toContain('Sessioni abilitate per i riferimenti pista')
    expect(page).toContain('Sessioni abilitate per il feedback coach')
    expect(page).toContain('Sessioni abilitate per gli avvisi giro')
    expect(picker).toContain('role="group"')
    expect(picker).toContain(':aria-pressed="modelValue.includes(mode)"')
    expect(picker).toContain("practice: 'Prove libere'")
  })

  it('gates all audio sources through the shared session policy', () => {
    expect(runtime).toContain('referencesAllowedForSession')
    expect(runtime).toContain('lapTimesAllowedForSession')
    expect(runtime).toContain('coachAllowedForSession')
    expect(runtime).toContain('isSpotterFeatureAllowed(')
    expect(runtime).toContain('fastState.value.sessionType')
  })

  it('resets only the reference lap state on a real session-type boundary', () => {
    expect(runtime).toContain('watch(() => fastState.value.sessionType')
    expect(runtime).toContain('isSpotterSessionChange(previousSessionType, sessionType)')
    expect(runtime).toContain('resetTrackVoiceReferenceLapState()')
    expect(runtime).toContain('La FIFO audio resta intatta')
  })

  it('accoda l’avviso pressioni dopo il tempo senza dipendere dal toggle tempo giro', () => {
    const lapWatch = runtime.slice(
      runtime.indexOf('watch(() => liveLap.value.lapsCompleted'),
      runtime.indexOf('watch(() => selectedVoice.value'),
    )
    expect(lapWatch.indexOf('announceLapTime(newVal)')).toBeLessThan(
      lapWatch.indexOf('pressureVoiceRuntime.recordFinishCrossing(newVal)'),
    )
    expect(runtime).toContain('createPressureRecommendationVoiceRuntime')
    expect(runtime).not.toMatch(/recordFinishCrossing[\s\S]{0,160}lapTimesAllowedForSession/)
  })

  it('usa capability attestata, coda riusabile e diagnostica persistente', () => {
    expect(runtime).toContain('resolveLocalRuntimeCapability')
    expect(runtime).toContain('createVoicePlaybackQueue')
    expect(runtime).toContain('createVoiceRuntimeDiagnostics')
    expect(runtime).not.toContain('let queue = Promise.resolve()')
    expect(runtime).not.toContain('const { canEnterApp } = useFirebaseAuth()')
  })
})
