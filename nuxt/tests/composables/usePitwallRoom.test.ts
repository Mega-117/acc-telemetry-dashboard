// ============================================
// Il composable della gara, visto da chi apre la pagina.
//
// Il servizio Firestore e' finto: qui si prova cio' che il composable decide
// da solo - il battito accanto al pilota, l'equipaggio, l'invio e l'esito
// dell'ordine, le azioni da manager, uscire e chiudere.
//
// Il caso che ha fatto nascere il file (2026-09-04): il documento membro e'
// uno per persona, e il pilota che apriva la sua gara anche dal browser
// sovrascriveva il battito `driver` del suo PC con uno `engineer`: RICO117 in
// Chrome ha tolto RICO117 dal volante, e nessun ordine partiva piu'.
// ============================================

import { effectScope } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/config/firebase', () => ({ db: {} }))
vi.mock('firebase/firestore', () => ({ doc: (_db: unknown, _col: string, uid: string) => ({ path: `publicProfiles/${uid}` }) }))
vi.mock('~/composables/useFirebaseTracker', () => ({
  trackedGetDoc: async (ref: { path: string }) => {
    if (ref.path.endsWith('/rotto')) throw new Error('profilo non leggibile')
    const uid = ref.path.split('/').pop()
    return { exists: () => uid !== 'sconosciuto', data: () => ({ nickname: fakes.nicknames[uid ?? ''] ?? '' }) }
  },
}))

const fakes = vi.hoisted(() => ({
  nicknames: { me: 'RICO117', popo: 'popo' } as Record<string, string>,
  presence: [] as Array<{ kind: string, driving: boolean }>,
  pushMembers: null as ((list: unknown[]) => void) | null,
  pushRoom: null as ((room: unknown) => void) | null,
  pushRooms: null as ((list: unknown[]) => void) | null,
  pushOrder: null as ((order: unknown) => void) | null,
  calls: [] as string[],
  roomDoc: null as Record<string, unknown> | null,
  sendOk: true,
}))

vi.mock('~/services/pitwall/pitwallRoomService', () => ({
  createPitwallRoomService: ({ uid }: { uid: string }) => ({
    uid,
    readRoom: async () => fakes.roomDoc,
    joinRoom: async () => { fakes.calls.push('join'); return { ok: true, value: { ...fakes.roomDoc, memberUids: [...(fakes.roomDoc!.memberUids as string[]), uid] } } },
    watchRoom: (_id: string, onRoom: (room: unknown) => void) => { fakes.pushRoom = onRoom; return () => {} },
    watchMembers: (_id: string, onList: (list: unknown[]) => void) => { fakes.pushMembers = onList; return () => {} },
    publishPresence: async (_id: string, input: { kind: string, driving: boolean }) => {
      fakes.presence.push({ kind: input.kind, driving: input.driving })
      return { ok: true, value: true }
    },
    listRooms: async () => [fakes.roomDoc],
    watchRooms: (onList: (list: unknown[]) => void) => { fakes.pushRooms = onList; return () => {} },
    sendOrder: async () => (fakes.sendOk ? { ok: true, value: 'ord-1' } : { ok: false, reason: 'Gara chiusa.' }),
    watchOrder: (_id: string, _orderId: string, onOrder: (order: unknown) => void) => { fakes.pushOrder = onOrder; return () => {} },
    invite: async (_id: string, who: string) => { fakes.calls.push(`invite:${who}`); return who === 'nessuno' ? { ok: false, reason: 'Troppe persone invitate a questa gara.' } : { ok: true, value: true } },
    revoke: async (_id: string, who: string) => { fakes.calls.push(`revoke:${who}`); return { ok: true, value: true } },
    promote: async (_id: string, who: string) => { fakes.calls.push(`promote:${who}`); return { ok: true, value: true } },
    leaveRoom: async () => { fakes.calls.push('leave'); return { ok: true, value: true } },
    closeRoom: async () => { fakes.calls.push('close'); return { ok: true, value: true } },
    clearPresence: async () => { fakes.calls.push('clearPresence') },
  }),
}))

import { usePitwallRoom } from '~/composables/usePitwallRoom'
import type { PitwallRoom, PitwallRoomMember } from '~/services/pitwall/pitwallRoomContract'

const NOW = Date.parse('2026-09-04T17:55:00.000Z')

function room(overrides: Partial<PitwallRoom> = {}): PitwallRoom {
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
    ...overrides,
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
  for (let i = 0; i < 8; i += 1) await Promise.resolve()
}

let scope: ReturnType<typeof effectScope>

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  fakes.presence = []
  fakes.calls = []
  fakes.pushMembers = null
  fakes.pushRoom = null
  fakes.pushRooms = null
  fakes.pushOrder = null
  fakes.roomDoc = room()
  fakes.sendOk = true
  scope = effectScope()
})

afterEach(() => {
  scope.stop()
  vi.useRealTimers()
})

function build(uid: string | null = 'me') {
  return scope.run(() => usePitwallRoom({ uid: () => uid }))!
}

async function open(members: PitwallRoomMember[], uid = 'me') {
  const link = build(uid)
  await link.selectRoom('r1')
  await settle()
  fakes.pushMembers?.(members)
  await settle()
  return link
}

describe('il battito dell ingegnere accanto al pilota', () => {
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
    const link = build()
    await link.selectRoom('r1')
    await settle()
    expect(fakes.presence).toEqual([])
  })

  it('a ogni battito ricontrolla: appena il pilota compare, il browser tace', async () => {
    await open([])
    expect(fakes.presence).toHaveLength(1)
    fakes.pushMembers?.([member()])
    await vi.advanceTimersByTimeAsync(31_000)
    expect(fakes.presence).toHaveLength(1)
  })
})

describe('entrare e leggere la gara', () => {
  it('un invitato entra in un passaggio solo, e lo dice', async () => {
    fakes.roomDoc = room({ memberUids: ['pilota'], managerUids: ['pilota'], hostUid: 'pilota', allowedUids: ['me'] })
    const link = build()
    await link.selectRoom('r1')
    await settle()
    expect(fakes.calls).toContain('join')
    expect(link.notice.value).toBe('Sei entrato nella gara.')
    expect(link.amMember.value).toBe(true)
    expect(link.isManager.value).toBe(false)
  })

  it('una gara sparita si dice, e senza utente non si fa niente', async () => {
    fakes.roomDoc = null
    const link = build()
    await link.selectRoom('r1')
    expect(link.lastError.value).toBeTruthy()
    const nobody = build(null)
    await nobody.selectRoom('r1')
    expect(nobody.room.value).toBeNull()
  })

  it('l equipaggio mette chi guida in cima, poi chi c e, e mostra gli invitati', async () => {
    fakes.roomDoc = room({ memberUids: ['me', 'popo', 'terzo'], allowedUids: ['ospite'] })
    const link = await open([
      member({ uid: 'popo', nickname: 'popo', kind: 'engineer', driving: false }),
      member(),
      member({ uid: 'terzo', nickname: 'terzo', kind: 'engineer', driving: false, updatedAtMs: 0 }),
    ])
    const rows = link.crew.value
    // Chi guida, poi chi c'e', poi il resto in ordine alfabetico.
    expect(rows.map(row => row.uid)).toEqual(['me', 'popo', 'ospite', 'terzo'])
    expect(rows[0]).toMatchObject({ driving: true, online: true, role: 'manager', kind: 'driver', isSelf: true })
    expect(rows[1]).toMatchObject({ driving: false, online: true, role: 'member', invited: false })
    expect(rows[2]).toMatchObject({ invited: true, online: false, nickname: 'ospite' })
    expect(rows[3]).toMatchObject({ online: false, connecting: true })
    expect(link.executor.value.reason).toBe('ready')
    expect(link.carSnapshot.value?.nickname).toBe('RICO117')
    expect(link.canSend.value).toBe(true)
  })

  it('revocato mentre guarda: lo si dice e si esce dalla gara', async () => {
    const link = await open([member()])
    fakes.pushRoom?.(room({ memberUids: ['pilota'], allowedUids: [], hostUid: 'pilota', managerUids: ['pilota'] }))
    await settle()
    expect(link.room.value).toBeNull()
    expect(link.lastError.value).toBeTruthy()
  })

  it('con una sola gara in elenco ci si entra da soli', async () => {
    const link = build()
    link.start()
    await settle()
    fakes.pushRooms?.([room()])
    await settle()
    expect(link.selectedRoomId.value).toBe('r1')
    await link.refreshRooms()
    expect(link.rooms.value).toHaveLength(1)
    link.stop()
    expect(fakes.calls).toContain('clearPresence')
  })
})

describe('l ordine alla vettura', () => {
  it('parte solo con un pilota fresco al volante, poi segue l esito campo per campo', async () => {
    const link = await open([])
    expect(await link.sendPlan({ tyreSet: 4 })).toBe(false)
    expect(link.lastError.value).toBeTruthy()

    fakes.pushMembers?.([member()])
    await settle()
    expect(await link.sendPlan({ tyreSet: 4 })).toBe(true)
    expect(link.orderStatus.value).toBe('pending')
    expect(link.orderProgress.value).toBeTruthy()

    fakes.pushOrder?.({ status: 'applying', result: null })
    expect(link.orderStatus.value).toBe('applying')
    fakes.pushOrder?.({ status: 'applied', result: { reason: 'ok', fields: { tyreSet: { outcome: 'verified', requested: 4, observed: 4, reason: null, via: 'memory' } } } })
    expect(link.orderStatus.value).toBe('applied')
    expect(link.orderReason.value).toBe('ok')
    expect(link.orderFields.value.tyreSet?.observed).toBe(4)
    fakes.pushOrder?.(null)
    expect(link.orderStatus.value).toBe('applied')
  })

  it('un rifiuto del servizio diventa un esito rejected con il motivo', async () => {
    const link = await open([member()])
    fakes.sendOk = false
    expect(await link.sendPlan({ tyreSet: 4 })).toBe(false)
    expect(link.orderStatus.value).toBe('rejected')
    expect(link.lastError.value).toBeTruthy()
  })

  it('senza gara selezionata non parte niente', async () => {
    const link = build()
    expect(await link.sendPlan({ tyreSet: 4 })).toBe(false)
  })
})

describe('le azioni da manager, uscire e chiudere', () => {
  it('invita, toglie, promuove: avvisi in italiano e il servizio chiamato una volta', async () => {
    const link = await open([member()])
    await link.invite('popo')
    expect(link.notice.value).toContain('Invitato')
    await link.invite('nessuno')
    expect(link.lastError.value).toBeTruthy()
    await link.revoke('popo')
    expect(link.notice.value).toBe('Accesso tolto.')
    await link.promote('popo')
    expect(link.notice.value).toContain('invitare')
    expect(fakes.calls.filter(call => call.startsWith('invite:'))).toHaveLength(2)
    expect(fakes.calls).toContain('revoke:popo')
    expect(fakes.calls).toContain('promote:popo')
  })

  it('uscire lascia la gara e torna all elenco; chiudere la lascia consultabile', async () => {
    const link = await open([member()])
    await link.closeRoom()
    expect(link.notice.value).toContain('Gara chiusa')
    await link.leave()
    expect(fakes.calls).toContain('leave')
    expect(link.selectedRoomId.value).toBeNull()
    expect(link.notice.value).toBe('Sei uscito dalla gara.')
    // Senza gara selezionata le azioni non fanno niente.
    await link.invite('popo')
    await link.closeRoom()
    expect(fakes.calls.filter(call => call === 'close')).toHaveLength(1)
  })

  it('un profilo illeggibile lascia l identificativo, che e brutto ma vero', async () => {
    fakes.roomDoc = room({ memberUids: ['me', 'rotto', 'sconosciuto'] })
    const link = await open([member()])
    const names = Object.fromEntries(link.crew.value.map(row => [row.uid, row.nickname]))
    expect(names.rotto).toBe('rotto')
    expect(names.sconosciuto).toBe('sconosciuto')
    expect(names.me).toBe('RICO117')
  })
})
