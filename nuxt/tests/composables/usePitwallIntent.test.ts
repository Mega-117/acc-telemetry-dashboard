import { beforeEach, describe, expect, it } from 'vitest'
import {
  PITWALL_INTENT_UNAVAILABLE,
  registerPitwallIntentControls,
  requestPitwallClose,
  requestPitwallOpen,
  resetPitwallIntentForTests,
  setPitwallIntentStatus,
  usePitwallIntent,
} from '~/composables/usePitwallIntent'

beforeEach(() => resetPitwallIntentForTests())

describe('l intento del pilota', () => {
  it('senza un lato pilota registrato non e disponibile e lo dice, invece di far finta', async () => {
    const { pitwallIntent } = usePitwallIntent()
    expect(pitwallIntent.value).toEqual({ state: 'off', roomId: null, reason: null, available: false })
    expect(await requestPitwallOpen()).toEqual({ ok: false, reason: PITWALL_INTENT_UNAVAILABLE })
    expect(await requestPitwallClose()).toEqual({ ok: false, reason: PITWALL_INTENT_UNAVAILABLE })
  })

  it('con il lato pilota registrato, aprire e chiudere arrivano a lui e lo stato che racconta si legge da tutti', async () => {
    const calls: string[] = []
    registerPitwallIntentControls({
      open: async () => { calls.push('open') },
      close: async () => { calls.push('close') },
    })
    const { pitwallIntent } = usePitwallIntent()

    expect(await requestPitwallOpen()).toEqual({ ok: true, reason: null })
    setPitwallIntentStatus({ state: 'arming', roomId: null, reason: 'Si apre appena ACC e in sessione.' })
    expect(pitwallIntent.value).toEqual({ state: 'arming', roomId: null, reason: 'Si apre appena ACC e in sessione.', available: true })

    setPitwallIntentStatus({ state: 'open', roomId: 'gara-1', reason: null })
    expect(pitwallIntent.value.state).toBe('open')
    expect(pitwallIntent.value.roomId).toBe('gara-1')

    expect(await requestPitwallClose()).toEqual({ ok: true, reason: null })
    expect(calls).toEqual(['open', 'close'])
  })

  it('quando il lato pilota si toglie, lo stato torna spento e non disponibile', () => {
    registerPitwallIntentControls({ open: async () => {}, close: async () => {} })
    setPitwallIntentStatus({ state: 'open', roomId: 'gara-1', reason: null })
    registerPitwallIntentControls(null)
    expect(usePitwallIntent().pitwallIntent.value).toEqual({ state: 'off', roomId: null, reason: null, available: false })
  })
})
