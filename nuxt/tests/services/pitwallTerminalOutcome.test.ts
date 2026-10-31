import { describe, expect, it } from 'vitest'
import { terminalPitwallOutcome } from '~/services/pitwall/pitwallRealtimeDriver'

describe('PIP-371: what the engineer sees when ACC cannot apply yet', () => {
  it('"waiting" (car not in the pits) is not applied, with its real reason, never a failure', () => {
    expect(terminalPitwallOutcome({ status: 'waiting', reason: 'Aspetta il rientro ai box.' }))
      .toEqual({ status: 'rejected', reason: 'Aspetta il rientro ai box.' })
    expect(terminalPitwallOutcome({ status: 'waiting' }))
      .toEqual({ status: 'rejected', reason: 'Impedimento rilevato: occorre un nuovo invio manuale.' })
  })
  it('real outcomes pass through; anything unknown is a rejection, not a false success', () => {
    for (const status of ['applied', 'partial', 'failed', 'rejected']) expect(terminalPitwallOutcome({ status }).status).toBe(status)
    expect(terminalPitwallOutcome({ status: 'mystery' }).status).toBe('rejected')
  })
})
