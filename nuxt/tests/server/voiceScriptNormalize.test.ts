import { describe, expect, it } from 'vitest'
import { normalizeVoiceText, normalizeVoiceScript } from '../../server/utils/voiceScriptNormalize'

describe('voiceScriptNormalize', () => {
  it('forza minuscolo e trim su un singolo testo', () => {
    expect(normalizeVoiceText('  VAI PUSCIA  ')).toBe('vai puscia')
    expect(normalizeVoiceText('Già Minuscolo')).toBe('già minuscolo')
  })

  it('normalizza i testi di steps e scenarios (complemento attivo del contratto)', () => {
    const body = {
      steps: [
        { trainingId: 'qualifying', modeId: 'short30', stepId: 'warmup', text: 'WARM-UP. VAI PUSCIA' },
      ],
      scenarios: [
        { id: 'overtake', text: '  Attento Alla Staccata  ' },
      ],
    }
    const out = normalizeVoiceScript(body)
    expect(out.steps[0].text).toBe('warm-up. vai puscia')
    expect(out.scenarios[0].text).toBe('attento alla staccata')
    // ogni testo rispetta il contratto di voiceScript.test.ts
    for (const e of [...out.steps, ...out.scenarios]) {
      expect(e.text).toBe(e.text.toLowerCase())
    }
  })

  it('non altera i campi diversi da text', () => {
    const body = {
      steps: [{ trainingId: 'T', modeId: 'M', stepId: 'S', text: 'CIAO', speed: 1.5 }],
      scenarios: [],
    }
    normalizeVoiceScript(body)
    expect(body.steps[0].trainingId).toBe('T')
    expect(body.steps[0].speed).toBe(1.5)
  })
})
