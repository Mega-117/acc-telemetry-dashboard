// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { expireOutcomeCards, notificationErrorFromElement, notificationItemFromElement, notificationRank, OUTCOME_VISIBLE_MS, pickControlKStatus,
  readableReason } from '~/services/overlay/controlKStatus'
import { setLocale } from '~/i18n'

// Assertions below read the Italian texts (jsdom starts in English).
setLocale('it')

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

  it('recognises friend request errors by their card, whatever the interface language', () => {
    setLocale('en')
    try {
      expect(notificationItemFromElement(card('control-k-request', '<p class="control-k-request__error">No network.</p>')))
        .toMatchObject({ kind: 'error', announce: false, label: 'Friends: No network.' })
      expect(notificationItemFromElement(card('fuel-status fuel-status--error', '<p>[dati:stale] x</p>')))
        .toMatchObject({ kind: 'error', announce: true, label: 'Fuel: ACC data not up to date: try again in a moment.' })
    } finally { setLocale('it') }
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

describe('notification order and outcomes that leave (PIP-697)', () => {
  const request = notificationItemFromElement(card('control-k-request', '<strong>Pilota QA</strong> vuole essere tuo amico'))
  const plan = notificationItemFromElement(card('pressure-plan', '<strong>Obiettivo 26,5 psi</strong>'))
  const error = notificationItemFromElement(card('launcher-hint fuel-status fuel-status--error', '<p>Menu Pausa non trovato.</p>'))
  const applied = notificationItemFromElement(card('launcher-hint quick-panel-pressure-status quick-panel-pressure-status--ok', '<p>Pressioni applicate.</p>'))

  it('a friend request is on the first page, before errors, plans and outcomes', () => {
    const sorted = [applied, plan, error, request].sort((a, b) => notificationRank(a) - notificationRank(b))
    expect(sorted.map(item => item.kind)).toEqual(['action', 'error', 'action', 'info'])
    expect(sorted[0]).toBe(request)
    expect(sorted[2]).toBe(plan)
  })
  it('an outcome leaves after its time; decisions and errors never expire', () => {
    const seenAt = new Map<string, number>()
    const items = [applied, plan, error, request]
    expect(expireOutcomeCards(items, seenAt, 1000)).toEqual({ expired: [], nextInMs: OUTCOME_VISIBLE_MS })
    expect(expireOutcomeCards(items, seenAt, 1000 + OUTCOME_VISIBLE_MS - 1).expired).toEqual([])
    expect(expireOutcomeCards(items, seenAt, 1000 + OUTCOME_VISIBLE_MS)).toEqual({ expired: [applied.key], nextInMs: null })
  })
  it('a new outcome starts its own time; a card that left is forgotten', () => {
    const seenAt = new Map<string, number>()
    expireOutcomeCards([applied], seenAt, 0)
    const fuel = notificationItemFromElement(card('launcher-hint fuel-status', '<p>Carburante impostato: 62 L.</p>'))
    expect(expireOutcomeCards([applied, fuel], seenAt, 4000).nextInMs).toBe(OUTCOME_VISIBLE_MS - 4000)
    expireOutcomeCards([fuel], seenAt, 5000)
    expect([...seenAt.keys()]).toEqual([fuel.key])
  })
})
