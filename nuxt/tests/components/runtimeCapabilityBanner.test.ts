import { createSSRApp } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { describe, expect, it } from 'vitest'
import RuntimeCapabilityBanner from '~/components/electron/RuntimeCapabilityBanner.vue'
import { deriveRuntimeUiModel } from '~/services/runtime/rendererRuntimeBootstrapAdapter'

describe('RuntimeCapabilityBanner', () => {
  it('non renderizza un falso aggiornamento durante la sola attesa auth', async () => {
    const model = deriveRuntimeUiModel({
      lifecycle: 'ready',
      phase: 'auth_pending',
      capabilities: {
        localRead: { state: 'allowed', reason: 'offline_local_invariant' },
        cloudRead: { state: 'pending', reason: 'auth_cloud_pending' },
        cloudWrite: { state: 'pending', reason: 'auth_cloud_pending' },
        sync: { state: 'pending', reason: 'auth_cloud_pending' }
      }
    }, 'electron')

    const html = await renderToString(createSSRApp(RuntimeCapabilityBanner, { model }))
    expect(model.gates.sync.allowed).toBe(false)
    expect(html).not.toContain('Aggiornamento dati in corso')
    expect(html).not.toContain('role="progressbar"')
  })

  it('annuncia partial e progresso senza diventare modale', async () => {
    const model = deriveRuntimeUiModel({
      lifecycle: 'ready',
      phase: 'migrating',
      capabilities: {
        localRead: { state: 'allowed', reason: 'offline_local_invariant' },
        cloudRead: { state: 'allowed', reason: 'migration_read_compatible' },
        cloudWrite: { state: 'pending', reason: 'migration_partial_resume' },
        sync: { state: 'pending', reason: 'migration_partial_resume' }
      },
      migrationProgress: {
        status: 'partial',
        phase: 'rebuild',
        progress: 52
      }
    }, 'electron')

    const html = await renderToString(createSSRApp(RuntimeCapabilityBanner, { model }))
    expect(html).toContain('role="status"')
    expect(html).toContain('Dati cloud parzialmente disponibili')
    expect(html).toContain('role="progressbar"')
    expect(html).toContain('aria-valuenow="52"')
    expect(html).not.toContain('role="dialog"')
  })
})
