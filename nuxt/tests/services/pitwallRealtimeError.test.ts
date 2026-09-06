import { describe, expect, it } from 'vitest'
import { describePitwallLinkError } from '~/services/pitwall/pitwallLink'

describe('RTDB room access removed', () => {
  it('explains a closed or revoked room without exposing its database path', () => {
    const text = describePitwallLinkError("permission_denied at /pitwallV3/rooms/private-id/access: Client doesn't have permission to access the desired data.")
    expect(text).toMatch(/chiuso.*revocato/)
    expect(text).not.toMatch(/permission|pitwallV3|private-id/)
  })
})
