import { afterEach, describe, expect, it, vi } from 'vitest'
import { preparePage, preparePageFonts } from '../../app/services/ui/pagePreparation'

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })
describe('complete page presentation', () => {
  it('does not reveal a page before all initial content is available', async () => {
    let resolve!: (value: string) => void
    let revealed = false
    const result = preparePage(() => new Promise<string>(r => { resolve = r }))
    void result.then(() => { revealed = true })
    await Promise.resolve()
    expect(revealed).toBe(false)
    resolve('complete')
    expect(await result).toEqual({ ok: true, value: 'complete' })
  })
  it('shows a stable failure instead of a late partial result', async () => {
    vi.useFakeTimers()
    let resolve!: (value: string) => void
    const result = preparePage(() => new Promise<string>(r => { resolve = r }), 100)
    await vi.advanceTimersByTimeAsync(100)
    expect(await result).toEqual({ ok: false })
    resolve('late')
    expect(await result).toEqual({ ok: false })
    expect(vi.getTimerCount()).toBe(0)
  })
  it('handles rejected requests and synchronous failures', async () => {
    expect(await preparePage(async () => { throw Error('offline') })).toEqual({ ok: false })
    expect(await preparePage(() => { throw Error('broken') })).toEqual({ ok: false })
  })
  it('waits for existing font metrics without changing the font', async () => {
    const load = vi.fn().mockResolvedValue([])
    vi.stubGlobal('document', { fonts: { load } })
    await preparePageFonts()
    expect(load.mock.calls).toEqual([['400 16px Inter'], ['italic 500 18px "Racer Display"'], ['italic 700 24px "Racer Display"']])
    vi.stubGlobal('document', undefined)
    await expect(preparePageFonts()).resolves.toBeUndefined()
  })
})
