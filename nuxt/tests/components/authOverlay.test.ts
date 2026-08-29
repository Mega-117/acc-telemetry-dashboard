// @vitest-environment jsdom
import { defineComponent, h, nextTick, reactive } from 'vue'
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AuthOverlay from '~/components/auth/AuthOverlay.vue'

const resetPasswordMock = vi.hoisted(() => vi.fn())
const loginMock = vi.hoisted(() => vi.fn())
const registerMock = vi.hoisted(() => vi.fn())

vi.mock('~/composables/useFirebaseAuth', () => ({
  useFirebaseAuth: () => ({
    login: loginMock,
    register: registerMock,
    resetPassword: resetPasswordMock
  })
}))

const LoginStub = defineComponent({
  props: { loading: Boolean },
  emits: ['forgotPassword', 'submit'],
  setup(props, { emit }) {
    return () => h('div', [
      h('button', {
        'data-testid': 'forgot-password',
        disabled: props.loading,
        onClick: () => emit('forgotPassword')
      }, 'forgot'),
      h('button', {
        'data-testid': 'submit-login',
        disabled: props.loading,
        onClick: () => emit('submit', {
          email: 'verified@example.invalid',
          password: 'secret',
        })
      }, 'login'),
    ])
  }
})

const RegisterStub = defineComponent({
  props: { loading: Boolean },
  emits: ['submit'],
  setup(props, { emit }) {
    return () => h('button', {
      'data-testid': 'submit-register',
      disabled: props.loading,
      onClick: () => emit('submit', {
        firstName: 'QA',
        lastName: 'Pilot',
        nickname: 'qa-pilot',
        email: 'register@example.invalid',
        password: 'secret',
      }),
    }, 'register')
  },
})

const ResetStub = defineComponent({
  props: { loading: Boolean },
  emits: ['submit', 'back'],
  setup(props, { emit, expose }) {
    const state = reactive({
      success: false,
      error: ''
    })

    expose({
      setSuccess: (value: boolean) => { state.success = value },
      setError: (message: string) => { state.error = message },
      reset: () => {
        state.success = false
        state.error = ''
      }
    })

    return () => h('div', [
      h('button', {
        'data-testid': 'submit-reset',
        disabled: props.loading,
        onClick: () => emit('submit', 'qa@example.invalid')
      }, 'submit'),
      h('span', { 'data-testid': 'reset-state' }, state.success ? 'success' : state.error),
      h('span', { 'data-testid': 'reset-loading' }, props.loading ? 'loading' : 'idle')
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

  it('non emette un secondo verdetto emailVerified dopo il login', async () => {
    loginMock.mockResolvedValue({
      success: true,
      user: { emailVerified: false },
    })
    const wrapper = mountOverlay()

    await wrapper.get('[data-testid="submit-login"]').trigger('click')
    await nextTick()

    expect(wrapper.emitted('login-success')).toEqual([
      ['verified@example.invalid'],
    ])
  })

  it('rende login single-flight anche con due invii concorrenti', async () => {
    let resolveLogin!: (result: { success: boolean }) => void
    loginMock.mockReturnValue(new Promise((resolve) => { resolveLogin = resolve }))
    const wrapper = mountOverlay()

    const button = wrapper.get('[data-testid="submit-login"]')
    await Promise.all([button.trigger('click'), button.trigger('click')])

    expect(loginMock).toHaveBeenCalledOnce()
    expect(button.attributes('disabled')).toBeDefined()

    resolveLogin({ success: true })
    await vi.waitFor(() => expect(wrapper.emitted('login-success')).toHaveLength(1))
  })

  it('rende registrazione single-flight e blocca il cambio tab durante la richiesta', async () => {
    let resolveRegister!: (result: { success: boolean }) => void
    registerMock.mockReturnValue(new Promise((resolve) => { resolveRegister = resolve }))
    const wrapper = mountOverlay()
    await wrapper.findAll('.auth-nav__item')[1]!.trigger('click')

    const button = wrapper.get('[data-testid="submit-register"]')
    await Promise.all([button.trigger('click'), button.trigger('click')])

    expect(registerMock).toHaveBeenCalledOnce()
    expect(wrapper.findAll('.auth-nav__item').every(tab => tab.attributes('disabled') !== undefined)).toBe(true)

    resolveRegister({ success: true })
    await vi.waitFor(() => expect(wrapper.emitted('register-success')).toHaveLength(1))
  })


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
