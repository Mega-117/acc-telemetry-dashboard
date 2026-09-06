import { describe, expect, it } from 'vitest'
import {
  firstOverlayActionId,
  nextOverlayActionId,
  resolveOverlayActivation,
  resetsOverlayMenuOnHide,
} from '../../app/services/overlay/overlayActionNavigation'

describe('overlayActionNavigation', () => {
  it.each(['launcher', 'select'])('resets only menu phases: %s', phase => {
    expect(resetsOverlayMenuOnHide(phase)).toBe(true)
  })
  it.each(['running', 'paused', 'expired', 'completed', 'placement', 'loading'])('preserves session and setup phase %s', phase => {
    expect(resetsOverlayMenuOnHide(phase)).toBe(false)
  })
  const visibleEnabled = ['training', 'coach', 'target']

  it('starts from the first visible enabled action and wraps', () => {
    expect(firstOverlayActionId(visibleEnabled)).toBe('training')
    expect(nextOverlayActionId(null, visibleEnabled)).toBe('training')
    expect(nextOverlayActionId('training', visibleEnabled)).toBe('coach')
    expect(nextOverlayActionId('target', visibleEnabled)).toBe('training')
  })

  it('resets stale selection without activating anything', () => {
    expect(resolveOverlayActivation('removed', visibleEnabled)).toEqual({
      selectedId: 'training',
      activateId: null,
    })
  })

  it('activates only a currently available id', () => {
    expect(resolveOverlayActivation('coach', visibleEnabled)).toEqual({
      selectedId: 'coach',
      activateId: 'coach',
    })
    expect(resolveOverlayActivation(null, [])).toEqual({ selectedId: null, activateId: null })
  })
})
