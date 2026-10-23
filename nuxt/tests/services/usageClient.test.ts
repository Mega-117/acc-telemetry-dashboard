// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('../../app/repositories/diagnosticBundlesRepository', () => ({ DIAGNOSTICS_INGEST_ORIGIN: 'https://usage.invalid' }))
import { bindUsageUser, recordUsage, usagePreference, usageRequest } from '../../app/services/usage/usageClient'

const account = (uid: string) => ({ uid, getIdToken: async () => `token-${uid}` })
const response = (value: unknown) => ({ ok: true, json: async () => value })
const channels: Array<{ onmessage: ((event: { data: unknown }) => void) | null; postMessage: ReturnType<typeof vi.fn> }> = []
class Channel {
  onmessage = null
  postMessage = vi.fn()
  close = vi.fn()
  constructor() { channels.push(this) }
}
async function settle() { for (let i = 0; i < 12; i++) await Promise.resolve() }
beforeEach(() => {
  vi.useFakeTimers(); localStorage.clear(); channels.length = 0
  vi.stubGlobal('BroadcastChannel', Channel)
  Object.defineProperty(navigator, 'locks', { configurable: true, value: { request: vi.fn(async (_name, _options, callback) => callback({ name: 'leader' })) } })
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ enabled: true, revision: 0 })))
})
afterEach(async () => { bindUsageUser(null); await settle(); vi.useRealTimers(); vi.unstubAllGlobals() })

describe('browser usage ownership and preference', () => {
  it('stops and removes pending data immediately when disabling offline', async () => {
    bindUsageUser(account('pilot')); await settle()
    recordUsage({ feature: 'pitwall.engineer', active: true })
    await vi.advanceTimersByTimeAsync(60000)
    expect(localStorage.getItem('rc-usage:pilot')).not.toBeNull()
    vi.mocked(fetch).mockRejectedValue(Error('offline'))
    await expect(usagePreference(false)).rejects.toThrow('offline')
    expect(localStorage.getItem('rc-usage:pilot')).toBeNull()
    expect(localStorage.getItem('rc-usage-pending-disable:pilot')).toBe('1')
    await vi.advanceTimersByTimeAsync(60000)
    const saved = JSON.parse(localStorage.getItem('rc-usage:pilot') || '{"rows":[]}')
    expect(saved.rows).toEqual([])
  })

  it('PIP-591: opting out stops collection even when the browser refuses to store the choice', async () => {
    bindUsageUser(account('pilot')); await settle()
    recordUsage({ feature: 'pitwall.engineer', active: true })
    await vi.advanceTimersByTimeAsync(60000)
    const realSet = Storage.prototype.setItem
    const setSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
      if (key.startsWith('rc-usage-disabled') || key.startsWith('rc-usage-pending')) throw new DOMException('full', 'QuotaExceededError')
      return realSet.call(this, key, value)
    })
    vi.mocked(fetch).mockRejectedValue(Error('offline'))
    await expect(usagePreference(false)).rejects.toThrow('offline')
    // 'order' e' un evento che il collector conta davvero: se la raccolta fosse accesa comparirebbe.
    recordUsage({ feature: 'pitwall.engineer', event: 'order', id: 'after-opt-out' })
    await vi.advanceTimersByTimeAsync(60000)
    const saved = JSON.parse(localStorage.getItem('rc-usage:pilot') || '{"rows":[]}')
    expect(JSON.stringify(saved)).not.toContain('pitwall.engineer.order')
    setSpy.mockRestore()
  })

  it('PIP-591: an opt-out made in another tab stops this tab too, even without storage', async () => {
    bindUsageUser(account('pilot')); await settle()
    recordUsage({ feature: 'pitwall.engineer', event: 'order', id: 'before' })
    await vi.advanceTimersByTimeAsync(60000)
    expect(localStorage.getItem('rc-usage:pilot')).toContain('pitwall.engineer.order')
    channels[0].onmessage?.({ data: { preference: { disabled: true, pending: true } } })
    recordUsage({ feature: 'pitwall.engineer', event: 'order', id: 'after-other-tab' })
    await vi.advanceTimersByTimeAsync(60000)
    expect(localStorage.getItem('rc-usage:pilot') || '').not.toContain('pitwall.engineer.order')
  })

  it('coalesces the same active Pitwall role across tabs', async () => {
    bindUsageUser(account('pilot')); await settle()
    recordUsage({ feature: 'pitwall.engineer', active: true })
    channels[0]!.onmessage?.({ data: { tab: 'second-tab', value: { feature: 'pitwall.engineer', active: true } } })
    await vi.advanceTimersByTimeAsync(10000)
    window.dispatchEvent(new Event('pagehide'))
    const saved = JSON.parse(localStorage.getItem('rc-usage:pilot')!)
    expect(saved.rows[0].durations['pitwall.engineer']).toBe(10000)
    expect(saved.rows[0].counters['pitwall.engineer.opens']).toBe(1)
    expect(saved.rows[0].sessions).toEqual([])
  })

  it('discards an old account response after account change', async () => {
    bindUsageUser(account('pilot')); await settle()
    let resolve!: (value: unknown) => void
    vi.mocked(fetch).mockImplementationOnce(() => new Promise(r => { resolve = r }) as Promise<Response>)
    const pending = usageRequest('/v1/usage/preference'); await settle()
    bindUsageUser(account('other')); await settle()
    resolve(response({ enabled: true, revision: 0 }))
    await expect(pending).rejects.toThrow('Account cambiato')
  })

  it('a stale GET cannot undo a more recent opt-out', async () => {
    bindUsageUser(account('pilot')); await settle()
    let resolve!: (value: unknown) => void
    vi.mocked(fetch).mockImplementationOnce(() => new Promise(r => { resolve = r }) as Promise<Response>)
    const pending = usagePreference(); await settle()
    vi.mocked(fetch).mockResolvedValue(response({ enabled: false, revision: 1 }) as Response)
    await usagePreference(false)
    resolve(response({ enabled: true, revision: 0 }))
    await expect(pending).rejects.toThrow('Preferenza cambiata')
    expect(localStorage.getItem('rc-usage-disabled:pilot')).toBe('1')
  })
})


describe('suspended usage uploads', () => {
  it.each(['switch', 'logout-login', 'offline-disable'])('cancels a hash prepared before %s', async mode => {
    let release!: (value: ArrayBuffer) => void
    const digest = vi.fn(() => new Promise<ArrayBuffer>(resolve => { release = resolve }))
    vi.stubGlobal('crypto', { randomUUID: () => 'browser-producer', subtle: { digest } })
    bindUsageUser(account('A')); await settle()
    recordUsage({ feature: 'pitwall.engineer', event: 'order', id: 'old-order' })
    await vi.advanceTimersByTimeAsync(300000)
    expect(digest).toHaveBeenCalled()
    if (mode === 'switch') bindUsageUser(account('B'))
    if (mode === 'logout-login') { bindUsageUser(null); bindUsageUser(account('A')) }
    if (mode === 'offline-disable') {
      vi.mocked(fetch).mockRejectedValueOnce(Error('offline'))
      await expect(usagePreference(false)).rejects.toThrow('offline')
    }
    await settle()
    release(new ArrayBuffer(32)); await settle()
    expect(vi.mocked(fetch).mock.calls.filter(([url]) => String(url).includes('/summaries/'))).toHaveLength(0)
  })

  it('checks opt-out again after the ID token await', async () => {
    let releaseHash!: (value: ArrayBuffer) => void, releaseToken!: (value: string) => void
    let holdToken = false
    const u = { uid: 'A', getIdToken: () => holdToken ? new Promise<string>(r => { releaseToken = r }) : Promise.resolve('token-A') }
    vi.stubGlobal('crypto', { randomUUID: () => 'browser-producer', subtle: { digest: () => new Promise<ArrayBuffer>(r => { releaseHash = r }) } })
    bindUsageUser(u); await settle()
    recordUsage({ feature: 'pitwall.engineer', event: 'order', id: 'old-order' })
    await vi.advanceTimersByTimeAsync(300000)
    holdToken = true; releaseHash(new ArrayBuffer(32)); await settle()
    expect(releaseToken).toBeTypeOf('function')
    holdToken = false; await usagePreference(false)
    releaseToken('token-A'); await settle()
    expect(vi.mocked(fetch).mock.calls.filter(([url]) => String(url).includes('/summaries/'))).toHaveLength(0)
  })
})
