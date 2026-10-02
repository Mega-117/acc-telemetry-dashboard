import { describe, expect, it } from 'vitest'
import { shouldConnectFirebaseEmulators, emulatorPort, pitwallDatabaseUrl } from '~/config/firebaseRuntimeTarget'

describe('firebaseRuntimeTarget', () => {
  it('uses the CLI project namespace so emulated Pitwall exercises loaded rules', () => {
    expect(pitwallDatabaseUrl('accsuite117', undefined, true)).toBe('https://accsuite117-default-rtdb.firebaseio.com')
    expect(pitwallDatabaseUrl('demo-isolated', undefined, true)).toBe('https://demo-isolated-default-rtdb.firebaseio.com')
    for (const project of [undefined, '', '../other', 'https://other']) expect(() => pitwallDatabaseUrl(project, undefined, true)).toThrow()
  })
  it('preserves the production URL and explicit configuration', () => {
    expect(pitwallDatabaseUrl('accsuite117', undefined, false)).toBe('https://accsuite117-default-rtdb.europe-west1.firebasedatabase.app')
    expect(pitwallDatabaseUrl('other', 'https://explicit.firebaseio.com', false)).toBe('https://explicit.firebaseio.com')
    expect(() => pitwallDatabaseUrl('other', undefined, false)).toThrow()
  })
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
