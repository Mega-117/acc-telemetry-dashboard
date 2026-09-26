import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = (name: string) => readFileSync(resolve(process.cwd(), 'app', name), 'utf8')
describe('target voice renderer/IPC wiring contract', () => {
  it('runs behind existing audio capability, after other finish-line messages', () => {
    const audio = source('pages/spotter-audio-runtime.vue')
    expect(audio).toContain('canAnnounce: () => canRunSpotterAudio.value && targetLapVoiceEnabled.value')
    expect(audio).toMatch(/finishLineVoiceRuntime.update\(frame\)\s+targetLapVoiceRuntime.update\(frame\)/)
    expect(audio).toContain('targetLapVoiceRuntime.reset()')
    expect(audio).toContain('removeTargetSettingsListener?.()')
    expect(audio.indexOf('api?.onInfoTargetSettings')).toBeLessThan(audio.indexOf('await api?.infoTargetGetSettings'))
    expect(audio).toContain('revision === targetSettingsRevision')
    expect(source('pages/sectors-overlay.vue')).not.toContain('createTargetLapVoiceRuntime')
  })
  it('persists voice directly from the main list, independently of target edits', () => {
    const panel = source('pages/training-overlay.vue')
    expect(panel).toContain('@toggle-target="setTargetLapVoiceEnabled(!targetLapVoiceEnabled)"')
    expect(panel).toContain(':target="targetLapVoiceEnabled"')
    const controls = source('components/overlay/QuickPanelVoiceControls.vue')
    expect(controls).toContain('data-overlay-wheel-action="target-voice"')
    expect(controls).toContain(':model-value="target"')
    expect(panel).not.toContain('infoTargetVoiceDraft')
    expect(source('components/overlay/InfoTargetSetup.vue')).not.toContain('target-voice')
    const confirm = panel.slice(panel.indexOf('async function confirmInfoTarget'), panel.indexOf('async function confirmInfoTarget') + 600)
    expect(confirm).not.toContain('setTargetLapVoiceEnabled')
  })
})
