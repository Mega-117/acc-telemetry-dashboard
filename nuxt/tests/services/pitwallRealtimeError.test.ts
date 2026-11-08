import { afterEach, describe, expect, it } from 'vitest'
import { setLocale } from '~/i18n'
import { describePitwallLinkError } from '~/services/pitwall/pitwallLink'

afterEach(() => setLocale('it'))

describe('RTDB room access removed', () => {
  // PIP-750: nobody closed the Pitwall on 07/11; the text says the real reason, in both languages.
  it('explains a lost room access by its real cause without exposing its database path', () => {
    const raw = "permission_denied at /pitwallRoomsV1/rooms/private-id/access: Client doesn't have permission to access the desired data."
    setLocale('it')
    const text = describePitwallLinkError(raw)
    expect(text).toMatch(/partecipazione è scaduta.*amico.*uscito/)
    expect(text).not.toMatch(/chiuso|permission|pitwallRoomsV1|private-id/)
    setLocale('en')
    expect(describePitwallLinkError(raw)).toMatch(/participation expired.*friend.*left/)
  })

  it('translates the room error keys of entry, exit and open', () => {
    setLocale('it')
    expect(describePitwallLinkError('pitwall.roomErrors.anotherDevice')).toMatch(/altro PC/)
    setLocale('en')
    expect(describePitwallLinkError('pitwall.roomErrors.anotherDevice')).toMatch(/another PC/)
    expect(describePitwallLinkError('pitwall.roomErrors.full')).toBe('This room already has 16 participants.')
  })
})
