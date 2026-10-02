import { describe, expect, it } from 'vitest'
import { shouldConnectFirebaseEmulators, emulatorPort } from '~/config/firebaseRuntimeTarget'

describe('firebaseRuntimeTarget', () => {
  it('accepts explicit isolated ports and rejects invalid or privileged ports', () => {
    expect(emulatorPort('19099', 9099)).toBe(19099)
    for (const invalid of [undefined, '', 80, -1, 65536, 'bad', 8080.5]) expect(emulatorPort(invalid, 9099)).toBe(9099)
  })
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
