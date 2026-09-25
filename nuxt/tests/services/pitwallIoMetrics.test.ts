import { describe, it, expect } from 'vitest'
import { combinePitwallIoMetrics, createPitwallIoMetrics, jsonPayloadBytes, pitwallIoErrorCode } from '~/services/pitwall/pitwallIoMetrics'
import { estimateFirestoreSnapshot } from '~/services/pitwall/firestoreSnapshotEstimate'

describe('Pitwall I/O observations are not billing', () => {
  it('does not collect operation counters or event history outside development', () => {
    const meter = createPitwallIoMetrics('pitwall', false)
    meter.record({ operation: 'write', path: 'rooms/r', bytes: 40, success: true })
    expect(meter.events()).toEqual([])
    expect(meter.snapshot().writes).toBe(0)
  })
  it('includes social traffic without counting the shared SDK connection twice or mutating snapshots', () => {
    const legacy = createPitwallIoMetrics('pitwallV3')
    const social = createPitwallIoMetrics('pitwallRoomsV1')
    for (const meter of [legacy, social]) meter.record({ operation: 'connection', path: '.info/connected', connected: true, bytes: 0, success: true })
    legacy.record({ operation: 'receive', path: 'grants/u', bytes: 12, success: true })
    social.record({ operation: 'write', path: 'rooms/r', bytes: 40, success: true })
    social.record({ operation: 'receive', path: 'rooms/r', bytes: 20, success: true })
    const first = legacy.snapshot()
    expect(combinePitwallIoMetrics([undefined, first, social.snapshot()])).toMatchObject({
      deliveries: 2, writes: 1, payloadBytesReceived: 32, payloadBytesSent: 40, connections: 1, peakConnections: 1,
    })
    expect(first.writes).toBe(0)
    expect(combinePitwallIoMetrics([undefined])).toBeNull()
    expect(combinePitwallIoMetrics([first])).toEqual(first)
  })
  it('retains known error codes without leaking arbitrary messages or identifiers', () => {
    expect(pitwallIoErrorCode({ code: 'PERMISSION_DENIED', message: 'private path' })).toBe('permission-denied')
    expect(pitwallIoErrorCode({ code: 'database/unavailable' })).toBe('unavailable')
    expect(pitwallIoErrorCode({ code: 'private-account@example.org' })).toBe('failed')
    expect(pitwallIoErrorCode(new Error('private path'))).toBe('failed')
    expect(pitwallIoErrorCode(null)).toBe('failed')
  })
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
