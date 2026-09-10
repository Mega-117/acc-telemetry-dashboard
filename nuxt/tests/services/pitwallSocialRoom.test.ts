import { describe, expect, it } from 'vitest'
import { eligibleSocialDrivers, nextSocialExpiry, resolveSocialTarget, socialMemberUids, type SocialOccupancy } from '~/services/pitwall/pitwallSocialRoom'

describe('social room lifetime', () => {
  const occupancy: SocialOccupancy = {
    A: { a: { nickname: 'A', connectedAt: 100, disconnectedAt: 1000 } },
    B: { b: { nickname: 'B', connectedAt: 100, disconnectedAt: null } },
  }
  it('retains disconnected creator for 30 seconds, then retains other members', () => {
    expect(socialMemberUids(occupancy, 30999)).toEqual(['A', 'B'])
    expect(socialMemberUids(occupancy, 31000)).toEqual(['B'])
    expect(nextSocialExpiry(occupancy, 1000)).toBe(31000)
    expect(nextSocialExpiry(occupancy, 31000)).toBeNull()
  })
  it('empty and fully expired rooms have no living members', () => {
    expect(socialMemberUids({}, 100)).toEqual([])
    expect(socialMemberUids({ A: occupancy.A! }, 31000)).toEqual([])
  })
})

describe('explicit strategy recipient', () => {
  const driver = (uid: string, connectionId = uid) => ({ uid, connectionId, kind: 'driver', driving: true, connected: true })
  it('keeps both drivers even in different sessions, excluding ambiguous duplicate runtimes', () => {
    expect(eligibleSocialDrivers([driver('A'), driver('C')]).map(d => d.uid)).toEqual(['A', 'C'])
    expect(eligibleSocialDrivers([driver('A'), driver('A', 'a2'), driver('C')]).map(d => d.uid)).toEqual(['C'])
  })
  it('selects only the initial sole driver and never redirects an existing choice', () => {
    expect(resolveSocialTarget([driver('A')], null, false).selectedUid).toBe('A')
    expect(resolveSocialTarget([driver('A'), driver('C')], null, false).target).toBeNull()
    expect(resolveSocialTarget([driver('C')], 'A', true)).toEqual({ selectedUid: 'A', target: null })
    expect(resolveSocialTarget([driver('C')], null, true).target).toBeNull()
  })
})
