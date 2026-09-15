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
  it('uses a draft in Ctrl+K; only a successful target confirmation persists voice', () => {
    const panel = source('pages/training-overlay.vue')
    expect(panel).toContain('infoTargetVoiceDraft.value = targetLapVoiceEnabled.value')
    expect(panel).toContain('if (saved) setTargetLapVoiceEnabled(infoTargetVoiceDraft.value)')
    expect(panel).toContain('@toggle-voice="infoTargetVoiceDraft = !infoTargetVoiceDraft"')
    const cancel = panel.slice(panel.indexOf('function cancelInfoTargetSetup'), panel.indexOf('async function confirmInfoTarget'))
    expect(cancel).not.toContain('setTargetLapVoiceEnabled')
  })
})
