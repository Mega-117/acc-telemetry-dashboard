import type { User } from 'firebase/auth'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const trackedGetDocMock = vi.hoisted(() => vi.fn())
const trackedSetDocMock = vi.hoisted(() => vi.fn())
const writePilotDirectoryMock = vi.hoisted(() => vi.fn())
const buildPilotDirectoryFieldsMock = vi.hoisted(() => vi.fn(() => ({
  directorySortName: 'qa fresh pilot',
  searchPrefixes: ['q', 'qa']
})))

vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...parts: string[]) => ({ path: parts.join('/') })
}))
vi.mock('~/config/firebase', () => ({ db: {} }))
vi.mock('~/composables/useFirebaseTracker', () => ({
  trackedGetDoc: trackedGetDocMock,
  trackedSetDoc: trackedSetDocMock
}))
vi.mock('~/services/pilotDirectoryProjectionService', () => ({
  writePilotDirectoryFromUser: writePilotDirectoryMock
}))
vi.mock('~/utils/pilotDirectoryFields', () => ({
  buildPilotDirectoryFields: buildPilotDirectoryFieldsMock
}))

import {
  createInitialUserDocument,
  ensureUserDocument,
  getUserProfile
} from '~/services/auth/userProvisioningService'

const freshUser = {
  uid: 'qa-fresh-pilot',
  email: 'qa-fresh-pilot@accsuite.invalid',
  displayName: null,
  emailVerified: true
} as User

beforeEach(() => {
  vi.clearAllMocks()
  trackedGetDocMock.mockResolvedValue({ exists: () => false })
  trackedSetDocMock.mockResolvedValue(undefined)
  writePilotDirectoryMock.mockResolvedValue(undefined)
})

describe('ensureUserDocument', () => {
  it('crea un profilo pilot rules-compatible prima delle proiezioni', async () => {
    await expect(ensureUserDocument(freshUser)).resolves.toEqual({
      role: 'pilot',
      nickname: 'qa-fresh-pilot'
    })

    expect(trackedSetDocMock).toHaveBeenNthCalledWith(
      1,
      { path: 'users/qa-fresh-pilot' },
      expect.objectContaining({
        uid: 'qa-fresh-pilot',
        role: 'pilot',
        coachId: null,
        emailVerified: true
      }),
      'AuthProvisioning'
    )
    expect(writePilotDirectoryMock).toHaveBeenCalledWith(expect.objectContaining({
      uid: 'qa-fresh-pilot',
      userData: expect.objectContaining({
        role: 'pilot',
        coachId: null
      })
    }))
  })

  it('riusa un profilo completo senza scritture di repair', async () => {
    trackedGetDocMock.mockResolvedValue({
      exists: () => true,
      data: () => ({
        uid: freshUser.uid,
        role: 'pilot',
        nickname: 'QA Pilot',
        directorySortName: 'qa fresh pilot',
        searchPrefixes: ['q', 'qa'],
        emailVerified: true
      })
    })

    await expect(ensureUserDocument(freshUser)).resolves.toEqual({
      role: 'pilot',
      nickname: 'QA Pilot'
    })
    expect(trackedSetDocMock).not.toHaveBeenCalled()
    expect(writePilotDirectoryMock).not.toHaveBeenCalled()
  })
})

describe('createInitialUserDocument', () => {
  it('scrive il profilo pilot completo e la proiezione pubblica', async () => {
    await expect(createInitialUserDocument(freshUser, {
      firstName: 'QA',
      lastName: 'Pilot',
      nickname: 'QA Pilot'
    })).resolves.toEqual({ role: 'pilot', nickname: 'QA Pilot' })

    expect(trackedSetDocMock).toHaveBeenNthCalledWith(
      1,
      { path: 'users/qa-fresh-pilot' },
      expect.objectContaining({
        uid: 'qa-fresh-pilot',
        role: 'pilot',
        coachId: null,
        nickname: 'QA Pilot'
      }),
      'AuthProvisioning'
    )
    expect(trackedSetDocMock).toHaveBeenNthCalledWith(
      2,
      { path: 'publicProfiles/qa-fresh-pilot' },
      expect.objectContaining({ uid: 'qa-fresh-pilot', nickname: 'QA Pilot' }),
      { merge: true },
      'AuthProvisioning'
    )
  })
})

describe('getUserProfile', () => {
  it('restituisce il profilo tracciato quando il documento esiste', async () => {
    trackedGetDocMock.mockResolvedValue({
      exists: () => true,
      data: () => ({ nickname: 'QA Pilot', coachId: null })
    })

    await expect(getUserProfile(freshUser.uid)).resolves.toEqual({
      nickname: 'QA Pilot',
      coachId: null
    })
    expect(trackedGetDocMock).toHaveBeenCalledWith(
      { path: 'users/qa-fresh-pilot' },
      'AuthProvisioning'
    )
  })
})
