import { describe, expect, it, vi } from 'vitest'
import {
  buildBundlePrefix,
  downloadDiagnosticBundle,
  formatBundleSize,
  listDiagnosticBundles,
  parseBundleKey
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

  it('formatta le dimensioni', () => {
    expect([formatBundleSize(56), formatBundleSize(2048), formatBundleSize(3 * 1024 * 1024), formatBundleSize(-1)])
      .toEqual(['56 B', '2.0 KB', '3.0 MB', '—'])
  })
})
