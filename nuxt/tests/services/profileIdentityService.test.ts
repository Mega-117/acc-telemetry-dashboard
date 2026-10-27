import { setLocale } from '~/i18n'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// PIP-659: names and nickname change everywhere they appear, from one patch.
const writes: Array<[string, Record<string, unknown>]> = []
vi.mock('~/config/firebase', () => ({ db: {} }))
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...parts: string[]) => parts.join('/'),
  updateDoc: async (ref: string, data: Record<string, unknown>) => { writes.push([ref, data]) },
  setDoc: async () => {},
}))
vi.mock('firebase/auth', () => ({ updateProfile: vi.fn(async () => {}) }))
vi.mock('~/repositories/ownerDocumentRepository', () => ({ rememberOwnerDocumentPatch: vi.fn() }))
vi.mock('~/repositories/publicProfileRepository', () => ({ rememberPublicNickname: vi.fn() }))
const repair = vi.fn(async () => ({ wrote: true }))
vi.mock('~/services/pilotDirectoryProjectionService', () => ({ repairPilotDirectoryFromUser: (...a: unknown[]) => repair(...a) }))

const { saveProfileNames, validateProfileNames, profileNamesPatch } = await import('~/services/auth/profileIdentityService')
const user = { uid: 'u1', email: 'u1@example.com' } as never

// PIP-665: these checks read the Italian texts; the default would follow the system language.
setLocale('it')

describe('profile identity (PIP-659)', () => {
  beforeEach(() => { writes.length = 0; repair.mockClear() })

  it('applies the registration checks', () => {
    expect(validateProfileNames({ firstName: '', lastName: 'B', nickname: 'abc' })).toMatch(/nome/)
    expect(validateProfileNames({ firstName: 'A', lastName: ' ', nickname: 'abc' })).toMatch(/cognome/)
    expect(validateProfileNames({ firstName: 'A', lastName: 'B', nickname: 'ab' })).toMatch(/3 caratteri/)
    expect(validateProfileNames({ firstName: 'A', lastName: 'B', nickname: 'x'.repeat(21) })).toMatch(/20 caratteri/)
    expect(validateProfileNames({ firstName: 'A', lastName: 'B', nickname: 'abc' })).toBeNull()
  })

  it('trims and rebuilds the search fields from the same values', () => {
    const patch = profileNamesPatch({ firstName: ' Mario ', lastName: ' Rossi ', nickname: ' Mike83 ' }, 'm@x.it')
    expect(patch).toMatchObject({ firstName: 'Mario', lastName: 'Rossi', nickname: 'Mike83' })
    expect(typeof patch.directorySortName).toBe('string')
    expect(Array.isArray(patch.searchPrefixes)).toBe(true)
  })

  it('writes users, the public nickname only when it changed, then rebuilds the directory', async () => {
    await saveProfileNames(user, { firstName: 'Mario', lastName: 'Rossi', nickname: 'Mike83' }, 'Mike83')
    expect(writes.map(([ref]) => ref)).toEqual(['users/u1'])
    expect(repair).toHaveBeenCalledOnce()
    await saveProfileNames(user, { firstName: 'Mario', lastName: 'Rossi', nickname: 'Mike84' }, 'Mike83')
    expect(writes.map(([ref]) => ref)).toEqual(['users/u1', 'users/u1', 'publicProfiles/u1'])
    expect(writes[2]![1]).toMatchObject({ nickname: 'Mike84' })
    await expect(saveProfileNames(user, { firstName: '', lastName: 'R', nickname: 'abc' }, null)).rejects.toThrow(/nome/)
  })
})
