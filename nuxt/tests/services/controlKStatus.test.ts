// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { notificationErrorFromElement, notificationItemFromElement, pickControlKStatus, readableReason } from '~/services/overlay/controlKStatus'

const card = (className: string, html: string) => {
  const element = document.createElement('div')
  element.className = className
  element.innerHTML = html
  return element
}

describe('notification kinds (PIP-556)', () => {
  it('a pending decision is an action, never cleared nor announced', () => {
    expect(notificationItemFromElement(card('pressure-plan', '<strong>Obiettivo 26,5 psi</strong>'))).toMatchObject({ kind: 'action', announce: false })
    expect(notificationItemFromElement(card('control-k-request', '<strong>Pilota QA</strong>'))).toMatchObject({ kind: 'action', announce: false })
  })

  it('an error is announced in the status line, except friend requests', () => {
    expect(notificationItemFromElement(card('fuel-status fuel-status--error', '<p>Carburante non disponibile.</p>'))).toMatchObject({ kind: 'error', announce: true, label: 'Benzina: Carburante non disponibile.' })
    expect(notificationItemFromElement(card('control-k-request', '<p class="control-k-request__error">Rete assente.</p>'))).toMatchObject({ kind: 'error', announce: false })
  })

  it('an outcome is information read once; new values are new information', () => {
    const first = notificationItemFromElement(card('pressure-test__result', '<strong>Stima</strong><dd>25,9</dd>'))
    const second = notificationItemFromElement(card('pressure-test__result', '<strong>Stima</strong><dd>26,1</dd>'))
    expect(first.kind).toBe('info')
    expect(first.key).not.toBe(second.key)
  })
})

describe('Control K status line (PIP-556)', () => {
  it('shows one message: error > progress > ok > hint', () => {
    const hint = { tone: 'hint' as const, text: 'Timer: avvia un conto alla rovescia.' }
    const ok = { tone: 'ok' as const, text: 'Pressioni applicate.' }
    const progress = { tone: 'progress' as const, text: 'Leggo il setup…' }
    const error = { tone: 'error' as const, text: 'Carburante non applicato.' }
    expect(pickControlKStatus([hint, ok, progress, error])).toEqual(error)
    expect(pickControlKStatus([hint, ok, progress])).toEqual(progress)
    expect(pickControlKStatus([hint, ok])).toEqual(ok)
    expect(pickControlKStatus([hint])).toEqual(hint)
  })

  it('keeps the first message of the same priority and ignores empty ones', () => {
    expect(pickControlKStatus([null, false, undefined, { tone: 'ok', text: '  ' }])).toBeNull()
    expect(pickControlKStatus([{ tone: 'ok', text: 'A' }, { tone: 'ok', text: 'B' }])?.text).toBe('A')
  })
})

describe('driver-readable reasons (PIP-556)', () => {
  it('turns the technical tags seen on 19/10 into plain words', () => {
    expect(readableReason('Leggo condizioni e setup…: [visione:pausa-setup] Avvia Pressioni Test dal menu pausa con Setup disponibile, ai box o in griglia.'))
      .toBe('Apri il menu pausa (ESC) ai box o in griglia e riprova.')
    expect(readableReason('[dati:stale] Dati ACC scaduti o timestamp non valido.')).toBe('Dati di ACC non aggiornati: riprova tra un istante.')
  })

  it('drops unknown tags and keeps the human part', () => {
    expect(readableReason('[input:setup_key] Tasto non inviato.')).toBe('Tasto non inviato.')
    expect(readableReason('Carburante non disponibile.')).toBe('Carburante non disponibile.')
    expect(readableReason('')).toBe('Operazione non riuscita.')
  })
})

describe('notification errors (PIP-556)', () => {
  it('labels each error card with its category and a readable reason', () => {
    const card = document.createElement('div')
    card.className = 'fuel-status fuel-status--error'
    card.innerHTML = '<strong>Problema carburante</strong><p>Menu Pausa riconosciuto: NO. Apri il menu pausa.</p>'
    expect(notificationErrorFromElement(card)).toEqual({
      key: 'Benzina|Menu Pausa riconosciuto: NO. Apri il menu pausa.',
      label: 'Benzina: Menu Pausa riconosciuto: NO. Apri il menu pausa.',
    })
    const estimate = document.createElement('div')
    estimate.className = 'launcher-hint pressure-test__error'
    estimate.innerHTML = '<p>[dati:stale] Dati ACC scaduti.</p>'
    expect(notificationErrorFromElement(estimate).label).toBe('Stima pressioni: Dati di ACC non aggiornati: riprova tra un istante.')
  })
})
