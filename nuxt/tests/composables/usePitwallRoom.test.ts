// ============================================
// Il battito dell'ingegnere non spegne il pilota.
//
// Il documento membro e' uno per persona: il pilota che apre la sua gara
// anche dal browser (o la finestra principale della Suite accanto al PC che
// batte come pilota) non deve sovrascrivere il battito `driver` con uno
// `engineer`. Visto in pista il 2026-09-04: RICO117 in Chrome ha tolto
// RICO117 dal volante, e nessun ordine partiva piu'.
// ============================================

import { effectScope } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/config/firebase', () => ({ db: {} }))
vi.mock('firebase/firestore', () => ({ doc: () => ({ path: 'publicProfiles/me' }) }))
vi.mock('~/composables/useFirebaseTracker', () => ({
  trackedGetDoc: async () => ({ exists: () => true, data: () => ({ nickname: 'RICO117' }) }),
}))

const fakes = vi.hoisted(() => ({
  members: [] as unknown[],
  presence: [] as Array<{ kind: string, driving: boolean }>,
  pushMembers: null as ((list: unknown[]) => void) | null,
}))

vi.mock('~/services/pitwall/pitwallRoomService', () => ({
  createPitwallRoomService: ({ uid }: { uid: string }) => ({
    uid,
    readRoom: async () => room(),
    joinRoom: async () => ({ ok: true, value: room() }),
    watchRoom: () => () => {},
    watchMembers: (_roomId: string, onList: (list: unknown[]) => void) => {
      fakes.pushMembers = onList
      return () => {}
    },
    publishPresence: async (_roomId: string, input: { kind: string, driving: boolean }) => {
      fakes.presence.push({ kind: input.kind, driving: input.driving })
      return { ok: true, value: true }
    },
    listRooms: async () => [room()],
    watchRooms: () => () => {},
    watchOrder: () => () => {},
    clearPresence: async () => {},
  }),
}))

import { usePitwallRoom } from '~/composables/usePitwallRoom'
import type { PitwallRoom, PitwallRoomMember } from '~/services/pitwall/pitwallRoomContract'

const NOW = Date.parse('2026-09-04T17:55:00.000Z')

function room(): PitwallRoom {
  return {
    schemaVersion: 2,
    roomId: 'r1',
    label: '#1 · nurburgring',
    hostUid: 'me',
    managerUids: ['me'],
    memberUids: ['me'],
    allowedUids: ['popo'],
    vehicleFingerprint: 'fp',
    createdAt: '2026-09-04T17:09:50.000Z',
    updatedAt: '2026-09-04T17:09:50.000Z',
    track: 'nurburgring',
    raceNumber: 1,
    closedAt: null,
    lastLiveAtMs: NOW,
  }
}

function member(overrides: Partial<PitwallRoomMember> = {}): PitwallRoomMember {
  return {
    uid: 'me',
    nickname: 'RICO117',
    kind: 'driver',
    driving: true,
    runtimeSessionId: 'pw-electron',
    updatedAtMs: NOW - 5_000,
    ...overrides,
  }
}

async function settle(): Promise<void> {
  for (let i = 0; i < 6; i += 1) await Promise.resolve()
}

describe('usePitwallRoom: il battito dell ingegnere accanto al pilota', () => {
  let scope: ReturnType<typeof effectScope>

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    fakes.presence = []
    fakes.pushMembers = null
    scope = effectScope()
  })

  afterEach(() => {
    scope.stop()
    vi.useRealTimers()
  })

  async function open(members: PitwallRoomMember[]) {
    const link = scope.run(() => usePitwallRoom({ uid: () => 'me' }))!
    await link.selectRoom('r1')
    await settle()
    // Il primo battito aspetta l'equipaggio: qui l'elenco arriva.
    fakes.pushMembers?.(members)
    await settle()
    return link
  }

  it('tace se il mio PC pilota sta gia battendo in questa gara', async () => {
    await open([member()])
    expect(fakes.presence).toEqual([])
  })

  it('si annuncia come ingegnere quando nessun pilota batte per me', async () => {
    await open([])
    expect(fakes.presence).toEqual([{ kind: 'engineer', driving: false }])
  })

  it('riprende a battere quando il battito del pilota e vecchio', async () => {
    const link = await open([member({ updatedAtMs: NOW - 10 * 60_000 })])
    expect(fakes.presence).toEqual([{ kind: 'engineer', driving: false }])
    expect(link.members.value).toHaveLength(1)
  })

  it('non si annuncia prima di aver visto l equipaggio', async () => {
    const link = scope.run(() => usePitwallRoom({ uid: () => 'me' }))!
    await link.selectRoom('r1')
    await settle()
    expect(fakes.presence).toEqual([])
  })
})
