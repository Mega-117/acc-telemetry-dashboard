export interface Insight {
  type: 'positive' | 'negative' | 'neutral' | 'actionable'
  tone?: 'baseline' | 'pace' | 'race' | 'clean' | 'success'
  message: string
  details?: string
  scenario?: CoachBriefingScenario
  ctaLabel?: string
}

export type CoachBriefingScenario =
  | 'no_recent_activity'
  | 'qualify_to_race'
  | 'race_volume_low'
  | 'clean_laps_focus'
  | 'completed_next_step'

export interface CoachBriefingScenarioOption {
  id: CoachBriefingScenario
  label: string
}

const dailySuggestionScenarios: Record<CoachBriefingScenario, Insight> = {
  no_recent_activity: {
    type: 'actionable',
    tone: 'baseline',
    scenario: 'no_recent_activity',
    message: 'Oggi fai Pulizia',
    details: 'Motivo: serve una base pulita. Target: almeno 85% giri validi, senza cercare il tempo.',
    ctaLabel: 'Apri preparazione'
  },
  qualify_to_race: {
    type: 'actionable',
    tone: 'pace',
    scenario: 'qualify_to_race',
    message: 'Oggi fai Costanza',
    details: 'Motivo: il giro buono va reso ripetibile. Target: 8 giri validi entro +0.8 dal best del blocco.',
    ctaLabel: 'Apri preparazione'
  },
  race_volume_low: {
    type: 'actionable',
    tone: 'race',
    scenario: 'race_volume_low',
    message: 'Oggi fai Long run',
    details: 'Motivo: manca lavoro gara recente. Target: 30 min continui, ritmo stabile, 90% giri validi.',
    ctaLabel: 'Apri preparazione'
  },
  clean_laps_focus: {
    type: 'actionable',
    tone: 'clean',
    scenario: 'clean_laps_focus',
    message: 'Oggi fai Qualifica',
    details: 'Motivo: serve prestazione in pochi tentativi. Target: 1 giro valido competitivo per run.',
    ctaLabel: 'Apri preparazione'
  },
  completed_next_step: {
    type: 'actionable',
    tone: 'success',
    scenario: 'completed_next_step',
    message: 'Oggi fai Traffico',
    details: 'Motivo: serve adattamento fuori traiettoria ideale. Target: 3 blocchi puliti senza caos.',
    ctaLabel: 'Apri preparazione'
  }
}

const dailySuggestionScenarioOptions: CoachBriefingScenarioOption[] = [
  { id: 'no_recent_activity', label: 'Pulizia' },
  { id: 'qualify_to_race', label: 'Costanza' },
  { id: 'clean_laps_focus', label: 'Qualifica' },
  { id: 'race_volume_low', label: 'Long run' },
  { id: 'completed_next_step', label: 'Traffico' }
]

export function useCoachInsights() {
  
  // -------------------------------------------------------------
  // HOME PAGE INSIGHTS (Daily Suggestion & Driver State)
  // -------------------------------------------------------------
  
  const getDailySuggestionScenarios = () => dailySuggestionScenarioOptions

  const resolveDailySuggestionScenario = (recentSessions: any[]): CoachBriefingScenario => {
    if (!recentSessions || recentSessions.length === 0) {
      return 'no_recent_activity'
    }

    const totals = recentSessions.reduce(
      (acc, day) => {
        acc.practice += Number(day.practice || 0)
        acc.qualify += Number(day.qualify || 0)
        acc.race += Number(day.race || 0)
        return acc
      },
      { practice: 0, qualify: 0, race: 0 }
    )

    const totalMinutes = totals.practice + totals.qualify + totals.race
    if (totalMinutes <= 0) {
      return 'no_recent_activity'
    }

    if (totals.qualify > totalMinutes * 0.55) {
      return 'qualify_to_race'
    }

    if (totals.race < totalMinutes * 0.25 && totalMinutes >= 45) {
      return 'race_volume_low'
    }

    return 'no_recent_activity'
  }

  const generateDailySuggestion = (recentSessions: any[], forcedScenario?: CoachBriefingScenario | null): Insight => {
    const scenario = forcedScenario || resolveDailySuggestionScenario(recentSessions)
    return dailySuggestionScenarios[scenario]
  }

  const generateDriverState = (recentSessions: any[]): Insight => {
    if (!recentSessions || recentSessions.length === 0) {
      return {
        type: 'neutral',
        message: 'Dati recenti insufficienti.',
        details: 'Lettura ultimi 7 giorni. Serve almeno una sessione recente prima di dare una direzione affidabile.'
      }
    }

    const totals = recentSessions.reduce(
      (acc, day) => {
        acc.practice += Number(day.practice || 0)
        acc.qualify += Number(day.qualify || 0)
        acc.race += Number(day.race || 0)
        return acc
      },
      { practice: 0, qualify: 0, race: 0 }
    )

    const totalMinutes = totals.practice + totals.qualify + totals.race
    if (totalMinutes <= 0) {
      return {
        type: 'neutral',
        message: 'Nessuna attivita recente misurabile.',
        details: 'Lettura ultimi 7 giorni. Le sessioni esistono, ma non hanno durata utile per valutare il lavoro.'
      }
    }

    if (totals.race >= totalMinutes * 0.45) {
      return {
        type: 'positive',
        message: 'Volume gara presente.',
        details: 'Lettura ultimi 7 giorni: hai gia lavoro sul passo. La proposta sopra serve a rendere il lavoro piu mirato.'
      }
    }

    if (totals.qualify >= totalMinutes * 0.5) {
      return {
        type: 'neutral',
        message: 'Molto giro secco, poca verifica sul ritmo.',
        details: 'Lettura ultimi 7 giorni: la velocita potenziale c e, ma va trasformata in passo ripetibile.'
      }
    }

    return {
      type: 'neutral',
      message: 'Volume presente, lavoro da rendere piu strutturato.',
      details: 'Lettura ultimi 7 giorni: la proposta sopra usa volume e tipo sessioni recenti, non ancora obiettivi salvati.'
    }
  }

  // -------------------------------------------------------------
  // SESSION INSIGHTS (Final Read of a Session)
  // -------------------------------------------------------------
  
  const generateSessionInsight = (session: any): Insight => {
    if (!session || !session.stints || session.stints.length === 0) {
      return {
        type: 'neutral',
        message: 'Dati insufficienti per una lettura.'
      }
    }

    let totalLaps = 0
    let validLaps = 0
    let bestLapMs = Infinity
    let avgLapMsSum = 0
    let stintsCount = session.stints.length

    session.stints.forEach((stint: any) => {
      const laps = stint.laps || []
      totalLaps += laps.length
      laps.forEach((lap: any) => {
        if (lap.is_valid && !lap.has_pit_stop) {
          validLaps++
          avgLapMsSum += lap.lap_time_ms
          if (lap.lap_time_ms < bestLapMs) {
            bestLapMs = lap.lap_time_ms
          }
        }
      })
    })

    if (totalLaps === 0) {
      return { type: 'neutral', message: 'Nessun giro registrato.' }
    }

    const invalidRatio = (totalLaps - validLaps) / totalLaps
    
    // Heuristic 1: Dirty session
    if (invalidRatio > 0.4) {
      return {
        type: 'negative',
        message: 'Sessione sporca.',
        details: 'Troppi giri invalidati o errori. Concentrati sulla pulizia prima di spingere.'
      }
    }

    // Heuristic 2: Good long run
    const longestStint = session.stints.reduce((prev: any, current: any) => (prev.laps?.length > current.laps?.length) ? prev : current, {})
    if (longestStint.laps && longestStint.laps.length > 8 && (longestStint.laps.filter((l:any)=>l.is_valid).length / longestStint.laps.length > 0.8)) {
      return {
        type: 'positive',
        message: 'Ottimo long run.',
        details: 'Costanza solida nel stint più lungo. Continua così.'
      }
    }

    // Heuristic 3: Unreliable best
    if (validLaps > 5) {
      const avgMs = avgLapMsSum / validLaps
      // If the best is more than 1.5s faster than the average, it's an outlier
      if (bestLapMs < avgMs - 1500) {
         return {
            type: 'negative',
            message: 'Best poco significativo.',
            details: 'Il tuo giro veloce è molto distante dal passo reale. Concentrati sul ritmo.'
         }
      }
    }

    return {
      type: 'positive',
      message: 'Sessione utile.',
      details: 'Dati raccolti correttamente. Analizza gli stint per i dettagli.'
    }
  }

  // -------------------------------------------------------------
  // STINT COMPARISON INSIGHTS
  // -------------------------------------------------------------
  
  const generateComparisonInsight = (stintA: any, stintB: any): Insight => {
    if (!stintA || !stintB) return { type: 'neutral', message: 'Seleziona due stint.' }
    
    const avgA = stintA.avg_clean_lap || 0
    const avgB = stintB.avg_clean_lap || 0
    
    if (avgA === 0 || avgB === 0) return { type: 'neutral', message: 'Impossibile confrontare (manca avg).' }
    
    const diff = avgB - avgA
    if (Math.abs(diff) < 200) {
       return {
         type: 'neutral',
         message: 'Nessuna differenza sostanziale di passo.',
         details: 'Valuta quale setup ti dà più feeling o usura minore.'
       }
    }
    
    if (diff > 0) {
       return {
         type: 'actionable',
         message: 'Lo Stint A è più veloce.',
         details: "Il setup o l'approccio dello Stint A garantisce un passo migliore."
       }
    } else {
       return {
         type: 'actionable',
         message: 'Lo Stint B è più veloce.',
         details: "Il setup o l'approccio dello Stint B garantisce un passo migliore."
       }
    }
  }

  return {
    getDailySuggestionScenarios,
    generateDailySuggestion,
    generateDriverState,
    generateSessionInsight,
    generateComparisonInsight
  }
}
