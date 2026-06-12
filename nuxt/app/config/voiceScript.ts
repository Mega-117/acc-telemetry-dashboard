import voiceScriptJson from './voiceScript.json'

/**
 * Copione vocale unico (PIP-98): fonte dati per le frasi dette dall'overlay.
 * Lo consumano il generatore WAV (`scripts/generate_step_voices.py`), il
 * voice lab e i test di sincronia col catalogo. La riproduzione runtime usa
 * i WAV pregenerati, mai il testo.
 *
 * `origin`: 'system' = frase del copione ufficiale; 'user' è riservato ai
 * futuri override personalizzati dell'utente (es. riferimenti di frenata).
 */
export type VoicePhraseOrigin = 'system' | 'user'

export interface VoiceScriptScenario {
  id: string
  origin: VoicePhraseOrigin
  speed?: number
  text: string
}

export interface VoiceScriptStep {
  trainingId: string
  modeId: string
  stepId: string
  origin: VoicePhraseOrigin
  speed?: number
  text: string
}

export interface VoiceScript {
  version: number
  voices: string[]
  defaultSpeed: number
  scenarios: VoiceScriptScenario[]
  steps: VoiceScriptStep[]
}

export const voiceScript: VoiceScript = voiceScriptJson as VoiceScript

export function getStepVoicePhrase(trainingId: string, modeId: string, stepId: string): VoiceScriptStep | null {
  return voiceScript.steps.find(s => s.trainingId === trainingId && s.modeId === modeId && s.stepId === stepId) || null
}

export function getScenarioVoicePhrase(id: string): VoiceScriptScenario | null {
  return voiceScript.scenarios.find(s => s.id === id) || null
}
