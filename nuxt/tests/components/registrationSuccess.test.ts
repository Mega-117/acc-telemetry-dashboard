// @vitest-environment jsdom
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import RegistrationSuccess from '~/components/auth/RegistrationSuccess.vue'

const checkEmailVerified = vi.hoisted(() => vi.fn())
const resendVerificationEmail = vi.hoisted(() => vi.fn())
const changeVerificationEmail = vi.hoisted(() => vi.fn())

vi.mock('~/composables/useFirebaseAuth', () => ({
  useFirebaseAuth: () => ({
    checkEmailVerified,
    resendVerificationEmail,
    changeVerificationEmail,
  }),
}))

enableAutoUnmount(afterEach)

describe('RegistrationSuccess verification reconciliation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    checkEmailVerified.mockResolvedValue({ verified: false, error: null })
    resendVerificationEmail.mockResolvedValue({ success: true, alreadyVerified: false })
    changeVerificationEmail.mockResolvedValue({ success: true })
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

  it('non avvia reinvio e controllo nello stesso momento', async () => {
    let resolveInitialCheck!: (result: { verified: boolean; error: null }) => void
    checkEmailVerified.mockReturnValueOnce(new Promise((resolve) => { resolveInitialCheck = resolve }))
    const wrapper = mountGate()

    await wrapper.get('.resend-btn').trigger('click')
    expect(resendVerificationEmail).not.toHaveBeenCalled()

    resolveInitialCheck({ verified: false, error: null })
    await vi.waitFor(() => expect(wrapper.get('.verify-btn').attributes('disabled')).toBeUndefined())

    let resolveResend!: (result: { success: boolean; alreadyVerified: boolean }) => void
    resendVerificationEmail.mockReturnValueOnce(new Promise((resolve) => { resolveResend = resolve }))
    await wrapper.get('.resend-btn').trigger('click')
    await wrapper.get('.verify-btn').trigger('click')

    expect(resendVerificationEmail).toHaveBeenCalledOnce()
    expect(checkEmailVerified).toHaveBeenCalledOnce()
    resolveResend({ success: true, alreadyVerified: false })
  })

  // --- Correzione dell'indirizzo (PIP-372) ---
  // Senza questa via d'uscita chi sbaglia il dominio resta chiuso fuori: la
  // mail non arriva e non esiste modo di correggere senza un admin.

  /**
   * Apre l'editor solo quando la riconciliazione iniziale ha rilasciato il
   * lock: finche' e' in corso l'azione e' volutamente disabilitata, come le
   * altre di questa schermata.
   */
  async function openEmailEditor(wrapper: ReturnType<typeof mountGate>) {
    await vi.waitFor(() => expect(checkEmailVerified).toHaveBeenCalledOnce())
    await vi.waitFor(() => expect(wrapper.get('.email-fix__toggle').attributes('disabled')).toBeUndefined())
    await wrapper.get('.email-fix__toggle').trigger('click')
  }

  it('offre la correzione dell’indirizzo e la inoltra al composable', async () => {
    const wrapper = mountGate()
    await openEmailEditor(wrapper)

    await wrapper.get('.email-fix__input').setValue('corretta@gmail.com')
    await wrapper.get('.email-fix__form').trigger('submit')
    await vi.waitFor(() => expect(changeVerificationEmail).toHaveBeenCalledWith('corretta@gmail.com'))

    // L'esito dice che l'indirizzo cambia solo dopo il click sul link, perche'
    // e' esattamente cio' che fa verifyBeforeUpdateEmail.
    await vi.waitFor(() => expect(wrapper.get('.email-fix__sent').text()).toContain('solo dopo'))
  })

  it('avverte sul dominio quasi giusto anche nella correzione', async () => {
    const wrapper = mountGate()
    await openEmailEditor(wrapper)

    await wrapper.get('.email-fix__input').setValue('pilota@gmail.co')
    await nextTick()

    const hint = wrapper.get('.email-fix__hint').text()
    expect(hint).toContain('@gmail.com')
    expect(hint).not.toContain('pilota')
  })

  it('mostra l’errore e resta nel form se Firebase rifiuta', async () => {
    changeVerificationEmail.mockResolvedValue({ success: false, error: 'Email gia registrata' })
    const wrapper = mountGate()
    await openEmailEditor(wrapper)

    await wrapper.get('.email-fix__input').setValue('occupata@gmail.com')
    await wrapper.get('.email-fix__form').trigger('submit')

    await vi.waitFor(() => expect(wrapper.get('.error-message').text()).toBe('Email gia registrata'))
    expect(wrapper.find('.email-fix__sent').exists()).toBe(false)
    expect(wrapper.find('.email-fix__input').exists()).toBe(true)
  })

  it('non avvia due cambi email contemporanei', async () => {
    let resolveChange!: (result: { success: boolean }) => void
    changeVerificationEmail.mockReturnValueOnce(new Promise((resolve) => { resolveChange = resolve }))
    const wrapper = mountGate()
    await openEmailEditor(wrapper)

    await wrapper.get('.email-fix__input').setValue('corretta@gmail.com')
    await wrapper.get('.email-fix__form').trigger('submit')
    await wrapper.get('.email-fix__form').trigger('submit')

    expect(changeVerificationEmail).toHaveBeenCalledOnce()
    resolveChange({ success: true })
  })

  it('rilascia il lock anche se il controllo rifiuta la promise', async () => {
    checkEmailVerified.mockRejectedValueOnce(new Error('temporary'))
    const wrapper = mountGate()
    await vi.waitFor(() => expect(checkEmailVerified).toHaveBeenCalledOnce())
    await vi.waitFor(() => expect(wrapper.get('.verify-btn').attributes('disabled')).toBeUndefined())

    await wrapper.get('.verify-btn').trigger('click')
    await vi.waitFor(() => expect(checkEmailVerified).toHaveBeenCalledTimes(2))
  })
})
