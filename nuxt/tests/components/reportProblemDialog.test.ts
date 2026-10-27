// @vitest-environment jsdom
import { setLocale } from '~/i18n'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

async function mountDialog() {
  const { default: Dialog } = await import('~/components/ReportProblemDialog.vue')
  return mount(Dialog, { global: { stubs: { Teleport: true } } })
}

async function sendWith(answer: unknown, note = 'Pressioni non applicate') {
  const reportProblem = vi.fn(async () => answer)
  Object.assign(window, { electronAPI: { reportProblem } })
  const w = await mountDialog()
  await w.get('textarea').setValue(note)
  await w.get('.rc-btn--primary').trigger('click')
  await flushPromises()
  return { w, reportProblem }
}

// PIP-665: these checks read the Italian texts; the default would follow the system language.
setLocale('it')

describe('Segnala problema (PIP-661, decision 27/10)', () => {
  afterEach(() => { delete (window as { electronAPI?: unknown }).electronAPI; vi.resetModules() })

  it('in a browser points to Discord and sends nothing', async () => {
    const w = await mountDialog()
    expect(w.text()).toContain('Discord')
    expect(w.find('textarea').exists()).toBe(false)
  })

  it('sends the description and only says "Inviato, grazie": no code is shown', async () => {
    const { w, reportProblem } = await sendWith({ ok: true, code: 'report-20261027T180000-a1b2c3d4', delivered: true }, '  Pressioni non applicate  ')
    expect(reportProblem).toHaveBeenCalledWith('Pressioni non applicate')
    expect(w.get('[role=status]').text()).toBe('Inviato, grazie.')
    expect(w.text()).not.toContain('report-20261027')
    expect(w.find('code').exists()).toBe(false)
  })

  it('offline: says the report stays on the PC and leaves later', async () => {
    const { w } = await sendWith({ ok: true, delivered: false })
    expect(w.get('[role=status]').text()).toContain('rimasta sul PC')
  })

  it('Invia stays off until something is written', async () => {
    Object.assign(window, { electronAPI: { reportProblem: vi.fn() } })
    const w = await mountDialog()
    expect(w.get('.rc-btn--primary').attributes('disabled')).toBeDefined()
    await w.get('textarea').setValue('   ')
    expect(w.get('.rc-btn--primary').attributes('disabled')).toBeDefined()
  })

  it('the anti-spam limits are friendly messages, nothing else is offered', async () => {
    expect((await sendWith({ ok: false, error: 'limit', limit: 'day' })).w.get('[role=status]').text()).toContain('abbastanza segnalazioni per oggi')
    expect((await sendWith({ ok: false, error: 'limit', limit: 'wait', waitMinutes: 7 })).w.get('[role=status]').text()).toContain('riprova tra 7 minuti')
    expect((await sendWith({ ok: false, error: 'limit', limit: 'duplicate' })).w.get('[role=status]').text()).toContain('già inviato questa segnalazione')
  })

  it('errors are translated from the program codes, with a generic fallback', async () => {
    expect((await sendWith({ ok: false, error: 'bundle-cap', reason: 'x' })).w.get('[role=alert]').text()).toContain('domani')
    expect((await sendWith({ ok: false, error: 'rejected' })).w.get('[role=alert]').text()).toContain('Discord')
    expect((await sendWith({ ok: false, reason: 'Vecchio testo' })).w.get('[role=alert]').text()).toBe('Invio non riuscito. Riprova.')
  })
})
