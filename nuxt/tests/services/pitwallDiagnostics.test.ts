import { describe, expect, it, vi } from 'vitest'
import { emitPitwallDiagnostic } from '~/services/pitwall/pitwallDiagnostics'

describe('Pitwall diagnostic correlation', () => {
  it('records correlation and bounds the reason without a strategy payload', () => {
    const log = vi.spyOn(console, 'info').mockImplementation(() => {})
    emitPitwallDiagnostic('target_selected', { attemptId: 'attempt-1', uid: 'B', roomId: 'room-1', targetUid: 'A', reason: 'x'.repeat(900) })
    const event = JSON.parse(String(log.mock.calls[0]?.[0]).replace('[PITWALL_DIAGNOSTIC] ', ''))
    expect(event).toMatchObject({ attemptId: 'attempt-1', uid: 'B', targetUid: 'A', roomId: 'room-1' })
    expect(event.reason).toHaveLength(500)
    expect(event).not.toHaveProperty('plan')
    log.mockRestore()
  })
})
