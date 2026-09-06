import { beforeEach, expect, it, vi } from 'vitest'
const fake = vi.hoisted(() => ({ getDoc: vi.fn(), setDoc: vi.fn(), getDocs: vi.fn(), deleteDoc: vi.fn(),
  onSnapshot: vi.fn(), runTransaction: vi.fn(), commit: vi.fn() }))
vi.mock('~/utils/devToolsAccess', () => ({ canUseDevTools: () => false }))
vi.mock('firebase/firestore', () => ({ ...fake, addDoc: vi.fn(), updateDoc: vi.fn(), getCountFromServer: vi.fn(),
  writeBatch: () => ({ set: vi.fn(), update: vi.fn(), delete: vi.fn(), commit: fake.commit }) }))
import { trackedGetDoc, trackedGetDocs, trackedSetDoc, trackedDeleteDoc, trackedWriteBatch, trackedOnSnapshot,
  trackedRunTransaction, getFirebaseTotals, resetFirebaseTracker } from '~/composables/useFirebaseTracker'
const doc = { path: 'publicProfiles/test' } as never
beforeEach(() => { vi.clearAllMocks(); resetFirebaseTracker() })
it('separates cache reads, server estimates, successful writes/deletes and failed attempts', async () => {
  fake.getDoc.mockResolvedValueOnce({ metadata: { fromCache: true } }).mockResolvedValueOnce({ metadata: { fromCache: false } })
  await trackedGetDoc(doc, 'test'); await trackedGetDoc(doc, 'test')
  fake.getDocs.mockResolvedValue({ docs: [{}, {}], metadata: { fromCache: true } })
  await trackedGetDocs(doc, 'test')
  fake.setDoc.mockRejectedValueOnce(new Error('quota')).mockResolvedValueOnce(undefined)
  await expect(trackedSetDoc(doc, {}, 'test')).rejects.toThrow('quota')
  await trackedSetDoc(doc, {}, 'test')
  await trackedDeleteDoc(doc, 'test')
  expect(getFirebaseTotals()).toMatchObject({ estimatedReads: 1, estimatedWrites: 1, deleteOps: 1, failedOps: 1 })
})
it('uses first server snapshot and subsequent changed documents, not the full query on every event', () => {
  let deliver!: (snapshot: unknown) => void
  fake.onSnapshot.mockImplementation((_query, options, callback) => { expect(options.includeMetadataChanges).toBe(true); deliver = callback; return () => {} })
  trackedOnSnapshot(doc, 'test', () => {})
  const docs = [{}, {}, {}]
  deliver({ docs, metadata: { fromCache: true } })
  deliver({ docs, metadata: { fromCache: false }, docChanges: () => docs.map(doc => ({ doc })) })
  deliver({ docs, metadata: { fromCache: false }, docChanges: () => [{ doc: {} }] })
  deliver({ docs, metadata: { hasPendingWrites: true }, docChanges: () => [{ doc: {} }] })
  expect(getFirebaseTotals().estimatedReads).toBe(4)
})
it('counts transaction reads across retries and only committed writes, with batch deletes separate', async () => {
  fake.runTransaction.mockImplementation(async (_db, change) => {
    const transaction = { get: vi.fn(async () => ({})), set: vi.fn(), update: vi.fn(), delete: vi.fn() }
    await change(transaction); return change(transaction)
  })
  await trackedRunTransaction({} as never, 'test', doc, async transaction => { await transaction.get(doc); transaction.set(doc, {}); return true })
  const batch = trackedWriteBatch({} as never, 'test')
  batch.set(doc, {}); batch.delete(doc); await batch.commit()
  expect(getFirebaseTotals()).toMatchObject({ estimatedReads: 2, estimatedWrites: 2, deleteOps: 1 })
})
