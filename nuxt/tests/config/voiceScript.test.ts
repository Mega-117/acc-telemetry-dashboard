import { describe, expect, it } from 'vitest'
import { voiceScript, getStepVoicePhrase } from '~/config/voiceScript'
import { trainingOverlayCatalog, trainingOverlayOrder } from '~/config/trainingOverlayCatalog'

// Il copione è la fonte unica delle frasi (PIP-98): deve coprire ogni step
// del catalogo, senza voci orfane. Questo test sostituisce i commenti
// "KEEP IN SYNC" tra catalogo e generatore.
describe('voiceScript - sincronia col catalogo', () => {
  it('ogni step di ogni allenamento/durata ha la sua frase', () => {
    const missing: string[] = []
    for (const trainingId of trainingOverlayOrder) {
      const training = trainingOverlayCatalog[trainingId]
      for (const mode of Object.values(training.modes)) {
        for (const step of mode.steps) {
          if (!getStepVoicePhrase(trainingId, mode.id, step.id)) {
            missing.push(`${trainingId}/${mode.id}/${step.id}`)
          }
        }
      }
    }
    expect(missing).toEqual([])
  })

  it('nessuna frase orfana (step rimossi dal catalogo)', () => {
    const orphans = voiceScript.steps.filter((entry) => {
      const training = trainingOverlayCatalog[entry.trainingId as keyof typeof trainingOverlayCatalog]
      if (!training) return true
      const mode = training.modes[entry.modeId as keyof typeof training.modes]
      if (!mode) return true
      return !mode.steps.some(s => s.id === entry.stepId)
    })
    expect(orphans.map(o => `${o.trainingId}/${o.modeId}/${o.stepId}`)).toEqual([])
  })

  it('il primo step di ogni allenamento annuncia anche l\'avvio (PIP-98)', () => {
    for (const trainingId of trainingOverlayOrder) {
      const training = trainingOverlayCatalog[trainingId]
      for (const mode of Object.values(training.modes)) {
        const first = mode.steps[0]!
        const phrase = getStepVoicePhrase(trainingId, mode.id, first.id)
        expect(phrase?.text.startsWith('allenamento '), `${trainingId}/${mode.id}`).toBe(true)
      }
    }
  })

  it('lo scenario sessionComplete esiste, pausa/ripresa/fine-step rimossi', () => {
    const ids = voiceScript.scenarios.map(s => s.id)
    expect(ids).toContain('sessionComplete')
    expect(ids).not.toContain('manualPause')
    expect(ids).not.toContain('manualResume')
    expect(ids).not.toContain('stepEnd')
    expect(ids).not.toContain('sessionStart')
  })

  it('testi TTS-friendly: minuscoli e non vuoti', () => {
    for (const entry of [...voiceScript.steps, ...voiceScript.scenarios]) {
      expect(entry.text.trim().length).toBeGreaterThan(0)
      expect(entry.text).toBe(entry.text.toLowerCase())
    }
  })
})
