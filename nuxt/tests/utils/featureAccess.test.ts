import { describe, expect, it } from 'vitest'
import { canAccessFeature } from '../../app/utils/featureAccess'

describe('featureAccess', () => {
  it('permette HUD agli admin', () => {
    expect(canAccessFeature('hud', { role: 'admin' })).toBe(true)
    expect(canAccessFeature('hud', { isAdmin: true })).toBe(true)
  })

  it('permette HUD ai piloti normali', () => {
    expect(canAccessFeature('hud', { role: 'pilot' })).toBe(true)
  })

  it('permette HUD ai coach autenticati', () => {
    expect(canAccessFeature('hud', { role: 'coach' })).toBe(true)
  })

  it("nega HUD se non c'e un ruolo applicativo autenticato", () => {
    expect(canAccessFeature('hud', { role: null })).toBe(false)
    expect(canAccessFeature('hud', { role: 'guest' })).toBe(false)
  })
})
