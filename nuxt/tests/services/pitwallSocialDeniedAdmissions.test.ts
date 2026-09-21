// PIP-439: directory lasciate da amici disconnessi (o la nostra dopo un riavvio) non devono
// generare una scrittura e un ascolto rifiutati a ogni evento.
import { describe, expect, it, vi } from 'vitest'
import { createPitwallSocialLifecycle } from '~/services/pitwall/pitwallSocialLifecycle'

function fakeIo(options: { denyAdmission: boolean, denyRoom: boolean }) {
  const watchers = new Map<string, { value: (v: unknown) => void, error: (e: Error) => void }>()
  const writes: string[] = []
  const roomWatches: string[] = []
  const io = {
    serverNow: () => Date.now(),
    read: vi.fn(async () => null),
    write: vi.fn(async (path: string) => {
      writes.push(path)
      if (options.denyAdmission && path.startsWith('admissions/')) throw new Error('PERMISSION_DENIED: Permission denied')
    }),
    watch: vi.fn((path: string, value: (v: unknown) => void, error: (e: Error) => void) => {
      watchers.set(path, { value, error })
      if (path.startsWith('rooms/')) {
        roomWatches.push(path)
        if (options.denyRoom) queueMicrotask(() => error(new Error('permission_denied')))
      }
      return () => { watchers.delete(path) }
    })
  }
  return { io, writes, roomWatches, emitDirectory: (id: string, entry: unknown) => watchers.get(`directory/${id}`)?.value(entry) }
}

const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve() }

describe('watchRooms: rifiuti non ripetuti', () => {
  it('una admission rifiutata per la stessa voce non viene ritentata a ogni evento', async () => {
    const fake = fakeIo({ denyAdmission: true, denyRoom: false })
    let emitFriends: (uids: string[]) => void = () => {}
    const lifecycle = createPitwallSocialLifecycle({
      uid: 'me', io: fake.io as any, connectionId: () => 'c-me', ensureConnection: async () => {},
      watchFriends: (callback) => { emitFriends = callback; return () => {} }
    })
    lifecycle.watchRooms(() => {})
    emitFriends(['friend'])
    fake.emitDirectory('friend', { roomId: 'room-1', connectionId: 'old-conn' })
    await flush()
    emitFriends(['friend'])
    emitFriends(['friend'])
    fake.emitDirectory('friend', { roomId: 'room-1', connectionId: 'old-conn' })
    await flush()
    expect(fake.writes.filter((path) => path === 'admissions/room-1')).toHaveLength(1)

    // Nuova connessione dell'amico = nuova voce: si riprova.
    fake.emitDirectory('friend', { roomId: 'room-1', connectionId: 'new-conn' })
    await flush()
    expect(fake.writes.filter((path) => path === 'admissions/room-1')).toHaveLength(2)
  })

  it('la nostra directory rimasta dopo un riavvio: un solo tentativo di ascolto finche\' non cambia', async () => {
    const fake = fakeIo({ denyAdmission: false, denyRoom: true })
    let emitFriends: (uids: string[]) => void = () => {}
    const lifecycle = createPitwallSocialLifecycle({
      uid: 'me', io: fake.io as any, connectionId: () => 'c-me', ensureConnection: async () => {},
      watchFriends: (callback) => { emitFriends = callback; return () => {} }
    })
    lifecycle.watchRooms(() => {})
    emitFriends([])
    fake.emitDirectory('me', { roomId: 'room-9', connectionId: 'dead-conn' })
    await flush()
    const first = fake.roomWatches.filter((path) => path === 'rooms/room-9/meta').length
    emitFriends([])
    emitFriends([])
    await flush()
    expect(first).toBe(1)
    expect(fake.roomWatches.filter((path) => path === 'rooms/room-9/meta')).toHaveLength(1)
    expect(fake.writes).toHaveLength(0)
  })
})
