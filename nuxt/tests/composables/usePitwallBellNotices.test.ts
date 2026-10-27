import { describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import type { PitwallNotification } from '~/services/pitwall/pitwallNotificationInbox'

// Decision 27/10: the bell's Firestore inbox and the notices built on it.
vi.mock('~/config/firebase', () => ({ db: {} }))
const listeners: { uid: string, onChange: (items: PitwallNotification[]) => void }[] = []
const removed: string[] = []
vi.mock('~/services/pitwall/pitwallNotificationInbox', async (importOriginal) => ({
  ...(await importOriginal<typeof import('~/services/pitwall/pitwallNotificationInbox')>()),
  watchPitwallNotifications: (_db: unknown, uid: string, onChange: (items: PitwallNotification[]) => void) => {
    listeners.push({ uid, onChange })
    return () => { listeners.splice(0, listeners.length) }
  },
  removePitwallNotification: async (_db: unknown, owner: string, id: string) => { removed.push(`${owner}/${id}`); return true },
}))

const { createPitwallNotificationInbox } = await import('~/composables/usePitwallNotificationInbox')
const { createPitwallBellNotices, NOTICE_PREFIX } = await import('~/composables/usePitwallBellNotices')

const NOW = 1_000_000_000
const request = (fromUid: string, createdAtMs: number | null = NOW - 1000): PitwallNotification =>
  ({ id: `friend-request-${fromUid}`, type: 'friend-request', fromUid, fromNickname: fromUid.toUpperCase(), roomId: null, createdAtMs })
const invite = (roomId: string, fromUid = 'host', createdAtMs: number | null = NOW - 1000): PitwallNotification =>
  ({ id: `room-invite-${roomId}`, type: 'room-invite', fromUid, fromNickname: 'Host', roomId, createdAtMs })

describe('notification inbox (decision 27/10)', () => {
  it('a new request pointer rereads the requests at once; the first snapshot does not', () => {
    listeners.length = 0; removed.length = 0
    const refreshRequests = vi.fn()
    const inbox = createPitwallNotificationInbox({ refreshRequests, pendingRequestFrom: () => new Set(), now: () => NOW })
    inbox.start('me')
    inbox.start('me') // already listening: no second listener
    expect(listeners).toHaveLength(1)
    listeners[0]!.onChange([request('alice')])
    expect(refreshRequests).not.toHaveBeenCalled()
    listeners[0]!.onChange([request('alice'), request('bob')])
    expect(refreshRequests).toHaveBeenCalledTimes(1)
    listeners[0]!.onChange([request('alice'), request('bob')])
    expect(refreshRequests).toHaveBeenCalledTimes(1)
    // The same sender asking again (pointer replaced: new time) rings again.
    listeners[0]!.onChange([request('alice', NOW), request('bob')])
    expect(refreshRequests).toHaveBeenCalledTimes(2)
    // Only invites: no RTDB reading.
    listeners[0]!.onChange([request('alice', NOW), request('bob'), invite('r1')])
    expect(refreshRequests).toHaveBeenCalledTimes(2)
    inbox.stop()
    expect(inbox.items.value).toEqual([])
    expect(listeners).toHaveLength(0)
  })

  it('tidies up: answered requests (after the grace time) and invites older than 12 hours', () => {
    listeners.length = 0; removed.length = 0
    let pending = new Set(['alice'])
    const inbox = createPitwallNotificationInbox({ refreshRequests: () => {}, pendingRequestFrom: () => pending, now: () => NOW })
    inbox.prune() // not started: nothing
    inbox.start('me')
    listeners[0]!.onChange([request('alice', NOW - 10 * 60_000), request('bob', NOW - 10 * 60_000), request('fresh', NOW - 30_000), invite('old', 'host', NOW - 13 * 3600_000), invite('new')])
    expect(removed).toEqual(['me/room-invite-old'])
    expect(inbox.roomInvites.value.map(item => item.roomId)).toEqual(['new'])
    inbox.prune()
    expect(removed).toEqual(['me/room-invite-old', 'me/friend-request-bob'])
    pending = new Set()
    inbox.prune()
    expect(removed).toEqual(['me/room-invite-old', 'me/friend-request-bob', 'me/friend-request-alice'])
    inbox.removeInvite('unknown') // not held: no write
    inbox.removeInvite('new')
    expect(removed.at(-1)).toBe('me/room-invite-new')
    inbox.stop()
  })

  it('a listener that cannot start leaves the rest working', () => {
    const inbox = createPitwallNotificationInbox({ refreshRequests: () => {}, pendingRequestFrom: () => new Set(),
      watch: () => { throw new Error('offline') } })
    expect(() => inbox.start('me')).not.toThrow()
    expect(inbox.items.value).toEqual([])
  })
})

describe('bell notices (decision 27/10)', () => {
  function setup() {
    listeners.length = 0; removed.length = 0
    const uid = ref<string | null>('me')
    const rooms = ref<{ roomId: string, hostUid: string, membershipModel?: string, allowedUids: string[], memberUids: string[], managerUids: string[], closedAt?: string | null }[]>([])
    const incoming = ref<unknown[]>([])
    const friendViews = ref([{ personId: 'alice', state: 'received', mineStatus: 'pending' }, { personId: 'bob', state: 'friends', mineStatus: 'granted' }])
    const refreshRequests = vi.fn()
    const bell = createPitwallBellNotices({
      uid: () => uid.value, rooms: () => rooms.value as never, openRaceIds: () => new Set(), friendViews: () => friendViews.value as never,
      incoming: () => incoming.value, refreshRequests,
    })
    bell.inbox.start('me')
    return { bell, rooms, incoming, refreshRequests }
  }

  it('an invite known only from the inbox is a notice; dismissing or entering removes its pointer', async () => {
    const { bell } = setup()
    listeners[0]!.onChange([invite('r1', 'carol', null), request('alice')])
    expect(bell.notices.value).toEqual([
      { id: `${NOTICE_PREFIX.request}alice`, kind: 'request', personId: 'alice' },
      { id: `${NOTICE_PREFIX.invite}r1`, kind: 'invite', personId: 'carol', raceId: 'r1' },
    ])
    expect(bell.pendingNoticeCount.value).toBe(2)
    bell.dismissInvite('r1')
    expect(removed).toContain('me/room-invite-r1')
    expect(bell.notices.value.map(notice => notice.kind)).toEqual(['request'])
    listeners[0]!.onChange([invite('r2', 'carol', null)])
    bell.enteredRace('r2')
    expect(removed).toContain('me/room-invite-r2')
  })

  it('once the rooms are loaded they decide; a closed room takes its pointer away; each reading tidies up', async () => {
    const { bell, rooms, incoming } = setup()
    listeners[0]!.onChange([invite('r1', 'carol', null), request('ghost', NOW - 3600_000)])
    rooms.value = [{ roomId: 'r1', hostUid: 'carol', allowedUids: ['me'], memberUids: ['carol'], managerUids: ['carol'], closedAt: null }]
    await nextTick()
    expect(bell.notices.value.filter(notice => notice.kind === 'invite')).toHaveLength(1)
    rooms.value = [{ ...rooms.value[0]!, closedAt: '2026-10-27T10:00:00Z' }]
    await nextTick()
    expect(removed).toContain('me/room-invite-r1')
    expect(bell.notices.value.filter(notice => notice.kind === 'invite')).toEqual([])
    incoming.value = []
    await nextTick()
    expect(removed).toContain('me/friend-request-ghost')
  })
})
