// @vitest-environment jsdom
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import { afterEach, expect, it, vi } from 'vitest'
import ElectronTitlebar from '~/components/electron/ElectronTitlebar.vue'

vi.mock('~/composables/useElectronSync', () => ({ useElectronSync: () => ({
  isSyncing: ref(false), syncTelemetryFiles: vi.fn().mockResolvedValue([]),
  syncResults: ref([]), pendingNotification: ref(null),
  dataMaintenance: { status: ref('idle'), progress: ref(0), message: ref(''), error: ref(null) },
}) }))
vi.mock('~/composables/useRuntimeCapabilityGate', () => ({ useRuntimeCapabilityGate: () => ({
  gate: () => ref({ allowed: true }), snapshot: ref({ lifecycle: 'ready' }), connect: () => vi.fn(),
}) }))
vi.mock('~/services/cache/telemetryCacheInvalidationService', () => ({ invalidateTelemetryCaches: vi.fn() }))

afterEach(() => { vi.unstubAllGlobals(); delete window.electronAPI })

it('uses the login Racer Core branding everywhere while preserving every window control', async () => {
  vi.stubGlobal('useRuntimeConfig', () => ({ app: { baseURL: '/suite/' } }))
  vi.stubGlobal('useRoute', () => ({ params: {}, fullPath: '/' }))
  vi.stubGlobal('useRouter', () => ({ replace: vi.fn() }))
  const api = {
    windowIsMaximized: vi.fn().mockResolvedValue(false), windowMinimize: vi.fn(),
    windowMaximize: vi.fn().mockResolvedValue(true), windowClose: vi.fn(), pageRefresh: vi.fn(),
  }
  Object.defineProperty(window, 'electronAPI', { configurable: true, value: api })
  const w = mount(ElectronTitlebar, { global: { stubs: {
    ElectronSyncNotification: true, ElectronDataMaintenanceNotification: true,
  } } })
  try {
    await flushPromises()
    const controls = w.findAll('button').map(button => button.attributes('title'))
    expect(controls).toHaveLength(5)
    expect(w.get('.titlebar-title').text()).toBe('RACER CORE')
    expect(w.get('.titlebar-title img').attributes('src')).toBe('/suite/branding/auth/racercore-rc.svg')
    expect(w.findAll('button').map(button => button.attributes('title'))).toEqual(controls)
    await w.get('[title="Minimizza"]').trigger('click')
    await w.get('[title="Massimizza"]').trigger('click')
    await w.get('.titlebar-close').trigger('click')
    await w.get('[title="Aggiorna pagina (Smart Refresh)"]').trigger('click')
    expect(api.windowMinimize).toHaveBeenCalledOnce()
    expect(api.windowMaximize).toHaveBeenCalledOnce()
    expect(api.windowClose).toHaveBeenCalledOnce()
    expect(api.pageRefresh).toHaveBeenCalledOnce()
    expect(w.get('.titlebar-title').text()).toBe('RACER CORE')
    expect(w.find('.titlebar-title img').exists()).toBe(true)
  } finally { w.unmount() }
})
