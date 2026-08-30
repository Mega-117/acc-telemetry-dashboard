import { describe, expect, it } from 'vitest'
import { pressureActionPresentation } from '~/services/overlay/pressureActionPresentation'

describe('pressureActionPresentation', () => {
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
    }).guidance).toBe('Torna ai box, ferma l’auto e apri il menu Pausa.')
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

  it('chiede un giro regolare quando le pressioni non sono ancora stabili', () => {
    expect(pressureActionPresentation({
      state: 'unavailable',
      recommendation: { status: 'waiting_for_stable_pressure' },
    }).guidance).toBe('Completa un altro giro regolare per stabilizzare le pressioni.')
  })

  it('distingue un piano pronto ma non ancora applicabile dai giri mancanti', () => {
    expect(pressureActionPresentation({
      state: 'unavailable',
      testReady: false,
      recommendation: { status: 'ready' },
    }).guidance).toBe('Ferma l’auto ai box e apri il menu Pausa.')
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
