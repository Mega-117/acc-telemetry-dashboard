import { afterEach, describe, expect, it, vi } from 'vitest'
import { PitwallRoomError, isDenied, isNetwork, roomErrorCode, roomErrorKey, roomFailure } from '~/services/pitwall/pitwallRoomErrors'
import { translate } from '~/i18n'
import type { TranslationKey } from '~/i18n'

// PIP-750: the cause of a failed entry, exit or open is a closed code for the diary
// and a key the screen translates; the raw SDK text stays in the renderer log.
afterEach(() => vi.restoreAllMocks())

describe('room error codes', () => {
  it('classifies Rules refusals, lost connections and the lifecycle own refusals', () => {
    expect(roomErrorCode(Object.assign(new Error('x'), { code: 'PERMISSION_DENIED' }))).toBe('permission-denied')
    expect(roomErrorCode(new Error('PERMISSION_DENIED: Permission denied'))).toBe('permission-denied')
    expect(roomErrorCode(new Error('Collegamento Pitwall non disponibile. Riprova quando torna online.'))).toBe('network')
    expect(roomErrorCode(Object.assign(new Error('x'), { code: 'unavailable' }))).toBe('network')
    expect(roomErrorCode(new PitwallRoomError('another-device'))).toBe('another-device')
    expect(roomErrorCode(new Error('something else'))).toBe('unknown')
    expect(isDenied(new Error('network down'))).toBe(false)
    expect(isNetwork(new Error('permission_denied'))).toBe(false)
  })

  it('every code has an Italian and an English text', () => {
    const codes = ['in-another-room', 'another-device', 'not-ready', 'full', 'not-allowed', 'view-pending',
      'session-ended', 'network', 'permission-denied', 'unknown'] as const
    for (const code of codes) {
      const key = roomErrorKey(code) as TranslationKey
      expect(translate('it', key)).not.toBe(key)
      expect(translate('en', key)).not.toBe(translate('it', key))
    }
  })

  it('a failure leaves one diagnostic with the code and the raw cause, and returns only the key', () => {
    const lines: string[] = []
    vi.spyOn(console, 'info').mockImplementation((line: unknown) => { lines.push(String(line)) })
    const result = roomFailure('leave', { roomId: 'r1', uid: 'A', connectionId: 'c1' },
      new PitwallRoomError('not-allowed', new Error('PERMISSION_DENIED at /pitwallRoomsV1/rooms/r1')))
    expect(result).toEqual({ ok: false, code: 'not-allowed', reason: 'pitwall.roomErrors.notAllowed' })
    expect(lines).toHaveLength(1)
    const row = JSON.parse(lines[0]!.replace('[PITWALL_DIAGNOSTIC] ', ''))
    expect(row).toMatchObject({ event: 'room_leave_failed', code: 'not-allowed', roomId: 'r1', uid: 'A', connectionId: 'c1' })
    expect(row.reason).toContain('PERMISSION_DENIED')
  })
})
