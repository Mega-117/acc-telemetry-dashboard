import { describe, expect, it } from 'vitest'
import { createPitwallRevisionClock } from '~/services/pitwall/pitwallRoomRevision'

describe('la revisione degli ordini', () => {
  it('parte dai secondi dall epoca, cosi non e mai vecchia dopo una ricarica', () => {
    const next = createPitwallRevisionClock(() => 1_700_000_000_500)
    expect(next()).toBe(1_700_000_000)
  })

  it('non si ripete nello stesso secondo e non torna indietro', () => {
    let clock = 1_700_000_000_000
    const next = createPitwallRevisionClock(() => clock)
    expect(next()).toBe(1_700_000_000)
    expect(next()).toBe(1_700_000_001)
    clock -= 60_000
    expect(next()).toBe(1_700_000_002)
  })
})
