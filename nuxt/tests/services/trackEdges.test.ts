// PIP-636: bordi della pista dal sito quando il programma desktop non c'e'.
import { describe, expect, it, vi } from 'vitest'
import { loadWebTrackEdges, parseTrackEdges, trackEdgeKey } from '~/services/telemetry/trackEdges'

const edges = { source: 'acc-drive', left: [[0, 0], [1, 1]], right: [[0, 1], [1, 2]] }
const ok = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200 }))

describe('trackEdges', () => {
  it('builds the same file key as the desktop app', () => {
    expect(trackEdgeKey('Hungaroring')).toBe('hungaroring')
    expect(trackEdgeKey(' Brands Hatch ')).toBe('brands_hatch')
    expect(trackEdgeKey('nurburgring', '24h')).toBe('nurburgring__24h')
    expect(trackEdgeKey('')).toBeNull()
  })

  it('keeps only two valid lines of points', () => {
    expect(parseTrackEdges(edges)).toEqual({ left: edges.left, right: edges.right })
    expect(parseTrackEdges({ left: [[0, 0]], right: edges.right })).toBeNull()
    expect(parseTrackEdges({ left: [[0, 'x'], [1, 1]], right: edges.right })).toBeNull()
    expect(parseTrackEdges(null)).toBeNull()
  })

  it('loads the track file once from the site, under the base path', async () => {
    const fetchFn = vi.fn(() => ok(edges)) as unknown as typeof fetch
    const deps = { fetch: fetchFn, publicPath: (p: string) => `/base${p}` }
    expect(await loadWebTrackEdges('Spa', 'acc', null, deps)).toEqual({ left: edges.left, right: edges.right })
    await loadWebTrackEdges('spa', 'acc', null, deps)
    expect(fetchFn).toHaveBeenCalledTimes(1)
    expect(fetchFn).toHaveBeenCalledWith('/base/track-edges/acc/spa.json')
  })

  it('gives no edges for missing tracks and retries after a network error', async () => {
    const missing = vi.fn(() => Promise.resolve(new Response('', { status: 404 }))) as unknown as typeof fetch
    expect(await loadWebTrackEdges('nowhere', 'acc', null, { fetch: missing, publicPath: p => p })).toBeNull()
    const flaky = vi.fn().mockRejectedValueOnce(new Error('offline')).mockImplementation(() => ok(edges)) as unknown as typeof fetch
    expect(await loadWebTrackEdges('zolder', 'acc', null, { fetch: flaky, publicPath: p => p })).toBeNull()
    expect(await loadWebTrackEdges('zolder', 'acc', null, { fetch: flaky, publicPath: p => p })).not.toBeNull()
  })
})
