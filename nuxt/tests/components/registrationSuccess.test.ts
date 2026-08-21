// @vitest-environment jsdom
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import RegistrationSuccess from '~/components/auth/RegistrationSuccess.vue'

const checkEmailVerified = vi.hoisted(() => vi.fn())
const resendVerificationEmail = vi.hoisted(() => vi.fn())

vi.mock('~/composables/useFirebaseAuth', () => ({
  useFirebaseAuth: () => ({
    checkEmailVerified,
    resendVerificationEmail,
  }),
}))

enableAutoUnmount(afterEach)

describe('RegistrationSuccess verification reconciliation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    checkEmailVerified.mockResolvedValue({ verified: false, error: null })
    resendVerificationEmail.mockResolvedValue({ success: true, alreadyVerified: false })
  })

  function mountGate() {
    return mount(RegistrationSuccess, {
      props: {
        email: 'pilot@example.invalid',
        requireEmailVerification: true,
      },
    })
  }

  it('riconcilia automaticamente lo stato quando il gate viene montato', async () => {
    checkEmailVerified.mockResolvedValue({ verified: true, error: null })
    const wrapper = mountGate()
    await vi.waitFor(() => expect(checkEmailVerified).toHaveBeenCalledOnce())

    expect(wrapper.emitted('goToDashboard')).toHaveLength(1)
  })

  it('riconcilia nuovamente quando la finestra torna online', async () => {
    const wrapper = mountGate()
    await vi.waitFor(() => expect(checkEmailVerified).toHaveBeenCalledOnce())
    checkEmailVerified.mockResolvedValue({ verified: true, error: null })

    window.dispatchEvent(new Event('online'))
    await vi.waitFor(() => expect(checkEmailVerified).toHaveBeenCalledTimes(2))
    expect(wrapper.emitted('goToDashboard')).toHaveLength(1)
  })

  it('entra nella dashboard senza mostrare un falso reinvio se Firebase è già verificato', async () => {
    const wrapper = mountGate()
    await vi.waitFor(() => expect(checkEmailVerified).toHaveBeenCalledOnce())
    resendVerificationEmail.mockResolvedValue({ success: true, alreadyVerified: true })

    await wrapper.get('.resend-btn').trigger('click')
    await nextTick()

    expect(wrapper.emitted('goToDashboard')).toHaveLength(1)
    expect(wrapper.emitted('resendEmail')).toBeUndefined()
  })

  it('non maschera un errore transitorio come email non verificata durante il controllo automatico', async () => {
    checkEmailVerified.mockResolvedValue({
      verified: false,
      error: 'Errore di rete, controlla la connessione',
    })
    const wrapper = mountGate()
    await vi.waitFor(() => expect(checkEmailVerified).toHaveBeenCalledOnce())

    expect(wrapper.find('.error-message').exists()).toBe(false)
    expect(wrapper.emitted('goToDashboard')).toBeUndefined()
  })
})
