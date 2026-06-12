import {
  trackTitanTrainingModes,
  type TrackTitanDurationModeId,
  type TrackTitanTrainingStep
} from './trackTitanSegmentFocus'

export type TrainingOverlayId =
  | 'tracktitan_input'
  | 'clean_laps'
  | 'qualifying'
  | 'consistency'
  | 'race_real'

export type TrainingOverlayDurationModeId = TrackTitanDurationModeId
export type TrainingOverlayTone = 'tracktitan' | 'clean' | 'qualifying' | 'consistency' | 'race'
export type TrainingOverlayStepType =
  | 'setup'
  | 'warmup'
  | 'run'
  | 'work'
  | 'stint'
  | 'pause'
  | 'review'
  | 'focusRun'
  | 'race'
  | 'recap'

// Le frasi vocali per-step vivono nel copione unico (voiceScript.json, PIP-98),
// non più nel catalogo.
export interface TrainingOverlayStep {
  id: string
  title: string
  durationMinutes: number
  type: TrainingOverlayStepType
  hud: string
}

export interface TrainingOverlayMode {
  id: TrainingOverlayDurationModeId
  title: string
  duration: number
  description: string
  steps: TrainingOverlayStep[]
}

export interface TrainingOverlayTraining {
  id: TrainingOverlayId
  label: string
  title: string
  summary: string
  tone: TrainingOverlayTone
  accent: string
  accentEnd: string
  accentRgb: string
  accentContrast: string
  modes: Record<TrainingOverlayDurationModeId, TrainingOverlayMode>
}

export const trainingOverlayStepTypeLabels: Record<TrainingOverlayStepType, string> = {
  setup: 'Setup',
  warmup: 'Warm-up',
  run: 'Run',
  work: 'Lavoro',
  stint: 'Stint',
  pause: 'Pausa',
  review: 'Review',
  focusRun: 'Run focus',
  race: 'Gara',
  recap: 'Recap'
}

const trackTitanHudByType: Partial<Record<TrainingOverlayStepType, string>> = {
  run: 'Crea dati puliti. Non correggere ancora.',
  review: 'Peggior segmento. Solo freno e gas.',
  focusRun: 'Solo quel segmento. Match freno/gas.',
  recap: 'Decidi: ripeti o passa avanti.'
}

function mapTrackTitanStep(step: TrackTitanTrainingStep): TrainingOverlayStep {
  return {
    id: step.id,
    title: step.title,
    durationMinutes: step.durationMinutes,
    type: step.type,
    hud: trackTitanHudByType[step.type] || step.title,
  }
}

function trackTitanMode(modeId: TrainingOverlayDurationModeId): TrainingOverlayMode {
  const mode = trackTitanTrainingModes[modeId]
  return {
    id: mode.id,
    title: mode.title,
    duration: mode.duration,
    description: mode.description,
    steps: mode.steps.map(mapTrackTitanStep)
  }
}

export const trainingOverlayCatalog: Record<TrainingOverlayId, TrainingOverlayTraining> = {
  tracktitan_input: {
    id: 'tracktitan_input',
    label: 'TrackTitan',
    title: 'TrackTitan Segment Focus',
    summary: 'Scegli segmento, correggi freno e gas.',
    tone: 'tracktitan',
    accent: '#22c55e',
    accentEnd: '#14b8a6',
    accentRgb: '34, 197, 94',
    accentContrast: '#04110a',
    modes: {
      short30: trackTitanMode('short30'),
      full60: trackTitanMode('full60')
    }
  },

  clean_laps: {
    id: 'clean_laps',
    label: 'Pulizia',
    title: 'Allenamento Pulizia',
    summary: 'Spingi con margine e chiudi giri validi.',
    tone: 'clean',
    accent: '#28b7ff',
    accentEnd: '#4fd1c5',
    accentRgb: '40, 183, 255',
    accentContrast: '#03131f',
    modes: {
      short30: {
        id: 'short30',
        title: '30 min',
        duration: 30,
        description: 'Warm-up, giri validi e recap.',
        steps: [
          { id: 'warmup', title: 'Warm-up', durationMinutes: 10, type: 'warmup', hud: 'Stabilizza gomme, riferimenti e ritmo.' },
          { id: 'clean-work', title: 'Giri validi', durationMinutes: 15, type: 'work', hud: 'Spingi con margine. Chiudi giri validi.' },
          { id: 'recap', title: 'Recap', durationMinutes: 5, type: 'recap', hud: 'Segna invalidi, difficoltà e cose buone.' }
        ]
      },
      full60: {
        id: 'full60',
        title: '60 min',
        duration: 60,
        description: 'Due blocchi validi con review centrale.',
        steps: [
          { id: 'warmup', title: 'Warm-up', durationMinutes: 10, type: 'warmup', hud: 'Stabilizza gomme, riferimenti e ritmo.' },
          { id: 'clean-work-1', title: 'Blocco validi', durationMinutes: 20, type: 'work', hud: 'Spingi con margine. Proteggi i giri validi.' },
          { id: 'review', title: 'Review', durationMinutes: 5, type: 'review', hud: 'Guarda invalidi e scegli un solo punto.' },
          { id: 'clean-work-2', title: 'Ripeti pulito', durationMinutes: 20, type: 'work', hud: 'Correggi quel punto. Non alzare il rischio.' },
          { id: 'recap', title: 'Recap', durationMinutes: 5, type: 'recap', hud: 'Segna lavoro fatto e prossima priorità.' }
        ]
      }
    }
  },

  qualifying: {
    id: 'qualifying',
    label: 'Qualifica',
    title: 'Allenamento Qualifica',
    summary: 'Pochi tentativi, giro valido forte.',
    tone: 'qualifying',
    accent: '#ffcd40',
    accentEnd: '#ff9f1c',
    accentRgb: '255, 205, 64',
    accentContrast: '#1f1302',
    modes: {
      short30: {
        id: 'short30',
        title: '30 min',
        duration: 30,
        description: 'Due stint qualifica con pausa breve.',
        steps: [
          { id: 'warmup', title: 'Warm-up', durationMinutes: 5, type: 'warmup', hud: 'Scalda e prepara riferimenti.' },
          { id: 'qualy-1', title: 'Qualifica 1', durationMinutes: 10, type: 'stint', hud: 'Push lap validi. Pochi tentativi.' },
          { id: 'pause', title: 'Pausa', durationMinutes: 2, type: 'pause', hud: 'Reset rapido. Una correzione.' },
          { id: 'qualy-2', title: 'Qualifica 2', durationMinutes: 10, type: 'stint', hud: 'Ripeti. Porta a casa un giro valido.' },
          { id: 'recap', title: 'Recap', durationMinutes: 3, type: 'recap', hud: 'Segna best valido e punto perso.' }
        ]
      },
      full60: {
        id: 'full60',
        title: '60 min',
        duration: 60,
        description: 'Quattro stint qualifica con reset breve.',
        steps: [
          { id: 'warmup', title: 'Warm-up', durationMinutes: 10, type: 'warmup', hud: 'Scalda e fissa i riferimenti.' },
          { id: 'pause-1', title: 'Pausa', durationMinutes: 2, type: 'pause', hud: 'Reset. Una priorità tecnica.' },
          { id: 'qualy-1', title: 'Qualifica 1', durationMinutes: 10, type: 'stint', hud: 'Push lap validi. Primo riferimento.' },
          { id: 'pause-2', title: 'Pausa', durationMinutes: 2, type: 'pause', hud: 'Scegli una correzione.' },
          { id: 'qualy-2', title: 'Qualifica 2', durationMinutes: 10, type: 'stint', hud: 'Spingi sul giro utile. Tienilo valido.' },
          { id: 'pause-3', title: 'Pausa', durationMinutes: 2, type: 'pause', hud: 'Resta sul punto più costoso.' },
          { id: 'qualy-3', title: 'Qualifica 3', durationMinutes: 10, type: 'stint', hud: 'Giro forte valido, niente miracoli.' },
          { id: 'pause-4', title: 'Pausa', durationMinutes: 2, type: 'pause', hud: 'Ultimo reset. Obiettivo semplice.' },
          { id: 'qualy-4', title: 'Qualifica 4', durationMinutes: 10, type: 'stint', hud: 'Esegui. Porta a casa il giro.' },
          { id: 'recap', title: 'Recap', durationMinutes: 2, type: 'recap', hud: 'Segna best valido e run migliore.' }
        ]
      }
    }
  },

  consistency: {
    id: 'consistency',
    label: 'Costanza',
    title: 'Allenamento Costanza',
    summary: 'Passo gara ripetibile, non best lap.',
    tone: 'consistency',
    accent: '#ff8e29',
    accentEnd: '#ffbf3f',
    accentRgb: '255, 142, 41',
    accentContrast: '#1b0b02',
    modes: {
      short30: {
        id: 'short30',
        title: '30 min',
        duration: 30,
        description: 'Warm-up, stint costante e recap.',
        steps: [
          { id: 'warmup', title: 'Warm-up', durationMinutes: 8, type: 'warmup', hud: 'Trova passo e riferimenti ripetibili.' },
          { id: 'stint', title: 'Stint costante', durationMinutes: 20, type: 'work', hud: 'Passo gara costante. Niente best lap.' },
          { id: 'recap', title: 'Recap', durationMinutes: 2, type: 'recap', hud: 'Segna media, calo e punto debole.' }
        ]
      },
      full60: {
        id: 'full60',
        title: '60 min',
        duration: 60,
        description: 'Due stint da passo gara con review.',
        steps: [
          { id: 'warmup', title: 'Warm-up', durationMinutes: 10, type: 'warmup', hud: 'Prepara passo, fuel e riferimenti.' },
          { id: 'stint-1', title: 'Stint 1', durationMinutes: 20, type: 'work', hud: 'Passo gara. Stesso margine ogni giro.' },
          { id: 'review', title: 'Review', durationMinutes: 5, type: 'review', hud: 'Controlla media, calo e invalidi.' },
          { id: 'stint-2', title: 'Stint 2', durationMinutes: 20, type: 'work', hud: 'Ripeti il passo con una correzione.' },
          { id: 'recap', title: 'Recap', durationMinutes: 5, type: 'recap', hud: 'Segna stabilità e punto fragile.' }
        ]
      }
    }
  },

  race_real: {
    id: 'race_real',
    label: 'Gara vera',
    title: 'Allenamento Gara vera',
    summary: 'Traffico, linee sporche e pressione.',
    tone: 'race',
    accent: '#ff3b22',
    accentEnd: '#ff8a00',
    accentRgb: '255, 59, 34',
    accentContrast: '#170703',
    modes: {
      short30: {
        id: 'short30',
        title: '30 min',
        duration: 30,
        description: 'Gara breve o gruppo con traffico.',
        steps: [
          { id: 'race-30', title: 'LFM o gruppo', durationMinutes: 30, type: 'race', hud: 'Gara vera: traffico, linee sporche, pressione.' }
        ]
      },
      full60: {
        id: 'full60',
        title: '60 min',
        duration: 60,
        description: 'Gara lunga, gruppo o LFM con gestione.',
        steps: [
          { id: 'race-60', title: 'Gara lunga', durationMinutes: 60, type: 'race', hud: "Gara o gruppo lungo. Se c'è pit, provalo." }
        ]
      }
    }
  }
}

export const trainingOverlayOrder: TrainingOverlayId[] = [
  'tracktitan_input',
  'clean_laps',
  'qualifying',
  'consistency',
  'race_real'
]

export const trainingOverlayTrainingList = trainingOverlayOrder.map((id) => trainingOverlayCatalog[id])

export function resolveTrainingOverlayTrainingId(value: unknown): TrainingOverlayId {
  return trainingOverlayOrder.includes(value as TrainingOverlayId) ? value as TrainingOverlayId : 'tracktitan_input'
}

export function resolveTrainingOverlayModeId(value: unknown): TrainingOverlayDurationModeId {
  return value === 'full60' ? 'full60' : 'short30'
}
