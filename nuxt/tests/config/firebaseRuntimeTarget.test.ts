import { describe, expect, it } from 'vitest'
import { shouldConnectFirebaseEmulators } from '~/config/firebaseRuntimeTarget'

describe('firebaseRuntimeTarget', () => {
  it('abilita gli emulatori solo sul client di sviluppo con flag esplicito', () => {
    expect(shouldConnectFirebaseEmulators({
      isDevelopment: true,
      isClient: true,
      emulatorFlag: '1'
    })).toBe(true)
  })

  it.each([
    { isDevelopment: false, isClient: true, emulatorFlag: '1' },
    { isDevelopment: true, isClient: false, emulatorFlag: '1' },
    { isDevelopment: true, isClient: true, emulatorFlag: '0' },
    { isDevelopment: true, isClient: true, emulatorFlag: undefined }
  ])('rimane disabilitato fuori dal caso dev esplicito: %o', (input) => {
    expect(shouldConnectFirebaseEmulators(input)).toBe(false)
  })
})
