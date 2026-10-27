// @vitest-environment jsdom
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import { afterEach, expect, it, vi } from 'vitest'
import ElectronTitlebar from '~/components/electron/ElectronTitlebar.vue'
import { setLocale } from '~/i18n'

// Italian assertions (jsdom defaults to English).
setLocale('it')

vi.mock('~/composables/useElectronSync', () => ({ useElectronSync: () => ({
  isSyncing: ref(false), syncTelemetryFiles: vi.fn().mockResolvedValue([]),
  syncResults: ref([]), pendingNotification: ref(null),
  dataMaintenance: { status: ref('idle'), progress: ref(0), message: ref(''), error: ref(null) },
}) }))
vi.mock('~/composables/useRuntimeCapabilityGate', () => ({ useRuntimeCapabilityGate: () => ({
  gate: () => ref({ allowed: true }), snapshot: ref({ lifecycle: 'ready' }), connect: () => vi.fn(),
}) }))
vi.mock('~/services/cache/telemetryCacheInvalidationService', () => ({ invalidateTelemetryCaches: vi.fn() }))
// PIP-625: the manual sync button is for admins (and development) only.
const admin = ref(false)
vi.mock('~/composables/useFirebaseAuth', () => ({ useFirebaseAuth: () => ({ isAdmin: admin }) }))

afterEach(() => { vi.unstubAllGlobals(); delete window.electronAPI; admin.value = false })

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
    expect(controls).toHaveLength(3) // pilot: minimize, maximize, close; no manual sync
    expect(w.get('.titlebar-title').text()).toBe('Racer Core')
    expect(w.get('.titlebar-title img').attributes('src')).toBe('/suite/branding/auth/racercore-rc.svg')
    expect(w.findAll('button').map(button => button.attributes('title'))).toEqual(controls)
    await w.get('[title="Minimizza"]').trigger('click')
    await w.get('[title="Massimizza"]').trigger('click')
    await w.get('.titlebar-close').trigger('click')
    expect(w.find('[title="Aggiorna pagina (Smart Refresh)"]').exists()).toBe(false)
    expect(api.windowMinimize).toHaveBeenCalledOnce()
    expect(api.windowMaximize).toHaveBeenCalledOnce()
    expect(api.windowClose).toHaveBeenCalledOnce()
    expect(api.pageRefresh).not.toHaveBeenCalled()
    expect(w.get('.titlebar-title').text()).toBe('Racer Core')
    expect(w.find('.titlebar-title img').exists()).toBe(true)
  } finally { w.unmount() }
})

it('uses the compiled Develop identity and icon without changing controls', async () => {
  vi.stubGlobal('useRuntimeConfig', () => ({ app: { baseURL: '/' } }))
  vi.stubGlobal('useRoute', () => ({ params: {}, fullPath: '/' }))
  vi.stubGlobal('useRouter', () => ({ replace: vi.fn() }))
  Object.defineProperty(window, 'electronAPI', { configurable: true, value: {
    windowIsMaximized: vi.fn().mockResolvedValue(false),
    getDistributionIdentity: vi.fn().mockResolvedValue({
      displayName: 'Racer Core Develop', channel: 'develop', icon: 'data:image/x-icon;base64,AA=='
    })
  } })
  const w = mount(ElectronTitlebar, { global: { stubs: {
    ElectronSyncNotification: true, ElectronDataMaintenanceNotification: true,
  } } })
  try {
    await flushPromises()
    expect(w.get('.titlebar-title').text()).toBe('Racer Core Develop')
    expect(w.get('.titlebar-title img').attributes('src')).toBe('data:image/x-icon;base64,AA==')
    expect(w.findAll('button')).toHaveLength(3)
  } finally { w.unmount() }
})

it('shows the manual sync button to admins only (PIP-625)', async () => {
  vi.stubGlobal('useRuntimeConfig', () => ({ app: { baseURL: '/' } }))
  vi.stubGlobal('useRoute', () => ({ params: {}, fullPath: '/' }))
  Object.defineProperty(window, 'electronAPI', { configurable: true, value: { windowIsMaximized: vi.fn().mockResolvedValue(false) } })
  admin.value = true
  const w = mount(ElectronTitlebar, { global: { stubs: { ElectronSyncNotification: true, ElectronDataMaintenanceNotification: true } } })
  try {
    await flushPromises()
    expect(w.findAll('button')).toHaveLength(4)
    expect(w.find('[aria-label="Avvia sincronizzazione cloud"]').exists()).toBe(true)
  } finally { w.unmount() }
})
