import type { User } from 'firebase/auth'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const trackedGetDocMock = vi.hoisted(() => vi.fn())
const batchSetMock = vi.hoisted(() => vi.fn())
const batchCommitMock = vi.hoisted(() => vi.fn())
const trackedWriteBatchMock = vi.hoisted(() => vi.fn(() => ({
  set: batchSetMock,
  commit: batchCommitMock,
})))
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
  trackedWriteBatch: trackedWriteBatchMock
}))
vi.mock('~/services/pilotDirectoryProjectionService', () => ({
  buildPilotDirectoryProjection: (uid: string, data: Record<string, unknown>) => ({
    schemaVersion: 1,
    uid,
    nickname: data.nickname,
    role: data.role,
    coachId: data.coachId,
    directorySortName: data.directorySortName,
    searchPrefixes: data.searchPrefixes,
  })
}))
vi.mock('~/utils/pilotDirectoryFields', () => ({
  buildPilotDirectoryFields: buildPilotDirectoryFieldsMock
}))

import {
  createInitialUserDocument,
  ensureUserDocument,
  getUserProfile
} from '~/services/auth/userProvisioningService'
import { clearOwnerDocumentCache, peekOwnerDocument } from '~/repositories/ownerDocumentRepository'

const freshUser = {
  uid: 'qa-fresh-pilot',
  email: 'qa-fresh-pilot@accsuite.invalid',
  displayName: null,
  emailVerified: true
} as User

beforeEach(() => {
  vi.clearAllMocks()
  // PIP-442: `users/{uid}` e' condiviso e senza scadenza: ogni test riparte pulito.
  clearOwnerDocumentCache()
  trackedGetDocMock.mockResolvedValue({ exists: () => false })
  batchCommitMock.mockResolvedValue(undefined)
})

describe('ensureUserDocument', () => {
  it('crea un profilo pilot rules-compatible prima delle proiezioni', async () => {
    await expect(ensureUserDocument(freshUser)).resolves.toEqual({
      role: 'pilot',
      nickname: 'qa-fresh-pilot'
    })

    expect(batchSetMock).toHaveBeenNthCalledWith(
      1,
      { path: 'users/qa-fresh-pilot' },
      expect.objectContaining({
        uid: 'qa-fresh-pilot',
        role: 'pilot',
        coachId: null,
        emailVerified: true
      })
    )
    expect(batchSetMock).toHaveBeenNthCalledWith(
      2,
      { path: 'pilotDirectory/qa-fresh-pilot' },
      expect.objectContaining({
        role: 'pilot',
        coachId: null
      }),
      { merge: true }
    )
    expect(batchCommitMock).toHaveBeenCalledOnce()
  })

  it('riusa un profilo completo senza scritture di repair', async () => {
    const userData = {
      uid: freshUser.uid,
      role: 'pilot',
      coachId: null,
      nickname: 'QA Pilot',
      directorySortName: 'qa fresh pilot',
      searchPrefixes: ['q', 'qa'],
      emailVerified: true
    }
    trackedGetDocMock
      .mockResolvedValueOnce({ exists: () => true, data: () => userData })
      .mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ uid: freshUser.uid, nickname: 'QA Pilot', avatarUrl: null, updatedAt: 'now' })
      })
      .mockResolvedValueOnce({
        exists: () => true,
        data: () => ({
          schemaVersion: 1,
          uid: freshUser.uid,
          role: 'pilot',
          coachId: null,
          nickname: 'QA Pilot',
          directorySortName: 'qa fresh pilot',
          searchPrefixes: ['q', 'qa']
        })
      })

    await expect(ensureUserDocument(freshUser)).resolves.toEqual({
      role: 'pilot',
      nickname: 'QA Pilot'
    })
    expect(batchSetMock).not.toHaveBeenCalled()
    expect(batchCommitMock).not.toHaveBeenCalled()
  })

  it('ripara in una batch le proiezioni mancanti di un utente esistente', async () => {
    trackedGetDocMock
      .mockResolvedValueOnce({
        exists: () => true,
        data: () => ({
          uid: freshUser.uid,
          role: 'pilot',
          coachId: null,
          nickname: 'QA Pilot',
          directorySortName: 'qa fresh pilot',
          searchPrefixes: ['q', 'qa'],
          emailVerified: true
        })
      })
      .mockResolvedValueOnce({ exists: () => false })
      .mockResolvedValueOnce({ exists: () => false })

    await expect(ensureUserDocument(freshUser)).resolves.toEqual({ role: 'pilot', nickname: 'QA Pilot' })

    expect(batchSetMock).toHaveBeenCalledWith(
      { path: 'pilotDirectory/qa-fresh-pilot' },
      expect.objectContaining({ uid: freshUser.uid, nickname: 'QA Pilot' }),
      { merge: true }
    )
    expect(batchSetMock).toHaveBeenCalledWith(
      { path: 'publicProfiles/qa-fresh-pilot' },
      expect.objectContaining({ uid: freshUser.uid, nickname: 'QA Pilot' }),
      { merge: true }
    )
    expect(batchCommitMock).toHaveBeenCalledOnce()
  })

  it('propaga un errore provisioning invece di fingere un profilo pilot pronto', async () => {
    const failure = new Error('firestore unavailable')
    trackedGetDocMock.mockRejectedValueOnce(failure)

    await expect(ensureUserDocument(freshUser)).rejects.toBe(failure)
  })
})

describe('createInitialUserDocument', () => {
  it('scrive il profilo pilot completo e la proiezione pubblica', async () => {
    await expect(createInitialUserDocument(freshUser, {
      firstName: 'QA',
      lastName: 'Pilot',
      nickname: 'QA Pilot'
    })).resolves.toEqual({ role: 'pilot', nickname: 'QA Pilot' })

    expect(batchSetMock).toHaveBeenNthCalledWith(
      1,
      { path: 'users/qa-fresh-pilot' },
      expect.objectContaining({
        uid: 'qa-fresh-pilot',
        role: 'pilot',
        coachId: null,
        nickname: 'QA Pilot'
      })
    )
    expect(batchSetMock).toHaveBeenNthCalledWith(
      3,
      { path: 'publicProfiles/qa-fresh-pilot' },
      expect.objectContaining({ uid: 'qa-fresh-pilot', nickname: 'QA Pilot' }),
      { merge: true }
    )
    expect(batchCommitMock).toHaveBeenCalledOnce()
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

  it('PIP-442: riusa il documento owner condiviso e rilegge solo con fresh', async () => {
    trackedGetDocMock.mockResolvedValue({ exists: () => true, data: () => ({ nickname: 'QA Pilot' }) })
    await getUserProfile(freshUser.uid)
    await getUserProfile(freshUser.uid)
    expect(trackedGetDocMock).toHaveBeenCalledTimes(1)
    await getUserProfile(freshUser.uid, { fresh: true })
    expect(trackedGetDocMock).toHaveBeenCalledTimes(2)
  })

  it('PIP-442: ensureUserDocument popola la copia condivisa e la aggiorna con la riparazione', async () => {
    trackedGetDocMock.mockImplementation(async (ref: { path: string }) => ref.path === 'users/qa-fresh-pilot'
      ? { exists: () => true, data: () => ({ uid: 'stale', nickname: 'QA Pilot', role: 'pilot', emailVerified: false }) }
      : { exists: () => false })
    await ensureUserDocument(freshUser)
    const shared = peekOwnerDocument(freshUser.uid)
    expect(shared?.exists).toBe(true)
    expect(shared?.data?.uid).toBe('qa-fresh-pilot')
    expect(shared?.data?.emailVerified).toBe(true)
    expect(shared?.data?.nickname).toBe('QA Pilot')
    // Il documento owner e' stato letto una volta sola, insieme a publicProfile e pilotDirectory.
    expect(trackedGetDocMock).toHaveBeenCalledTimes(3)
    await getUserProfile(freshUser.uid)
    expect(trackedGetDocMock).toHaveBeenCalledTimes(3)
  })
})
