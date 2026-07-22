import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const component = readFileSync(resolve(process.cwd(), 'app/components/ChatterboxVoiceLabPanel.vue'), 'utf8')
const page = readFileSync(resolve(process.cwd(), 'app/pages/dev-voice-lab.vue'), 'utf8')

describe('Chatterbox Voice Lab UI contract', () => {
  it('offre testo libero, pannello voci, ascolto e player', () => {
    expect(component).toContain('<textarea v-model="text"')
    expect(component).toContain('<select v-model="selectedVoice"')
    expect(component).toContain('v-for="voice in voices"')
    expect(component).toContain('@click="listen"')
    expect(component).toContain("{{ isSpeaking ? 'Generazione…' : 'Ascolta' }}")
    expect(component).toContain('<audio v-if="audioUrl"')
    expect(component).toContain('Anteprima pronta (non salvata).')
    expect(component).toContain('<ChatterboxProsodyControls')
  })

  it('usa testo italiano senza tag e invia i controlli reali di tonalità', () => {
    expect(component).not.toContain('[laugh]')
    expect(component).not.toContain('[clear throat]')
    expect(component).toContain('placeholder="Scrivi qui il testo italiano da ascoltare..."')
    expect(component).toContain('exaggeration: exaggeration.value')
    expect(component).toContain('cfgWeight: cfgWeight.value')
  })

  it('resta confinato allo sviluppo e agli admin', () => {
    expect(page).toContain('const chatterboxDevEnabled = import.meta.dev')
    expect(page).toContain('v-if="chatterboxDevEnabled"')
    expect(page).toContain('v-else-if="hasFullVoiceLabAccess && chatterboxDevEnabled && voiceLabSection === \'chatterbox\'"')
  })
})
