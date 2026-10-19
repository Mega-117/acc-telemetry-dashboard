import { describe, expect, it } from 'vitest'
import {
  CONTROL_K_AUTO_OPEN_INTERVAL_MS,
  pickControlKStatus,
  shouldAutoOpenNotifications,
  type ControlKAutoOpenInput,
} from '~/services/overlay/controlKStatus'

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

describe('Control K notifications policy (PIP-556)', () => {
  const base: ControlKAutoOpenInput = { errors: 1, previousErrors: 0, context: 'pause', otherViewOpen: false, lastAutoOpenAt: null, now: 100_000 }
  const decide = (patch: Partial<ControlKAutoOpenInput>) => shouldAutoOpenNotifications({ ...base, ...patch })

  it('opens by itself in pause for a new error', () => {
    expect(decide({})).toBe(true)
  })

  it('never opens while driving or over another view', () => {
    expect(decide({ context: 'drive' })).toBe(false)
    expect(decide({ otherViewOpen: true })).toBe(false)
  })

  it('opens only for new errors, not for the same or fewer', () => {
    expect(decide({ errors: 1, previousErrors: 1 })).toBe(false)
    expect(decide({ errors: 0, previousErrors: 1 })).toBe(false)
  })

  it('opens at most once every 30 s', () => {
    expect(decide({ lastAutoOpenAt: base.now - CONTROL_K_AUTO_OPEN_INTERVAL_MS + 1 })).toBe(false)
    expect(decide({ lastAutoOpenAt: base.now - CONTROL_K_AUTO_OPEN_INTERVAL_MS })).toBe(true)
  })
})
