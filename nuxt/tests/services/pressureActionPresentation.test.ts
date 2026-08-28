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

  it('distingue pressioni gia corrette da dati mancanti', () => {
    expect(pressureActionPresentation({
      state: 'unavailable',
      recommendation: { status: 'within_tolerance' },
    }).guidance).toBe('Pressioni già nella fascia ottimale.')
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

  it.each([
    ['running', 'In corso', 'Regolazione delle pressioni in corso.'],
    ['completed', 'Completato', 'Pressioni regolate.'],
    ['blocked', 'Bloccato', 'Regolazione non disponibile: controlla lo stato di ACC.'],
  ])('presenta lo stato %s senza invito al clic', (state, stateLabel, guidance) => {
    expect(pressureActionPresentation({ state })).toMatchObject({ stateLabel, guidance })
  })
})
