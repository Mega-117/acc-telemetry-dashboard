import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const stopRoute = readFileSync(resolve(process.cwd(), 'server/api/dev/kokoro-stop.post.ts'), 'utf8')
const voiceLab = readFileSync(resolve(process.cwd(), 'app/pages/dev-voice-lab.vue'), 'utf8')
const app = readFileSync(resolve(process.cwd(), 'app/app.vue'), 'utf8')
const lifecycle = readFileSync(resolve(process.cwd(), 'app/composables/useKokoroVoiceLabLifecycle.ts'), 'utf8')

describe('kokoro VoiceLab lifecycle', () => {
  it('non spegne processi Kokoro non gestiti da ACC Suite', () => {
    expect(stopRoute).toContain('getManagedKokoroPid()')
    expect(stopRoute).toContain("reason: 'not-managed'")
    expect(stopRoute).toContain('stopManagedKokoroProcess()')
  })

  it('usa una finestra idle di 10 secondi fuori dal VoiceLab', () => {
    expect(lifecycle).toContain('KOKORO_IDLE_SHUTDOWN_MS = 10_000')
    expect(lifecycle).toContain("VOICE_LAB_MARKER = 'kokoro-voice-lab-active'")
    expect(lifecycle).toContain("window.location.pathname.replace(/\\/+$/, '') === VOICE_LAB_PATH")
    expect(lifecycle).toContain('const voiceLabRuntime = useVoiceLabRuntime()')
    expect(lifecycle).toContain('voiceLabRuntime.kokoroStop()')
    expect(app).toContain('kokoroVoiceLabLifecycle.leaveVoiceLab()')
    expect(app).toContain('kokoroVoiceLabLifecycle.resumePendingLeaveIfNeeded()')
    expect(voiceLab).toContain('kokoroLifecycle.beginWork()')
    expect(voiceLab).toContain('kokoroLifecycle.endWork()')
  })
})
