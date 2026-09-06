import { describe, it, expect } from 'vitest'
import { createPitwallIoMetrics, jsonPayloadBytes } from '~/services/pitwall/pitwallIoMetrics'
import { estimateFirestoreSnapshot } from '~/services/pitwall/firestoreSnapshotEstimate'

describe('Pitwall I/O observations are not billing', () => {
  it('counts one changed document rather than all four members on later snapshots', () => {
    const snapshot = { metadata: { fromCache: false }, docs: [{}, {}, {}, {}], docChanges: () => [{ doc: {} }] }
    expect(estimateFirestoreSnapshot(snapshot, true).reads).toBe(4)
    expect(estimateFirestoreSnapshot(snapshot, false).reads).toBe(1)
  })
  it('does not bill local echoes or cache deliveries in the estimate', () => {
    expect(estimateFirestoreSnapshot({ metadata: { fromCache: true }, docs: [{}] }, true).reads).toBe(0)
    expect(estimateFirestoreSnapshot({ metadata: { hasPendingWrites: true }, docs: [{}] }, true).reads).toBe(0)
    expect(estimateFirestoreSnapshot({ docs: [], docChanges: () => [] }, true).reads).toBe(1)
    expect(estimateFirestoreSnapshot({ docs: [], docChanges: () => [] }, false).reads).toBe(0)
  })
  it('separates deletion, transaction retries, delivery bytes and connection peak', () => {
    const m = createPitwallIoMetrics()
    const base = { path: 'rooms/r', bytes: 8, success: true }
    m.record({ ...base, operation: 'write' })
    m.record({ ...base, operation: 'delete' })
    m.record({ ...base, operation: 'transaction', attempts: 3, committed: false })
    m.record({ ...base, operation: 'transaction', attempts: 1, committed: true })
    m.record({ ...base, operation: 'receive' })
    m.record({ ...base, operation: 'connection', connected: true })
    m.record({ ...base, operation: 'connection', connected: false })
    m.record({ ...base, operation: 'write', success: false })
    expect(m.snapshot()).toMatchObject({ writes: 3, deletes: 1, transactions: 2, transactionAttempts: 4,
      deliveries: 1, payloadBytesReceived: 8, connections: 0, peakConnections: 1, failed: 1 })
    expect(jsonPayloadBytes('è')).toBe(4)
  })
})
