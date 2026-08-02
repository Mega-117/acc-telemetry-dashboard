import { createSSRApp } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { describe, expect, it } from 'vitest'
import AdminCockpitTable from '~/components/admin/AdminCockpitTable.vue'
import type { AdminCockpitRow } from '~/repositories/adminCockpitRepository'

function rows(): AdminCockpitRow[] {
  const now = new Date().toISOString()
  const pilot = { uid: 'pilot-1', nickname: 'Mario', role: 'pilot' }
  const installation = (installationId: string): AdminCockpitRow => ({
    rowId: `pilot-1:${installationId}`,
    pilot,
    installationCount: 2,
    directoryAvailable: true,
    installation: {
      ownerUid: 'pilot-1',
      installationId,
      installationRegisteredAt: '2026-07-30T18:00:00.000Z',
      lastSuiteLaunchAt: installationId === 'install-a' ? '2026-07-30T18:45:00.000Z' : null,
      lastDashboardOpenedAt: installationId === 'install-a' ? '2026-07-30T18:50:00.000Z' : null,
      lastContactAt: now,
      suiteVersion: '0.4.0-dev.4',
      channel: 'develop',
      updateState: 'current',
      lastCheckAt: null,
      components: { launcher: '0.4.0', logger: null, webapp: '0.4.0', kokoroRuntime: null },
      health: { status: 'healthy', phase: 'ready', reasonCode: null },
      migration: { status: 'healthy', phase: 'completed', progress: 100, code: null, resumedFrom: null },
    },
  })
  return [
    installation('install-a'),
    installation('install-b'),
    {
      rowId: 'pilot-2:no-report',
      pilot: { uid: 'pilot-2', nickname: 'Luigi', role: 'pilot' },
      installation: null,
      installationCount: 0,
      directoryAvailable: true,
    },
  ]
}

describe('AdminCockpitTable', () => {
  it('rende multi-installazione, ultimo contatto e stato senza dichiarare online', async () => {
    const html = await renderToString(createSSRApp(AdminCockpitTable, { rows: rows() }))

    expect(html).toContain('install-a')
    expect(html).toContain('install-b')
    expect(html).toContain('2 installazioni')
    expect(html).toContain('Installazione registrata il')
    expect(html).toContain('Ultimo avvio della Suite')
    expect(html).toContain('Ultima apertura Dashboard')
    expect(html).toContain('Ultima connessione')
    expect(html).toContain('Mai registrato')
    expect(html).not.toContain('<th scope="col">Avvio</th>')
    expect(html).toContain('Contatto recente')
    expect(html).toContain('Nessun report per-installazione')
    expect(html.toLowerCase()).not.toContain('online')
  })

  it('usa skeleton righe coerenti durante il caricamento', async () => {
    const html = await renderToString(createSSRApp(AdminCockpitTable, { rows: [], loading: true }))
    expect(html).toContain('aria-busy="true"')
    expect(html).toContain('skeleton-row')
  })

  it('conserva le righe durante refresh e relativo errore senza tornare allo skeleton', async () => {
    const refreshingHtml = await renderToString(createSSRApp(AdminCockpitTable, {
      rows: rows(),
      loading: true,
    }))
    const refreshErrorHtml = await renderToString(createSSRApp(AdminCockpitTable, {
      rows: rows(),
      error: 'Permesso temporaneamente non disponibile',
    }))

    expect(refreshingHtml).toContain('install-a')
    expect(refreshingHtml).not.toContain('skeleton-row')
    expect(refreshErrorHtml).toContain('Aggiornamento non riuscito')
    expect(refreshErrorHtml).toContain('install-a')
  })

  it('espone stati errore ed empty accessibili', async () => {
    const errorHtml = await renderToString(createSSRApp(AdminCockpitTable, {
      rows: [],
      error: 'Permesso negato',
    }))
    const emptyHtml = await renderToString(createSSRApp(AdminCockpitTable, { rows: [] }))

    expect(errorHtml).toContain('role="alert"')
    expect(errorHtml).toContain('Riprova')
    expect(emptyHtml).toContain('role="status"')
    expect(emptyHtml).toContain('Nessun report runtime')
  })
})
