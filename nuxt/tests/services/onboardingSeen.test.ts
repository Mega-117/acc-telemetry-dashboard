import { describe, expect, it } from 'vitest'
import {
  BROWSER_INSTALLATION_ID,
  onboardingSeenKey,
  readOnboardingStatus,
  writeOnboardingStatus,
} from '~/services/onboarding/onboardingSeen'

function memoryStorage() {
  const map = new Map<string, string>()
  return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => { map.set(k, v) }, map }
}

describe('onboardingSeen (PIP-571)', () => {
  it('keys the status per user and per installation, with a browser fallback', () => {
    expect(onboardingSeenKey('u1', 'inst-a')).toBe('racercore.onboarding.seen.v1:u1:inst-a')
    expect(onboardingSeenKey('u1', '')).toBe(`racercore.onboarding.seen.v1:u1:${BROWSER_INSTALLATION_ID}`)
  })

  it('goes unseen -> commands-pending -> done, scoped to that user and installation', () => {
    const storage = memoryStorage()
    expect(readOnboardingStatus(storage, 'u1', 'inst-a')).toBe('unseen')
    expect(writeOnboardingStatus(storage, 'u1', 'inst-a', 'commands-pending')).toBe(true)
    expect(readOnboardingStatus(storage, 'u1', 'inst-a')).toBe('commands-pending')
    writeOnboardingStatus(storage, 'u1', 'inst-a', 'done')
    expect(readOnboardingStatus(storage, 'u1', 'inst-a')).toBe('done')
    expect(storage.map.get(onboardingSeenKey('u1', 'inst-a'))).toBe('1')
    expect(readOnboardingStatus(storage, 'u2', 'inst-a')).toBe('unseen')
    expect(readOnboardingStatus(storage, 'u1', 'inst-b')).toBe('unseen')
  })

  it('reads unknown values as unseen and never throws on a missing, broken or blocked storage', () => {
    const storage = memoryStorage()
    storage.setItem(onboardingSeenKey('u1', 'inst-a'), 'garbage')
    expect(readOnboardingStatus(storage, 'u1', 'inst-a')).toBe('unseen')
    const broken = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } }
    expect(readOnboardingStatus(broken, 'u1', 'inst-a')).toBe('unseen')
    expect(writeOnboardingStatus(broken, 'u1', 'inst-a', 'done')).toBe(false)
    expect(readOnboardingStatus(null, 'u1', 'inst-a')).toBe('unseen')
    expect(writeOnboardingStatus(undefined, 'u1', 'inst-a', 'done')).toBe(false)
    expect(writeOnboardingStatus(memoryStorage(), '', 'inst-a', 'done')).toBe(false)
  })
})
