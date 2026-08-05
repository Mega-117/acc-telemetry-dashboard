// @vitest-environment jsdom
import { defineComponent, h, nextTick, reactive } from 'vue'
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AuthOverlay from '~/components/auth/AuthOverlay.vue'

const resetPasswordMock = vi.hoisted(() => vi.fn())

vi.mock('~/composables/useFirebaseAuth', () => ({
  useFirebaseAuth: () => ({
    login: vi.fn(),
    register: vi.fn(),
    resetPassword: resetPasswordMock
  })
}))

const LoginStub = defineComponent({
  emits: ['forgotPassword'],
  setup(_, { emit }) {
    return () => h('button', {
      'data-testid': 'forgot-password',
      onClick: () => emit('forgotPassword')
    }, 'forgot')
  }
})

const RegisterStub = defineComponent(() => () => h('div', 'register'))

const ResetStub = defineComponent({
  emits: ['submit', 'back'],
  setup(_, { emit, expose }) {
    const state = reactive({
      loading: false,
      success: false,
      error: ''
    })

    expose({
      setLoading: (value: boolean) => { state.loading = value },
      setSuccess: (value: boolean) => { state.success = value },
      setError: (message: string) => { state.error = message },
      reset: () => {
        state.loading = false
        state.success = false
        state.error = ''
      }
    })

    return () => h('div', [
      h('button', {
        'data-testid': 'submit-reset',
        disabled: state.loading,
        onClick: () => emit('submit', 'qa@example.invalid')
      }, 'submit'),
      h('span', { 'data-testid': 'reset-state' }, state.success ? 'success' : state.error),
      h('span', { 'data-testid': 'reset-loading' }, state.loading ? 'loading' : 'idle')
    ])
  }
})

describe('AuthOverlay password reset', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function mountOverlay() {
    return mount(AuthOverlay, {
      global: {
        stubs: {
          AuthLoginForm: LoginStub,
          AuthRegisterForm: RegisterStub,
          AuthResetPasswordForm: ResetStub
        }
      }
    })
  }


  it('shows success only after Firebase reset resolves', async () => {
    let resolveRequest!: (result: { success: boolean }) => void
    const request = new Promise<{ success: boolean }>((resolve) => {
      resolveRequest = resolve
    })
    resetPasswordMock.mockReturnValue(request)

    const wrapper = mountOverlay()
    await wrapper.get('[data-testid="forgot-password"]').trigger('click')
    await nextTick()
    await wrapper.get('[data-testid="submit-reset"]').trigger('click')
    await nextTick()

    expect(resetPasswordMock).toHaveBeenCalledWith('qa@example.invalid')
    expect(wrapper.get('[data-testid="reset-state"]').text()).toBe('')
    expect(wrapper.get('[data-testid="reset-loading"]').text()).toBe('loading')

    resolveRequest({ success: true })
    await request
    await nextTick()

    expect(wrapper.get('[data-testid="reset-state"]').text()).toBe('success')
    expect(wrapper.get('[data-testid="reset-loading"]').text()).toBe('idle')
  })

  it('shows the mapped error and does not log the submitted email', async () => {
    resetPasswordMock.mockResolvedValue({
      success: false,
      error: 'Errore di rete, controlla la connessione'
    })
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {})

    const wrapper = mountOverlay()
    await wrapper.get('[data-testid="forgot-password"]').trigger('click')
    await nextTick()
    await wrapper.get('[data-testid="submit-reset"]').trigger('click')
    await nextTick()

    expect(wrapper.get('[data-testid="reset-state"]').text()).toBe('Errore di rete, controlla la connessione')
    expect(wrapper.get('[data-testid="reset-loading"]').text()).toBe('idle')
    expect(consoleError).not.toHaveBeenCalledWith(expect.stringContaining('qa@example.invalid'))
    expect(consoleLog).not.toHaveBeenCalledWith(expect.stringContaining('qa@example.invalid'))

    consoleError.mockRestore()
    consoleLog.mockRestore()
  })
})