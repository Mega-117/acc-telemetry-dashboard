import { beforeEach, describe, expect, it, vi } from 'vitest'

// Decision 27/10: the bell's Firestore pointers (Firebase mocked; the rules are covered by the emulator).
const calls: string[] = []
let failSet = false
let failDelete = false
let snapshotHandler: ((snap: { docs: { id: string, data: () => Record<string, unknown> }[] }) => void) | null = null
const queryParts: unknown[] = []
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...parts: string[]) => parts.join('/'),
  collection: (_db: unknown, ...parts: string[]) => parts.join('/'),
  query: (...parts: unknown[]) => { queryParts.push(...parts); return parts[0] },
  orderBy: (field: string, dir: string) => `orderBy:${field}:${dir}`,
  limit: (n: number) => `limit:${n}`,
  serverTimestamp: () => 'SERVER_TIME',
  deleteDoc: async (ref: string) => { calls.push(`del:${ref}`); if (failDelete) throw new Error('permission-denied') },
  setDoc: async (ref: string, data: Record<string, unknown>) => { calls.push(`set:${ref}:${JSON.stringify(data)}`); if (failSet) throw new Error('permission-denied') },
  onSnapshot: (_q: unknown, next: typeof snapshotHandler) => { snapshotHandler = next; return () => { calls.push('unsubscribe') } },
}))

const inbox = await import('~/services/pitwall/pitwallNotificationInbox')
const db = {} as never

describe('pitwall notification pointers (decision 27/10)', () => {
  beforeEach(() => { calls.length = 0; failSet = false; failDelete = false; queryParts.length = 0 })

  it('ids are fixed by content: one per sender, one per room', () => {
    expect(inbox.pitwallNotificationId('friend-request', 'alice')).toBe('friend-request-alice')
    expect(inbox.pitwallNotificationId('room-invite', 'alice', 'room1')).toBe('room-invite-room1')
  })

  it('sending replaces my older pointer and writes only the allowed fields', async () => {
    failDelete = true // nothing of mine to replace: the rules refuse the delete, the write still goes
    expect(await inbox.sendPitwallNotification(db, { toUid: 'bob', type: 'friend-request', fromUid: 'alice', fromNickname: '  Alice  ' })).toBe(true)
    expect(calls).toEqual([
      'del:users/bob/notifications/friend-request-alice',
      'set:users/bob/notifications/friend-request-alice:{"type":"friend-request","fromUid":"alice","fromNickname":"Alice","createdAt":"SERVER_TIME"}',
    ])
    calls.length = 0
    expect(await inbox.sendPitwallNotification(db, { toUid: 'bob', type: 'room-invite', fromUid: 'alice', fromNickname: '', roomId: 'r_1' })).toBe(true)
    expect(calls[1]).toBe('set:users/bob/notifications/room-invite-r_1:{"type":"room-invite","fromUid":"alice","fromNickname":"alice","roomId":"r_1","createdAt":"SERVER_TIME"}')
  })

  it('never writes to myself, never an invite without a valid room, and a refused write is false', async () => {
    expect(await inbox.sendPitwallNotification(db, { toUid: 'alice', type: 'friend-request', fromUid: 'alice', fromNickname: 'A' })).toBe(false)
    expect(await inbox.sendPitwallNotification(db, { toUid: 'bob', type: 'room-invite', fromUid: 'alice', fromNickname: 'A', roomId: 'bad/id' })).toBe(false)
    expect(calls).toEqual([])
    failSet = true
    expect(await inbox.sendPitwallNotification(db, { toUid: 'bob', type: 'friend-request', fromUid: 'alice', fromNickname: 'A' })).toBe(false)
    failDelete = true
    expect(await inbox.removePitwallNotification(db, 'bob', 'x')).toBe(false)
    expect(await inbox.removePitwallNotification(db, '', 'x')).toBe(false)
  })

  it('request and invite helpers write and remove in the right inboxes', async () => {
    let me: string | null = 'alice'
    const requests = inbox.createPitwallRequestPointers(db, () => me, () => 'Alice')
    await requests.sent('bob')
    await requests.withdrawn('bob')
    await requests.answered('carol')
    const invites = inbox.pitwallInvitePointers(db, () => me, () => 'Alice')
    await invites.invited('dave', 'room1')
    await invites.revoked('dave', 'room1')
    expect(calls).toEqual([
      'del:users/bob/notifications/friend-request-alice',
      'set:users/bob/notifications/friend-request-alice:{"type":"friend-request","fromUid":"alice","fromNickname":"Alice","createdAt":"SERVER_TIME"}',
      'del:users/bob/notifications/friend-request-alice',
      'del:users/alice/notifications/friend-request-carol',
      'del:users/dave/notifications/room-invite-room1',
      'set:users/dave/notifications/room-invite-room1:{"type":"room-invite","fromUid":"alice","fromNickname":"Alice","roomId":"room1","createdAt":"SERVER_TIME"}',
      'del:users/dave/notifications/room-invite-room1',
    ])
    me = null
    expect(await requests.sent('bob')).toBe(false)
    expect(await requests.withdrawn('bob')).toBe(false)
    expect(await requests.answered('bob')).toBe(false)
    expect(await invites.invited('dave', 'room1')).toBe(false)
  })

  it('the listener reads newest first, at most 20, and ignores anything that is not a pointer', () => {
    const seen: unknown[] = []
    const stop = inbox.watchPitwallNotifications(db, 'bob', items => seen.push(items))
    expect(queryParts).toEqual(['users/bob/notifications', 'orderBy:createdAt:desc', 'limit:20'])
    snapshotHandler!({ docs: [
      { id: 'friend-request-alice', data: () => ({ type: 'friend-request', fromUid: 'alice', fromNickname: 'Alice', createdAt: { toMillis: () => 5 } }) },
      { id: 'room-invite-r1', data: () => ({ type: 'room-invite', fromUid: 'carol', fromNickname: '', roomId: 'r1', createdAt: null }) },
      { id: 'junk', data: () => ({ type: 'other', fromUid: 'x' }) },
      { id: 'room-invite-x', data: () => ({ type: 'room-invite', fromUid: 'x' }) },
      { id: 'nofrom', data: () => ({ type: 'friend-request' }) },
    ] })
    expect(seen).toEqual([[
      { id: 'friend-request-alice', type: 'friend-request', fromUid: 'alice', fromNickname: 'Alice', roomId: null, createdAtMs: 5 },
      { id: 'room-invite-r1', type: 'room-invite', fromUid: 'carol', fromNickname: 'carol', roomId: 'r1', createdAtMs: null },
    ]])
    stop()
    expect(calls).toContain('unsubscribe')
  })
})
