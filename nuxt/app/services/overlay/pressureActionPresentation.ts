export interface PressureActionInput {
  state?: string | null
  reason?: string | null
  actionReasonCode?: string | null
  testReady?: boolean | null
  consumed?: boolean | null
  recommendation?: {
    status?: string | null
    completed_laps?: number | null
    valid_laps?: number | null
    required_completed_laps?: number | null
    required_valid_laps?: number | null
  } | null
}

export interface PressureActionPresentation {
  stateLabel: string
  guidance: string
  ariaLabel: string
}

function finiteCount(value: unknown, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : fallback
}

function unavailableGuidance(input: PressureActionInput): string {
  const recommendation = input.recommendation
  const reason = recommendation?.status || input.reason

  if (input.consumed === true) return 'Questa correzione è già stata applicata.'
  if (reason === 'within_tolerance') return 'Pressioni già nella fascia ottimale.'
  if (reason === 'ready' && input.testReady !== true) return 'Ferma l’auto ai box e apri il menu Pausa.'
  if (reason === 'waiting_for_valid_lap') return 'Completa almeno un giro valido.'
  if (reason === 'compound_unavailable') return 'Mescola non ancora rilevata.'
  if (reason === 'source_unavailable') return 'Dati delle pressioni non ancora disponibili.'
  if (reason === 'click_limit_exceeded') return 'Correzione oltre il limite di sicurezza.'
  if (reason === 'telemetry_not_fresh') return 'Telemetria ACC non disponibile.'

  const completed = finiteCount(recommendation?.completed_laps, 0)
  const required = finiteCount(recommendation?.required_completed_laps, 3)
  const valid = finiteCount(recommendation?.valid_laps, 0)
  const requiredValid = finiteCount(recommendation?.required_valid_laps, 1)
  return `Completa ${required} giri, di cui almeno ${requiredValid} valido (${completed}/${required}, validi ${valid}/${requiredValid}).`
}

export function pressureActionPresentation(input: PressureActionInput | null | undefined): PressureActionPresentation {
  const state = input?.state || 'unavailable'

  if (state === 'ready') {
    if (input?.actionReasonCode === 'pit_pause_required') {
      return {
        stateLabel: 'Pronto',
        guidance: 'Torna ai box, ferma l’auto e apri il menu Pausa.',
        ariaLabel: 'Regola pressioni pronta: torna ai box e apri il menu Pausa',
      }
    }
    if (input?.actionReasonCode === 'pause_menu_required') {
      return {
        stateLabel: 'Pronto',
        guidance: 'Vai al menu Pausa e riprova.',
        ariaLabel: 'Regola pressioni pronta: vai al menu Pausa e riprova',
      }
    }
    return {
      stateLabel: 'Pronto',
      guidance: 'Correzione pronta: premi Regola pressioni.',
      ariaLabel: 'Regola pressioni nel Setup ACC: correzione pronta',
    }
  }
  if (state === 'running') {
    return {
      stateLabel: 'In corso',
      guidance: 'Regolazione delle pressioni in corso.',
      ariaLabel: 'Regola pressioni nel Setup ACC: regolazione in corso',
    }
  }
  if (state === 'completed') {
    return {
      stateLabel: 'Completato',
      guidance: 'Pressioni regolate.',
      ariaLabel: 'Regola pressioni nel Setup ACC: regolazione completata',
    }
  }
  if (state === 'blocked') {
    return {
      stateLabel: 'Bloccato',
      guidance: 'Regolazione non disponibile: controlla lo stato di ACC.',
      ariaLabel: 'Regola pressioni nel Setup ACC: regolazione bloccata',
    }
  }

  const guidance = unavailableGuidance(input || {})
  return {
    stateLabel: 'Non disponibile',
    guidance,
    ariaLabel: `Regola pressioni nel Setup ACC: ${guidance}`,
  }
}
