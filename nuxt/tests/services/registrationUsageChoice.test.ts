import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('firebase/firestore', () => ({ doc: vi.fn() }))
vi.mock('~/config/firebase', () => ({ db: {} }))
vi.mock('~/composables/useFirebaseTracker', () => ({ trackedUpdateDoc: vi.fn() }))
vi.mock('~/repositories/ownerDocumentRepository', () => ({ rememberOwnerDocumentPatch: vi.fn() }))
vi.mock('~/services/usage/usageClient', () => ({ usageOrigin: () => 'https://usage.test' }))

import {
  applyRegistrationUsageChoice, saveRegistrationUsageChoice, sendRegistrationUsageChoice, type RegistrationUsageDeps,
} from '~/services/usage/registrationUsageChoice'

const accepted = { termsVersion: '2026-10-31', privacyVersion: '2026-10-31', acceptedAt: '2026-10-31T10:00:00.000Z' }
const owner = (consent: unknown) => async () => ({ data: consent === undefined ? {} : { consent } })
const always = () => true
const token = async () => 'token-u1'

function memoryStorage() {
  const map = new Map<string, string>()
  return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => { map.set(k, v) }, removeItem: (k: string) => { map.delete(k) }, map }
}
const reply = (status: number, body: unknown = {}) => vi.fn(async () => new Response(JSON.stringify(body), { status }))

describe('PIP-698 send at registration', () => {
  it('sends one conditional write with the account token', async () => {
    const fetchImpl = reply(200, { enabled: false, revision: 1 })
    await expect(sendRegistrationUsageChoice(token, false, fetchImpl)).resolves.toBe('stored')
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://usage.test/v1/usage/preference')
    expect(init.method).toBe('PUT')
    expect(JSON.parse(String(init.body))).toEqual({ enabled: false, expectedRevision: 0 })
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer token-u1')
  })

  it('an earlier choice wins (409 preference-changed); other failures are retried', async () => {
    await expect(sendRegistrationUsageChoice(token, true, reply(409, { error: 'preference-changed' }))).resolves.toBe('stored')
    await expect(sendRegistrationUsageChoice(token, true, reply(409, { error: 'preference-conflict' }))).resolves.toBe('failed')
    await expect(sendRegistrationUsageChoice(token, true, reply(503))).resolves.toBe('failed')
    await expect(sendRegistrationUsageChoice(token, true, vi.fn(async () => { throw Error('offline') }))).resolves.toBe('failed')
  })

  it('keeps the choice on this PC only when the send fails', async () => {
    const storage = memoryStorage()
    await saveRegistrationUsageChoice('u1', token, false, { fetchImpl: reply(200), storage })
    expect(storage.map.size).toBe(0)
    await saveRegistrationUsageChoice('u1', token, false, { fetchImpl: reply(503), storage })
    expect(storage.map.get('rc-usage-registration-choice:u1')).toBe('0')
    // A failed "no" stops collection on this browser at once (usageClient keys).
    expect(storage.map.get('rc-usage-disabled:u1')).toBe('1')
    expect(storage.map.get('rc-usage-pending-disable:u1')).toBe('1')
    const yes = memoryStorage()
    await saveRegistrationUsageChoice('u2', token, true, { fetchImpl: reply(503), storage: yes })
    expect([...yes.map.keys()]).toEqual(['rc-usage-registration-choice:u2'])
  })
})

describe('PIP-698 first entry', () => {
  let d: RegistrationUsageDeps & { send: ReturnType<typeof vi.fn>, markApplied: ReturnType<typeof vi.fn>, storage: ReturnType<typeof memoryStorage> }
  beforeEach(() => {
    d = { send: vi.fn(async () => 'stored' as const), markApplied: vi.fn(async () => undefined), storage: memoryStorage(),
      now: () => new Date('2026-10-31T12:00:00.000Z') }
  })

  it('sends the stored choice again and marks it as applied', async () => {
    await expect(applyRegistrationUsageChoice('u1', owner({ ...accepted, usage: false }), always, d)).resolves.toBe('done')
    expect(d.send).toHaveBeenCalledWith(false)
    expect(d.markApplied).toHaveBeenCalledWith('u1', { ...accepted, usage: false, choicesAt: '2026-10-31T12:00:00.000Z' })
  })

  it('uses the copy kept on this PC when the account document lost the choice', async () => {
    d.storage.setItem('rc-usage-registration-choice:u1', '1')
    await expect(applyRegistrationUsageChoice('u1', owner(undefined), always, d)).resolves.toBe('done')
    expect(d.send).toHaveBeenCalledWith(true)
    expect(d.storage.map.size).toBe(0)
    expect(d.markApplied).not.toHaveBeenCalled()
  })

  it('does nothing for older accounts and for a choice already applied (no window, no change)', async () => {
    for (const consent of [undefined, null, accepted, { ...accepted, usage: false, choicesAt: '2026-10-31T11:00:00.000Z' }]) {
      await expect(applyRegistrationUsageChoice('u1', owner(consent), always, d)).resolves.toBe('done')
    }
    expect(d.send).not.toHaveBeenCalled()
  })

  it('retries, keeping the local copy, when the service does not confirm', async () => {
    d.storage.setItem('rc-usage-registration-choice:u1', '0')
    d.send.mockResolvedValueOnce('failed')
    await expect(applyRegistrationUsageChoice('u1', owner({ ...accepted, usage: false }), always, d)).resolves.toBe('retry')
    expect(d.markApplied).not.toHaveBeenCalled()
    expect(d.storage.map.size).toBe(1)
  })

  it('stops before sending when the account changes meanwhile', async () => {
    let current = true
    const slowOwner = async () => { current = false; return { data: { consent: { ...accepted, usage: false } } } }
    await expect(applyRegistrationUsageChoice('u1', slowOwner, () => current, d)).resolves.toBe('stale')
    expect(d.send).not.toHaveBeenCalled()
  })

  it('a failed marker write does not undo the stored choice', async () => {
    d.markApplied.mockRejectedValueOnce(Error('offline'))
    await expect(applyRegistrationUsageChoice('u1', owner({ ...accepted, usage: true }), always, d)).resolves.toBe('done')
  })
})
