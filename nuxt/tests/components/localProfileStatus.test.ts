// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import { beforeEach, expect, it, vi } from 'vitest'
import LocalProfileStatus from '~/components/electron/LocalProfileStatus.vue'
const mock = vi.hoisted(() => ({ auth: null as any }))
vi.mock('~/composables/useFirebaseAuth', () => ({ useFirebaseAuth: () => mock.auth }))
beforeEach(() => {
  mock.auth = { localProfile: ref({ uid: 'a', email: 'a@example.invalid', offlineReady: true }),
    cloudSessionReady: ref(false), authSessionStatus: ref('signed-out'),
    login: vi.fn(async () => ({ success: false, error: 'Connessione assente' })),
    resetPassword: vi.fn(async () => ({ success: true })) }
})
it('06/11: at a normal start the cloud arrives within the grace time and the bar never shows', async () => {
  vi.useFakeTimers()
  const wrapper = mount(LocalProfileStatus, { global: { stubs: { AuthLoginForm: true } } })
  expect(wrapper.find('aside').exists()).toBe(false)
  await vi.advanceTimersByTimeAsync(1000)
  mock.auth.cloudSessionReady.value = true
  await vi.advanceTimersByTimeAsync(10000)
  expect(wrapper.find('aside').exists()).toBe(false)
  vi.useRealTimers()
})
it('explains local availability and provides optional reconnection without blocking the page', async () => {
  vi.useFakeTimers()
  const wrapper = mount(LocalProfileStatus, { global: { stubs: { AuthLoginForm: true } } })
  expect(wrapper.find('aside').exists()).toBe(false)
  await vi.advanceTimersByTimeAsync(5000)
  vi.useRealTimers()
  expect(wrapper.text()).toContain('Funzioni locali disponibili')
  expect(wrapper.text()).toContain('su questo computer')
  expect(wrapper.find('details').exists()).toBe(true)
  wrapper.findComponent({ name: 'AuthLoginForm' }).vm.$emit('submit', { email: 'a@example.invalid', password: 'qa' })
  await vi.waitFor(() => expect(wrapper.text()).toContain('Connessione assente'))
  expect(mock.auth.localProfile.value.uid).toBe('a')
  mock.auth.cloudSessionReady.value = true
  await wrapper.vm.$nextTick()
  expect(wrapper.find('aside').exists()).toBe(false)
})
