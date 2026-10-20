import { describe, expect, it, vi } from 'vitest'
import {
  DIAGNOSTICS_INGEST_ORIGIN,
  buildBundlePrefix,
  downloadDiagnosticBundle,
  formatBundleSize,
  listDiagnosticBundles,
  listRecentDiagnosticBundles,
  parseBundleKey,
  resolveDiagnosticsOrigin,
  saveDiagnosticBundle
} from '~/repositories/diagnosticBundlesRepository'

const KEY = 'diag/11111111-2222-3333-4444-555555555555/2026-10-15/daily-20261015T095554-028d6d83.jsonl.gz'
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body, blob: async () => new Blob(['x']) }) as unknown as Response
const status = (code: number) => ({ ok: false, status: code }) as unknown as Response

describe('diagnosticBundlesRepository', () => {
  it('legge la chiave e rifiuta quelle estranee', () => {
    expect(parseBundleKey(KEY)).toEqual({
      installationId: '11111111-2222-3333-4444-555555555555', date: '2026-10-15',
      bundleId: 'daily-20261015T095554-028d6d83', kind: 'daily'
    })
    expect(parseBundleKey('meta/usage-2026-10-15.json')).toBeNull()
    expect(parseBundleKey('diag/x/../y')).toBeNull()
  })

  it('costruisce il prefisso per installazione e giorno', () => {
    expect(buildBundlePrefix()).toBe('diag/')
    expect(buildBundlePrefix(' abcdefgh ')).toBe('diag/abcdefgh/')
    expect(buildBundlePrefix('abcdefgh', '2026-10-15')).toBe('diag/abcdefgh/2026-10-15/')
    expect(buildBundlePrefix('abcdefgh', 'oggi')).toBe('diag/abcdefgh/')
  })

  it('elenca con il token, ordina dal piu\' recente e salta oggetti non pacchetto', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok({
      objects: [
        { key: KEY, size: 56, uploaded: '2026-10-15T09:55:56Z', uid: 'u1' },
        { key: KEY.replace('095554-028d6d83', '100000-aaaaaaaa'), size: 70, uploaded: '2026-10-15T10:00:00Z' },
        { key: 'diag/junk', size: 1, uploaded: '2026-10-15T11:00:00Z' }
      ],
      cursor: 'next'
    }))
    const page = await listDiagnosticBundles({ getToken: async () => 'tok', fetchImpl, origin: 'https://w.test' }, { installationId: 'abcdefgh' })
    expect(fetchImpl).toHaveBeenCalledWith(expect.stringContaining('https://w.test/v1/admin/list?prefix=diag%2Fabcdefgh%2F'), { headers: { Authorization: 'Bearer tok' } })
    expect(page.items.map((i) => i.size)).toEqual([70, 56])
    expect(page.cursor).toBe('next')
  })

  it('messaggi chiari per 401, 403, altro errore e sessione assente', async () => {
    const run = (response: Response | null) => listDiagnosticBundles({
      getToken: async () => (response ? 'tok' : null), fetchImpl: vi.fn().mockResolvedValue(response)
    })
    await expect(run(status(401))).rejects.toThrow('scaduta')
    await expect(run(status(403))).rejects.toThrow('non è autorizzato')
    await expect(run(status(500))).rejects.toThrow('500')
    await expect(run(null)).rejects.toThrow('Sessione non disponibile')
  })

  it('scarica solo chiavi valide', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok({}))
    const blob = await downloadDiagnosticBundle({ getToken: async () => 'tok', fetchImpl }, KEY)
    expect(blob).toBeInstanceOf(Blob)
    await expect(downloadDiagnosticBundle({ getToken: async () => 'tok', fetchImpl }, '../x')).rejects.toThrow('non valido')
  })

  it('porta motivo e Windows dichiarati dal Worker, null nei pacchetti vecchi (PIP-547)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok({
      objects: [
        { key: KEY, size: 56, uploaded: '2026-10-15T09:55:56Z', trigger: 'app.unclean-exit', os: 'Windows 10 (19045)' },
        { key: KEY.replace('095554-028d6d83', '100000-aaaaaaaa'), size: 70, uploaded: '2026-10-15T10:00:00Z' }
      ]
    }))
    const page = await listDiagnosticBundles({ getToken: async () => 'tok', fetchImpl })
    expect(page.items.map((i) => [i.trigger, i.os])).toEqual([[null, null], ['app.unclean-exit', 'Windows 10 (19045)']])
    expect(page.items.map((i) => [i.version, i.channel])).toEqual([[null, null], [null, null]])
  })

  it('ultimi giorni (PIP-567): un elenco per giorno dal piu\' recente, con versione e canale, senza duplicati', async () => {
    const nowMs = Date.parse('2026-10-16T12:00:00Z')
    const byDay: Record<string, unknown[]> = {
      '2026-10-16': [{ key: KEY.replace('2026-10-15', '2026-10-16'), size: 3, uploaded: '2026-10-16T09:00:00Z', version: '0.5.0-dev.2', channel: 'develop' }],
      '2026-10-14': [{ key: KEY.replace('2026-10-15', '2026-10-14'), size: 2, uploaded: '2026-10-14T10:00:00Z' }],
    }
    const fetchImpl = vi.fn(async (url: string) => {
      const day = new URL(url).searchParams.get('day')!
      return ok({ objects: byDay[day] || [], cursor: null })
    })
    const all = await listRecentDiagnosticBundles({ getToken: async () => 'tok', fetchImpl }, { days: 7, nowMs })
    expect(all.complete).toBe(true)
    expect(all.items.map((i) => [i.date, i.version, i.channel])).toEqual([['2026-10-16', '0.5.0-dev.2', 'develop'], ['2026-10-14', null, null]])
    // Domani (orologi avanti), oggi e i 7 giorni precedenti: 9 elenchi, nessuno scorrimento di `diag/`.
    const days = fetchImpl.mock.calls.map(([url]) => new URL(url).searchParams.get('day'))
    expect(days).toEqual(['2026-10-17', '2026-10-16', '2026-10-15', '2026-10-14', '2026-10-13', '2026-10-12', '2026-10-11', '2026-10-10', '2026-10-09'])
    expect(fetchImpl.mock.calls.every(([url]) => !new URL(url).searchParams.has('prefix'))).toBe(true)

    // Un giorno con piu' pagine viene scorso con il cursore.
    const paged = vi.fn()
      .mockResolvedValueOnce(ok({ objects: [{ key: KEY, size: 1, uploaded: '2026-10-15T10:00:00Z' }], cursor: 'c1' }))
      .mockResolvedValueOnce(ok({ objects: [{ key: KEY.replace('095554-028d6d83', '100000-aaaaaaaa'), size: 1, uploaded: '2026-10-15T11:00:00Z' }], cursor: null }))
      .mockResolvedValue(ok({ objects: [], cursor: null }))
    const twoPages = await listRecentDiagnosticBundles({ getToken: async () => 'tok', fetchImpl: paged }, { days: 1, nowMs })
    expect(twoPages.items).toHaveLength(2)
    expect(paged.mock.calls[1]![0]).toContain('cursor=c1')
  })

  it('ultimi giorni: con un Worker che non conosce ?day= (400) scorre diag/ come prima e dice se e\' incompleto', async () => {
    const recent = KEY.replace('2026-10-15', '2026-10-14')
    const old = KEY.replace('2026-10-15', '2026-09-01')
    const fetchImpl = vi.fn(async (url: string) => {
      if (new URL(url).searchParams.has('day')) return status(400)
      return new URL(url).searchParams.get('cursor') === 'c1'
        ? ok({ objects: [{ key: recent, size: 2, uploaded: '2026-10-14T10:00:00Z' }], cursor: null })
        : ok({ objects: [{ key: old, size: 1, uploaded: '2026-09-01T10:00:00Z' }], cursor: 'c1' })
    })
    const nowMs = Date.parse('2026-10-16T12:00:00Z')
    const all = await listRecentDiagnosticBundles({ getToken: async () => 'tok', fetchImpl }, { days: 7, nowMs })
    expect(all.items.map((i) => i.date)).toEqual(['2026-10-14'])
    expect(all.complete).toBe(true)

    const endless = vi.fn(async (url: string) => (new URL(url).searchParams.has('day') ? status(400) : ok({ objects: [], cursor: 'again' })))
    const partial = await listRecentDiagnosticBundles({ getToken: async () => 'tok', fetchImpl: endless }, { nowMs, maxPages: 2 })
    expect(endless).toHaveBeenCalledTimes(3) // 1 tentativo per giorno + 2 pagine
    expect(partial.complete).toBe(false)
    // Altri errori non si mascherano.
    const broken = vi.fn(async () => status(500))
    await expect(listRecentDiagnosticBundles({ getToken: async () => 'tok', fetchImpl: broken }, { nowMs })).rejects.toThrow('500')
  })

  it('origine del Worker: configurazione valida (https o loopback) oppure produzione (PIP-567)', () => {
    expect(resolveDiagnosticsOrigin(undefined)).toBe(DIAGNOSTICS_INGEST_ORIGIN)
    expect(resolveDiagnosticsOrigin('')).toBe(DIAGNOSTICS_INGEST_ORIGIN)
    expect(resolveDiagnosticsOrigin('http://127.0.0.1:8787/')).toBe('http://127.0.0.1:8787')
    expect(resolveDiagnosticsOrigin('https://x.workers.dev')).toBe('https://x.workers.dev')
    expect(resolveDiagnosticsOrigin('http://evil.example')).toBe(DIAGNOSTICS_INGEST_ORIGIN)
    expect(resolveDiagnosticsOrigin('https://x.workers.dev/path')).toBe(DIAGNOSTICS_INGEST_ORIGIN)
  })

  it('salva il pacchetto con un nome riconoscibile', async () => {
    const clicks: string[] = []
    const link = { href: '', download: '', click: () => clicks.push(link.download) }
    vi.stubGlobal('document', { createElement: () => link })
    vi.stubGlobal('URL', { createObjectURL: () => 'blob:x', revokeObjectURL: vi.fn() })
    try {
      await saveDiagnosticBundle({ getToken: async () => 'tok', fetchImpl: vi.fn().mockResolvedValue(ok({})) },
        { key: KEY, installationId: '11111111-2222-3333-4444-555555555555', bundleId: 'daily-20261015T095554-028d6d83' })
      expect(clicks).toEqual(['11111111-daily-20261015T095554-028d6d83.jsonl.gz'])
    } finally { vi.unstubAllGlobals() }
  })

  it('formatta le dimensioni', () => {
    expect([formatBundleSize(56), formatBundleSize(2048), formatBundleSize(3 * 1024 * 1024), formatBundleSize(-1)])
      .toEqual(['56 B', '2.0 KB', '3.0 MB', '—'])
  })
})
