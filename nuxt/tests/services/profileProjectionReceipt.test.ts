// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { clearProfileProjectionReceipt, hasProfileProjectionReceipt, rememberProfileProjectionReceipt, PROFILE_PROJECTION_RECEIPT_TTL_MS } from '~/services/auth/profileProjectionReceipt'

beforeEach(() => localStorage.clear())
describe('verified public projection receipt', () => {
  it('reuses only the same UID, exact projection and bounded time window', () => {
    const projection = { nickname: 'Pilot', directory: { role: 'pilot' } }
    rememberProfileProjectionReceipt('u', projection, 100)
    expect(hasProfileProjectionReceipt('u', projection, 101)).toBe(true)
    expect(hasProfileProjectionReceipt('u', projection, 99)).toBe(false)
    expect(hasProfileProjectionReceipt('u', projection, 100 + PROFILE_PROJECTION_RECEIPT_TTL_MS)).toBe(false)
    expect(hasProfileProjectionReceipt('u', { ...projection, nickname: 'New' }, 101)).toBe(false)
    expect(hasProfileProjectionReceipt('other', projection, 101)).toBe(false)
    expect(hasProfileProjectionReceipt('u', projection, 101)).toBe(false)
  })
  it('clears at logout and treats corrupt storage as a cache miss', () => {
    rememberProfileProjectionReceipt('u', {}, 100)
    clearProfileProjectionReceipt()
    expect(hasProfileProjectionReceipt('u', {}, 101)).toBe(false)
    localStorage.setItem('racercore.profile-projection-receipt.v1', 'broken')
    expect(hasProfileProjectionReceipt('u', {}, 101)).toBe(false)
  })
})
