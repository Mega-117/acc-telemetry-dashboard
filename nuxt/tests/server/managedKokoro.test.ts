import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { managedKokoro, resolveManagedSuiteRoot } from '../../server/utils/managedKokoro'

const folders: string[] = []
afterEach(() => { for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true }); vi.unstubAllEnvs() })
describe('managed frontend linkage', () => {
  it('requires explicit suite configuration', () => {
    expect(() => resolveManagedSuiteRoot(undefined)).toThrow('non configurato')
  })
  it('accepts only the frontend linked by that suite', () => {
    const root = mkdtempSync(join(tmpdir(), 'managed-voice-')); folders.push(root)
    const frontend = join(root, 'acc-telemetry-dashboard/nuxt'); mkdirSync(frontend, { recursive: true })
    expect(resolveManagedSuiteRoot(root, frontend)).toBe(realpathSync(root))
    expect(() => resolveManagedSuiteRoot(root, root)).toThrow('non corrisponde')
  })
  it('rejects production before loading local code', () => {
    vi.stubEnv('NODE_ENV', 'production')
    expect(() => managedKokoro()).toThrow('produzione')
  })
})
