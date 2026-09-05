// L'orologio comune del Pit Wall, provato a rami.
//
// Il caso che questi test esistono per non far tornare (PIP-382): il PC del
// pilota con l'orologio avanti di quattro minuti rifiutava ogni strategia come
// "scaduta" un secondo dopo che era partita.
import { describe, expect, it } from 'vitest'
import {
  PITWALL_CLOCK_SKEW_WARN_MS,
  createPitwallServerClock,
  describePitwallClockSkew,
} from '~/services/pitwall/pitwallServerClock'

/** Un orologio locale pilotabile a mano: niente tempo vero nei test. */
function localClock(startMs: number) {
  let value = startMs
  return {
    now: () => value,
    set: (next: number) => { value = next },
  }
}

describe('createPitwallServerClock', () => {
  it('senza misure vale l orologio locale: nessuna finta precisione', () => {
    const local = localClock(1_000)
    const clock = createPitwallServerClock({ now: local.now })

    expect(clock.offsetMs()).toBeNull()
    expect(clock.serverNow()).toBe(1_000)
    expect(clock.toLocalMs(5_000)).toBe(5_000)
    expect(clock.outOfSync()).toBe(false)
  })

  it('misura lo scarto al centro della finestra della scrittura', () => {
    const local = localClock(0)
    const clock = createPitwallServerClock({ now: local.now })

    // Scrittura partita a 1000 e confermata a 1200: il server l'ha datata
    // 241_100, cioe' l'orologio locale e' indietro di circa quattro minuti.
    clock.observe(1_000, 1_200, 241_100)

    expect(clock.offsetMs()).toBe(240_000)
    local.set(2_000)
    expect(clock.serverNow()).toBe(242_000)
    // E il verso inverso: una scadenza del server tradotta per l'applicatore.
    expect(clock.toLocalMs(242_000)).toBe(2_000)
  })

  it('un orologio avanti da uno scarto negativo, ed e comunque fuori sincrono', () => {
    const local = localClock(240_000)
    const clock = createPitwallServerClock({ now: local.now })

    clock.observe(240_000, 240_000, 0)

    expect(clock.offsetMs()).toBe(-240_000)
    expect(clock.serverNow()).toBe(0)
    expect(clock.outOfSync()).toBe(true)
  })

  it('l ultima misura vince: chi sistema l orologio non aspetta una media', () => {
    const local = localClock(0)
    const clock = createPitwallServerClock({ now: local.now })

    clock.observe(0, 0, 240_000)
    expect(clock.offsetMs()).toBe(240_000)

    clock.observe(0, 0, 0)
    expect(clock.offsetMs()).toBe(0)
  })

  it('scarta le misure senza senso invece di peggiorare una stima buona', () => {
    const local = localClock(0)
    const clock = createPitwallServerClock({ now: local.now })
    clock.observe(0, 0, 30_000)

    // Finestra al contrario (orologio locale saltato durante la scrittura).
    clock.observe(500, 100, 90_000)
    // Valori non numerici da un documento malformato.
    clock.observe(Number.NaN, 100, 90_000)
    clock.observe(0, Number.NaN, 90_000)
    clock.observe(0, 100, Number.POSITIVE_INFINITY)

    expect(clock.offsetMs()).toBe(30_000)
  })

  it('sotto la soglia non disturba nessuno', () => {
    const clock = createPitwallServerClock({ now: () => 0 })
    clock.observe(0, 0, PITWALL_CLOCK_SKEW_WARN_MS)
    expect(clock.outOfSync()).toBe(false)

    clock.observe(0, 0, PITWALL_CLOCK_SKEW_WARN_MS + 1)
    expect(clock.outOfSync()).toBe(true)
    // La soglia si puo' stringere da chi chiama, quando la finestra e' piu' corta.
    expect(clock.outOfSync(10_000)).toBe(true)
    expect(clock.outOfSync(60_000)).toBe(false)
  })
})

describe('describePitwallClockSkew', () => {
  it('tace quando non c e niente da dire', () => {
    expect(describePitwallClockSkew(null)).toBeNull()
    expect(describePitwallClockSkew(Number.NaN)).toBeNull()
    expect(describePitwallClockSkew(PITWALL_CLOCK_SKEW_WARN_MS)).toBeNull()
  })

  it('dice il verso giusto: server avanti significa PC indietro', () => {
    const message = describePitwallClockSkew(240_000)
    expect(message).toContain('indietro')
    expect(message).toContain('4 minuti')
  })

  it('il caso reale: PC avanti di quattro minuti', () => {
    const message = describePitwallClockSkew(-240_000)
    expect(message).toContain('avanti')
    expect(message).toContain('4 minuti')
    expect(message).toContain('scadute')
  })

  it('sotto il minuto e mezzo parla in secondi, che e come lo vede l utente', () => {
    expect(describePitwallClockSkew(45_000)).toContain('45 secondi')
  })
})
