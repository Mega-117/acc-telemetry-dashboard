import { beforeEach, describe, expect, it, vi } from 'vitest'

// PIP-658: order and completeness of "Cancella account" (Firebase mocked: the rules are covered by the emulator).
const calls: string[] = []
const store = new Map<string, string[]>()
vi.mock('firebase/auth', () => ({
  EmailAuthProvider: { credential: (email: string, password: string) => ({ email, password }) },
  reauthenticateWithCredential: async (_u: unknown, c: { password: string }) => { calls.push('reauth'); if (c.password !== 'ok') throw Object.assign(new Error('x'), { code: 'auth/wrong-password' }) },
  deleteUser: async () => { calls.push('deleteUser') },
}))
vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, path: string) => path,
  query: (path: string) => path,
  limit: () => null,
  doc: (_db: unknown, ...parts: string[]) => parts.join('/'),
  getDocs: async (path: string) => {
    const ids = store.get(path) ?? []
    store.set(path, [])
    return { empty: ids.length === 0, docs: ids.map(id => ({ id, ref: `${path}/${id}` })) }
  },
  writeBatch: () => { const refs: string[] = []; return { delete: (r: string) => refs.push(r), commit: async () => { calls.push(...refs.map(r => `del:${r}`)) } } },
  deleteDoc: async (ref: string) => { calls.push(`del:${ref}`) },
}))

const { deleteAccountEverywhere, USER_SUBCOLLECTIONS } = await import('~/services/auth/accountDeletion')
const user = { uid: 'u1', email: 'u1@example.com', getIdToken: async () => 'tok' } as never

describe('account deletion (PIP-658)', () => {
  beforeEach(() => { calls.length = 0; store.clear() })

  it('archive first, then subcollections (chunks before their session), profile docs, the account last', async () => {
    store.set('users/u1/sessions', ['s1'])
    store.set('users/u1/sessions/s1/rawChunks', ['c1', 'c2'])
    store.set('users/u1/raceCalendar', ['e1'])
    let worker = 0
    const fetchImpl = vi.fn(async () => { calls.push('worker'); return new Response('{}', { status: ++worker < 2 ? 202 : 200 }) }) as unknown as typeof fetch
    const steps: string[] = []
    await deleteAccountEverywhere(user, 'ok', { db: {} as never, workerOrigin: 'https://w.example/', fetchImpl, onStep: s => steps.push(s) })
    expect(calls.slice(0, 3)).toEqual(['reauth', 'worker', 'worker'])
    expect(calls.indexOf('del:users/u1/sessions/s1/rawChunks/c1')).toBeLessThan(calls.indexOf('del:users/u1/sessions/s1'))
    expect(calls.slice(-4)).toEqual(['del:publicProfiles/u1', 'del:pilotDirectory/u1', 'del:users/u1', 'deleteUser'])
    expect(calls).toContain('del:users/u1/raceCalendar/e1')
    expect(steps).toEqual(['verify', 'archive', 'documents', 'profile', 'account', 'done'])
    expect(USER_SUBCOLLECTIONS).toContain('runtimeInstallations')
  })

  it('a wrong password or a failing archive stops before anything in Firestore or Auth is deleted', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 500 })) as unknown as typeof fetch
    await expect(deleteAccountEverywhere(user, 'bad', { db: {} as never, workerOrigin: 'https://w', fetchImpl })).rejects.toMatchObject({ code: 'auth/wrong-password' })
    await expect(deleteAccountEverywhere(user, 'ok', { db: {} as never, workerOrigin: 'https://w', fetchImpl })).rejects.toThrow('archive-500')
    expect(calls.some(c => c.startsWith('del:') || c === 'deleteUser')).toBe(false)
  })
})
