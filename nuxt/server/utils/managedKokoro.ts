import { realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'

const requireLocal = createRequire(import.meta.url)
interface Runtime {
  readStatus: () => Promise<{ state: 'online' | 'starting' | 'offline' | 'error', message?: string, voices?: unknown[], managed?: boolean, managedPid?: number | null }>
  start: () => Promise<{ status: string, message?: string }>
  stop: () => { status: string, pid?: number }
}
let runtime: Runtime | undefined

export function resolveManagedSuiteRoot(root: string | undefined, frontend = process.cwd()): string {
  if (!root) throw new Error('Runtime locale non configurato: avviare scripts/managed-frontend.ps1 dalla suite.')
  const resolved = realpathSync(root)
  if (realpathSync(join(resolved, 'acc-telemetry-dashboard', 'nuxt')) !== realpathSync(frontend)) {
    throw new Error('Il frontend non corrisponde al collegamento della suite configurata.')
  }
  return resolved
}

// Reuse desktop lifecycle and identity checks; no Python discovery or port-only trust.
export function managedKokoro(): Runtime {
  if (process.env.NODE_ENV === 'production') throw new Error('Runtime vocale dev non disponibile in produzione.')
  if (!runtime) {
    const root = resolveManagedSuiteRoot(process.env.RACERCORE_SUITE_ROOT)
    const appRoot = resolve(root, 'desktop-app')
    const { resolveRuntimeStatePaths } = requireLocal(join(appRoot, 'runtime/runtimeStatePaths.js'))
    const state = resolveRuntimeStatePaths({ suiteRoot: root })
    const { createKokoroRuntime } = requireLocal(join(appRoot, 'runtime/kokoroRuntime.js'))
    runtime = createKokoroRuntime({ suiteRoot: root, appRoot, dataRoot: state.dataRoot, tempRoot: state.tempPath, isPackaged: false })
  }
  return runtime!
}
