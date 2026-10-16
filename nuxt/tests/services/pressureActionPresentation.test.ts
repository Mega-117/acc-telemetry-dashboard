import { describe, expect, it } from 'vitest'
import { pressureActionPresentation, pressureOriginLine, pressureOutcomeMessage, pressureProgressBadge } from '~/services/overlay/pressureActionPresentation'

describe('pressureActionPresentation', () => {
  it('keeps the actual reason visible for recoverable and uncertain failures', () => {
    expect(pressureActionPresentation({ state: 'ready', actionReasonCode: 'pressure_precondition_failed', reason: 'Telemetria non fresca.' }).guidance).toBe('Telemetria non fresca.')
    expect(pressureActionPresentation({ state: 'blocked', reason: 'Esito incerto: controlla i PSI.' }).guidance).toBe('Esito incerto: controlla i PSI.')
  })
  it('PIP-552: asks to stop the car, at the box or on the grid, while retaining a ready recommendation', () => {
    const result = pressureActionPresentation({ state: 'unavailable', reason: 'pit_pause_required', recommendation: { status: 'ready' } })
    expect(result.alert?.guidance).toContain('ai box o in griglia')
    expect(result.buttonLabel).toBe('Regola pressioni · da fermo')
    expect(result.guidance).not.toContain('giri')
  })

  it('PIP-552: origin line of a retained correction, with missing parts left out', () => {
    expect(pressureOriginLine({ session_type: 1, stint_number: 1, source_lap: 5, air_temp_c: 26.4 }))
      .toBe('Calcolata in Qualifica · stint 1 · giro 5 · aria 26 °C')
    expect(pressureOriginLine({ session_type: 0, stint_number: 2, source_lap: 7, air_temp_c: null }))
      .toBe('Calcolata in Prove libere · stint 2 · giro 7')
    expect(pressureOriginLine({ session_type: 2 })).toBe('Calcolata in Gara')
    expect(pressureOriginLine({ session_type: null, source_lap: 4 })).toBe('Calcolata · giro 4')
    expect(pressureOriginLine({})).toBeNull()
    expect(pressureOriginLine(null)).toBeNull()
  })
  it('does not mention lap validity when the producer disables that requirement', () => {
    expect(pressureActionPresentation({
      state: 'unavailable',
      recommendation: { status: 'waiting_for_laps', completed_laps: 2,
        required_completed_laps: 3, valid_laps: 0, required_valid_laps: 0 },
    }).guidance).toBe('Completa 3 giri (2/3).')
  })

  it('invita all unica azione quando la correzione e pronta', () => {
    expect(pressureActionPresentation({ state: 'ready' })).toEqual({
      stateLabel: 'Pronto',
      guidance: 'Correzione pronta: premi Regola pressioni.',
      ariaLabel: 'Regola pressioni nel Setup ACC: correzione pronta',
    })
  })

  it('mantiene pronta l azione e guida al menu Pausa dopo un rifiuto recuperabile', () => {
    expect(pressureActionPresentation({
      state: 'ready',
      actionReasonCode: 'pause_menu_required',
    })).toEqual({
      stateLabel: 'Pronto',
      guidance: 'Vai al menu Pausa e riprova.',
      ariaLabel: 'Regola pressioni pronta: vai al menu Pausa e riprova',
    })

    expect(pressureActionPresentation({
      state: 'ready',
      actionReasonCode: 'pit_pause_required',
    }).guidance).toBe('Ferma l’auto (ai box o in griglia) e apri il menu Pausa.')
  })

  it('spiega i prerequisiti senza nascondere l azione', () => {
    expect(pressureActionPresentation({
      state: 'unavailable',
      recommendation: {
        status: 'waiting_for_laps',
        completed_laps: 2,
        valid_laps: 1,
        required_completed_laps: 3,
        required_valid_laps: 1,
      },
    }).guidance).toBe('Completa 3 giri, di cui almeno 1 valido (2/3, validi 1/1).')
  })

  it('segnala in modo prominente che proprio l ultimo giro e invalido', () => {
    expect(pressureActionPresentation({
      state: 'unavailable',
      recommendation: {
        status: 'waiting_for_valid_lap',
        completed_laps: 6,
        valid_laps: 4,
        required_completed_laps: 3,
        required_valid_laps: 1,
      },
    })).toMatchObject({
      stateLabel: 'Non disponibile',
      guidance: 'L’ultimo giro è invalido. Completa un nuovo giro valido.',
      buttonLabel: 'Serve un giro valido',
      alert: {
        title: 'ULTIMO GIRO NON VALIDO',
        guidance: 'Completa un nuovo giro valido per sbloccare la regolazione.',
      },
    })

    const initialRequirement = pressureActionPresentation({
      state: 'unavailable',
      recommendation: {
        status: 'waiting_for_valid_lap',
        completed_laps: 3,
        valid_laps: 0,
        required_completed_laps: 3,
        required_valid_laps: 1,
      },
    })
    expect(initialRequirement).toMatchObject({
      guidance: 'Completa almeno un giro valido.',
    })
    expect(initialRequirement.alert).toBeUndefined()
    expect(initialRequirement.buttonLabel).toBeUndefined()
  })

  it('distingue pressioni gia corrette da dati mancanti', () => {
    expect(pressureActionPresentation({
      state: 'unavailable',
      recommendation: { status: 'within_tolerance' },
    }).guidance).toBe('Pressioni già nella fascia ottimale.')
  })

  it('dice che le pressioni sono in assestamento invece di "non disponibile"', () => {
    const result = pressureActionPresentation({
      state: 'unavailable',
      recommendation: { status: 'waiting_for_stable_pressure' },
    })
    expect(result.stateLabel).toBe('In assestamento')
    expect(result.guidance).toBe('Pressioni ancora in assestamento: completa un altro giro.')
  })

  it('distingue un piano pronto ma non ancora applicabile dai giri mancanti', () => {
    expect(pressureActionPresentation({
      state: 'unavailable',
      testReady: false,
      recommendation: { status: 'ready' },
    }).guidance).toBe('Ferma l’auto (ai box o in griglia) e apri il menu Pausa.')
  })

  it('riconosce un piano gia consumato', () => {
    expect(pressureActionPresentation({
      state: 'unavailable',
      consumed: true,
      recommendation: { status: 'ready' },
    }).guidance).toBe('Questa correzione è già stata applicata.')
  })

  it('spiega che il piano resta sospeso nella griglia Setup', () => {
    expect(pressureActionPresentation({
      state: 'unavailable',
      reason: 'setup_menu_open',
      recommendation: { status: 'ready' },
    })).toEqual({
      stateLabel: 'Sospesa',
      guidance: 'Esci dal Setup e torna al menu Pausa: la correzione resta pronta.',
      ariaLabel: 'Regola pressioni sospesa: esci dal Setup e torna al menu Pausa',
      buttonLabel: 'Esci dal Setup',
    })
  })

  it('richiede un nuovo stint quando cambia il set montato', () => {
    expect(pressureActionPresentation({
      state: 'unavailable',
      reason: 'tyre_set_changed',
      recommendation: { status: 'ready' },
    })).toMatchObject({
      guidance: 'Il set gomme montato è cambiato. Completa un nuovo stint per ricalcolare le pressioni.',
      buttonLabel: 'Serve un nuovo stint',
    })
  })

  it.each([
    ['running', 'In corso', 'Regolazione delle pressioni in corso.'],
    ['completed', 'Completato', 'Pressioni regolate.'],
    ['blocked', 'Bloccato', 'Regolazione non disponibile: controlla lo stato di ACC.'],
  ])('presenta lo stato %s senza invito al clic', (state, stateLabel, guidance) => {
    expect(pressureActionPresentation({ state })).toMatchObject({ stateLabel, guidance })
  })
})

describe('PIP-522 badge and outcome messages', () => {
  it('shows lap progress on the button only while laps are missing', () => {
    expect(pressureProgressBadge({ state: 'unavailable', recommendation: { completed_laps: 1, required_completed_laps: 3 } })).toBe('1/3')
    expect(pressureProgressBadge({ state: 'unavailable', recommendation: { completed_laps: 3, required_completed_laps: 3 } })).toBeNull()
    expect(pressureProgressBadge({ state: 'ready', recommendation: { completed_laps: 0 } })).toBeNull()
    expect(pressureProgressBadge({ state: 'unavailable', consumed: true, recommendation: { completed_laps: 0 } })).toBeNull()
    expect(pressureProgressBadge({ state: 'unavailable' })).toBeNull()
  })
  it('turns only command outcomes into messages', () => {
    expect(pressureOutcomeMessage({ state: 'unavailable', reason: 'waiting_for_valid_lap' })).toBeNull()
    expect(pressureOutcomeMessage({ state: 'ready' })).toBeNull()
    expect(pressureOutcomeMessage({ state: 'unavailable', reason: 'pit_pause_required', actionReasonCode: 'pit_pause_required' })).toBeNull()
    expect(pressureOutcomeMessage({ state: 'completed' })).toEqual({ text: 'Pressioni regolate.', tone: 'ok' })
    expect(pressureOutcomeMessage({ state: 'running' })?.tone).toBe('progress')
    expect(pressureOutcomeMessage({ state: 'blocked', reason: 'Setup non trovato.' })).toEqual({ text: 'Setup non trovato.', tone: 'error' })
    expect(pressureOutcomeMessage({ state: 'ready', actionReasonCode: 'pause_menu_required' })?.tone).toBe('error')
  })
})
