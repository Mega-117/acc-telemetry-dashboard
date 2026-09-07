// @vitest-environment jsdom
import { mount, flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import LoginForm from '~/components/auth/LoginForm.vue'
import RegisterForm from '~/components/auth/RegisterForm.vue'
import ResetPasswordForm from '~/components/auth/ResetPasswordForm.vue'
import RegistrationSuccess from '~/components/auth/RegistrationSuccess.vue'
import AuthField from '~/components/auth/AuthField.vue'
import AuthIcon from '~/components/auth/AuthIcon.vue'
import AuthScene from '~/components/auth/AuthScene.vue'
import BaseButton from '~/components/ui/BaseButton.vue'
import FormError from '~/components/ui/FormError.vue'

const api = vi.hoisted(() => ({ checkEmailVerified: vi.fn(), resendVerificationEmail: vi.fn(), changeVerificationEmail: vi.fn() }))
vi.mock('~/composables/useFirebaseAuth', () => ({ useFirebaseAuth: () => api }))
const global = { components: { UiBaseButton: BaseButton, UiFormError: FormError } }
const wrappers: ReturnType<typeof mount>[] = []
function keep<T extends ReturnType<typeof mount>>(w: T): T { wrappers.push(w); return w }
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('useRuntimeConfig', () => ({ app: { baseURL: '/suite/' } }))
  api.checkEmailVerified.mockResolvedValue({ verified: false })
})
afterEach(() => { wrappers.splice(0).forEach(w => w.unmount()); vi.useRealTimers(); vi.unstubAllGlobals() })

describe('Racer Core authentication presentation', () => {
  it('toggles password presentation without changing its value or submitting', async () => {
    const w = keep(mount(AuthField, { props: { modelValue: 'secret!', type: 'password', label: 'Password' } }))
    expect(w.get('label').attributes('for')).toBe(w.get('input').attributes('id'))
    await w.get('button').trigger('click')
    expect(w.get('input').attributes('type')).toBe('text')
    expect(w.get('input').element.value).toBe('secret!')
    expect(w.emitted('update:modelValue')).toBeUndefined()
    expect(w.get('button').attributes('type')).toBe('button')
    await w.get('button').trigger('click')
    expect(w.get('input').attributes('type')).toBe('password')
  })
  it('keeps login payload trimming, validation and recovery action', async () => {
    const w = keep(mount(LoginForm, { global }))
    await w.get('form').trigger('submit')
    expect(w.text()).toContain('Inserisci la tua email.')
    const inputs = w.findAll('input')
    await inputs[0]!.setValue(' qa@example.invalid ')
    await inputs[1]!.setValue(' secret ')
    expect(w.text()).not.toContain('Inserisci la tua email.')
    await w.get('form').trigger('submit')
    expect(w.emitted('submit')).toEqual([[{ email: 'qa@example.invalid', password: ' secret ' }]])
    await w.get('.auth-forgot').trigger('click')
    expect(w.emitted('forgotPassword')).toHaveLength(1)
    await w.setProps({ loading: true })
    expect(w.get('button[type="submit"]').attributes('disabled')).toBeDefined()
  })
  it('keeps registration matching-password validation and exact payload', async () => {
    const w = keep(mount(RegisterForm, { global }))
    const values = [' QA ', ' Pilot ', ' racer ', 'qa@example.invalid', 'secret', 'different']
    for (const [i, input] of w.findAll('input').entries()) await input.setValue(values[i])
    await w.get('form').trigger('submit')
    expect(w.text()).toContain('Le password non coincidono.')
    expect(w.emitted('submit')).toBeUndefined()
    await w.findAll('input')[5]!.setValue('secret')
    await w.get('form').trigger('submit')
    expect(w.emitted('submit')).toEqual([[{ firstName: 'QA', lastName: 'Pilot', nickname: 'racer', email: 'qa@example.invalid', password: 'secret' }]])
  })
  it('keeps conditional recovery success and exposed reset', async () => {
    const w = keep(mount(ResetPasswordForm, { global }))
    await w.get('input').setValue(' qa@example.invalid ')
    await w.get('form').trigger('submit')
    expect(w.emitted('submit')).toEqual([['qa@example.invalid']])
    w.vm.setSuccess(true)
    await flushPromises()
    expect(w.text()).toContain("Se l'indirizzo è registrato")
    expect(w.find('input').exists()).toBe(false)
    await w.get('button').trigger('click')
    expect(w.emitted('back')).toHaveLength(1)
    w.vm.reset()
    await flushPromises()
    expect(w.get('input').element.value).toBe('')
  })
  it('keeps verification failure, resend cooldown and email correction', async () => {
    vi.useFakeTimers()
    const w = keep(mount(RegistrationSuccess, { props: { email: 'qa@example.invalid', requireEmailVerification: true } }))
    await flushPromises()
    await w.get('.verify-btn').trigger('click'); await flushPromises()
    expect(w.find('.error-message').exists()).toBe(true)
    api.resendVerificationEmail.mockResolvedValue({ success: true })
    await w.get('.resend-btn').trigger('click'); await flushPromises()
    expect(w.emitted('resendEmail')).toHaveLength(1)
    expect(w.get('.resend-btn').attributes('disabled')).toBeDefined()
    await vi.advanceTimersByTimeAsync(4000)
    expect(w.get('.resend-btn').text()).toContain('56s')
    await w.get('.email-fix__toggle').trigger('click')
    await w.get('.email-fix__input').setValue('fixed@example.invalid')
    api.changeVerificationEmail.mockResolvedValue({ success: false, error: 'Riprova' })
    await w.get('.email-fix__form').trigger('submit'); await flushPromises()
    expect(w.text()).toContain('Riprova')
    api.changeVerificationEmail.mockResolvedValue({ success: true })
    await w.get('.email-fix__form').trigger('submit'); await flushPromises()
    expect(api.changeVerificationEmail).toHaveBeenLastCalledWith('fixed@example.invalid')
    expect(w.find('.email-fix__sent').exists()).toBe(true)
  })
  it('keeps verified transition owned by existing verification handler', async () => {
    api.checkEmailVerified.mockResolvedValue({ verified: true })
    const w = keep(mount(RegistrationSuccess, { props: { email: 'qa@example.invalid', requireEmailVerification: true } }))
    await flushPromises()
    expect(w.emitted('goToDashboard')).toHaveLength(1)
  })
  it('uses base-path-aware SVG and disconnects intrinsic-height observer', async () => {
    let callback: ResizeObserverCallback | undefined
    const disconnect = vi.fn(), observe = vi.fn()
    vi.stubGlobal('ResizeObserver', class { constructor(cb: ResizeObserverCallback) { callback = cb } observe = observe; disconnect = disconnect })
    const w = keep(mount(AuthScene, { slots: { default: '<p>Content</p>' } }))
    expect(w.get('img').attributes('src')).toBe('/suite/branding/auth/racer_core_exact.svg')
    expect(observe).toHaveBeenCalled()
    callback!([{ contentRect: { height: 410 } } as ResizeObserverEntry], {} as ResizeObserver)
    await flushPromises()
    expect(w.get('.racer-auth__height').attributes('style')).toContain('410px')
    w.unmount(); wrappers.pop()
    expect(disconnect).toHaveBeenCalledOnce()
  })
  it.each(['check', 'mail', 'arrow', 'back', 'eye'] as const)('renders decorative %s as vector paths', name => {
    const w = keep(mount(AuthIcon, { props: { name } }))
    expect(w.get('svg').attributes('aria-hidden')).toBe('true')
    expect(w.find('path').exists()).toBe(true)
  })
})
