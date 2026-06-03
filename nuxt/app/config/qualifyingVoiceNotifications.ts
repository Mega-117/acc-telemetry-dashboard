export type QualifyingVoiceScenario = 'sessionStart' | 'manualPause' | 'manualResume' | 'sessionComplete' | 'stepStart' | 'stepEnd'

export type QualifyingVoiceId = 'if_sara' | 'im_nicola'

export interface QualifyingVoicePhrase {
  id: string
  scenario: QualifyingVoiceScenario
  voice: QualifyingVoiceId
  speed: number
  text: string
}

export const QUALIFYING_VOICE_AUDIO_DIR = '/voice/qualifying'

export const qualifyingVoiceOptions: Array<{ id: QualifyingVoiceId; label: string }> = [
  { id: 'if_sara', label: 'Sara' },
  { id: 'im_nicola', label: 'Nicola' }
]

export function resolveQualifyingVoiceId(value: unknown): QualifyingVoiceId {
  return value === 'im_nicola' ? 'im_nicola' : 'if_sara'
}

export function getQualifyingVoiceAudioPath(scenario: QualifyingVoiceScenario, voice: QualifyingVoiceId) {
  return `${QUALIFYING_VOICE_AUDIO_DIR}/${scenario}-${voice}.wav`
}

/** Path for a step-specific intro WAV (one per training+step id combo, per voice). */
export function getStepStartAudioPath(trainingId: string, stepId: string, voice: QualifyingVoiceId) {
  return `${QUALIFYING_VOICE_AUDIO_DIR}/step-${trainingId}-${stepId}-${voice}.wav`
}

export const qualifyingVoicePhrases: QualifyingVoicePhrase[] = [
  {
    id: 'qual_start_1',
    scenario: 'sessionStart',
    voice: 'if_sara',
    speed: 1.2,
    text: 'ok pilota. allenamento qualifica avviato. preparati a spingere'
  },
  {
    id: 'manual_pause_1',
    scenario: 'manualPause',
    voice: 'if_sara',
    speed: 1.15,
    text: 'allenamento in pausa'
  },
  {
    id: 'manual_resume_1',
    scenario: 'manualResume',
    voice: 'if_sara',
    speed: 1.15,
    text: 'allenamento ripreso'
  },
  {
    id: 'step_end_1',
    scenario: 'stepEnd',
    voice: 'if_sara',
    speed: 1.15,
    text: 'blocco terminato. avanza quando sei pronto'
  },
  {
    id: 'session_complete_1',
    scenario: 'sessionComplete',
    voice: 'if_sara',
    speed: 1.12,
    text: 'allenamento completato ottimo lavoro. ora fai un recap di quello che hai fatto e i punti su cui lavorare la prossima volta'
  }
]

export function getRandomQualifyingVoicePhrase(
  scenario: QualifyingVoiceScenario,
  random: () => number = Math.random
) {
  const phrases = qualifyingVoicePhrases.filter((phrase) => phrase.scenario === scenario)
  if (!phrases.length) return null
  return phrases[Math.floor(random() * phrases.length)]!
}
