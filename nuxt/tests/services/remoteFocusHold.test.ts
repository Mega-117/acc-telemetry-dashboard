import { describe, expect, it } from 'vitest'
import {
  REMOTE_FOCUS_HOLD_MS,
  emptyRemoteFocusLatch,
  holdsRemoteFocus,
  isLocalCarPhysicsAlive,
  trackRemoteFocus,
} from '~/services/overlay/spectatorTelemetry'

function envelope(localIndex: number | null, focusedIndex: number | null) {
  return {
    status: 'available' as const,
    snapshot: {
      session: { local_car_index: localIndex, focused_car_index: focusedIndex },
      cars: [],
    },
  } as any
}

const UNAVAILABLE = { status: 'unavailable' as const, reason: 'local-car-missing', snapshot: null } as any

function local(overrides: Record<string, unknown> = {}) {
  return {
    isFresh: true,
    isLive: true,
    isEngineRunning: true,
    maxRpm: 8000,
    fuelL: 62,
    tyres: [{ pressurePsi: 23.4 }],
    ...overrides,
  } as any
}

const PARKED = local({
  isEngineRunning: false, maxRpm: 0, fuelL: 0, tyres: [{ pressurePsi: 0 }],
})

describe('aggancio dell inquadratura remota', () => {
  it('solo un envelope valido decide se il focus e remoto', () => {
    let latch = emptyRemoteFocusLatch()
    latch = trackRemoteFocus(latch, envelope(1023, 1024), 1_000)
    expect(latch).toEqual({ remote: true, unavailableSinceMs: null })

    latch = trackRemoteFocus(latch, envelope(1023, 1023), 2_000)
    expect(latch).toEqual({ remote: false, unavailableSinceMs: null })
  })

  it('un envelope senza indici validi non cambia cio che sapevamo', () => {
    const observing = trackRemoteFocus(emptyRemoteFocusLatch(), envelope(1023, 1024), 1_000)
    const latch = trackRemoteFocus(observing, envelope(null, 1024), 1_500)

    expect(latch.remote).toBe(true)
    expect(latch.unavailableSinceMs).toBe(1_500)
  })

  it('ricorda il primo istante di silenzio, non l ultimo', () => {
    let latch = trackRemoteFocus(emptyRemoteFocusLatch(), envelope(1023, 1024), 1_000)
    latch = trackRemoteFocus(latch, UNAVAILABLE, 2_000)
    latch = trackRemoteFocus(latch, UNAVAILABLE, 3_000)

    expect(latch.unavailableSinceMs).toBe(2_000)
  })

  it('col feed vivo comanda il feed, non la macchina', () => {
    const latch = trackRemoteFocus(emptyRemoteFocusLatch(), envelope(1023, 1024), 1_000)
    expect(holdsRemoteFocus(latch, local(), 9_999_999)).toBe(true)
  })

  it('durante un buco breve si resta mascherati', () => {
    let latch = trackRemoteFocus(emptyRemoteFocusLatch(), envelope(1023, 1024), 1_000)
    latch = trackRemoteFocus(latch, UNAVAILABLE, 2_000)

    expect(holdsRemoteFocus(latch, local(), 2_000 + REMOTE_FOCUS_HOLD_MS - 1)).toBe(true)
  })

  it('feed muto e macchina viva: il pilota sta guidando, si torna al locale', () => {
    // PIP-305: il fail-closed era permanente e con local_car_index mai valido
    // il pilota guidava vedendo la grafica da spettatore.
    let latch = trackRemoteFocus(emptyRemoteFocusLatch(), envelope(1023, 1024), 1_000)
    latch = trackRemoteFocus(latch, UNAVAILABLE, 2_000)

    expect(holdsRemoteFocus(latch, local(), 2_000 + REMOTE_FOCUS_HOLD_MS)).toBe(false)
  })

  it('feed muto e macchina ferma: non si sa dove guardi, si resta mascherati', () => {
    let latch = trackRemoteFocus(emptyRemoteFocusLatch(), envelope(1023, 1024), 1_000)
    latch = trackRemoteFocus(latch, UNAVAILABLE, 2_000)

    expect(holdsRemoteFocus(latch, PARKED, 2_000 + 60_000)).toBe(true)
  })

  it('mai remoto: nessun mascheramento, qualunque cosa faccia il feed', () => {
    const latch = trackRemoteFocus(emptyRemoteFocusLatch(), UNAVAILABLE, 1_000)
    expect(holdsRemoteFocus(latch, PARKED, 999_999)).toBe(false)
  })

  it('basta un solo segno di vita della macchina', () => {
    expect(isLocalCarPhysicsAlive(PARKED)).toBe(false)
    expect(isLocalCarPhysicsAlive(local({ maxRpm: 0, fuelL: 0, tyres: [{ pressurePsi: 23 }], isEngineRunning: false }))).toBe(true)
    expect(isLocalCarPhysicsAlive(local({ maxRpm: 0, fuelL: 61, tyres: [], isEngineRunning: false }))).toBe(true)
    expect(isLocalCarPhysicsAlive(local({ maxRpm: 8000, fuelL: 0, tyres: [], isEngineRunning: false }))).toBe(true)
    // Telemetria non fresca o non live non e' una macchina viva.
    expect(isLocalCarPhysicsAlive(local({ isFresh: false }))).toBe(false)
    expect(isLocalCarPhysicsAlive(local({ isLive: false }))).toBe(false)
  })
})
