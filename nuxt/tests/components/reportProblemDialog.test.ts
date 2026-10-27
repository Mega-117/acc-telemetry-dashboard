// @vitest-environment jsdom
import { setLocale } from '~/i18n'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

const push = vi.fn()
vi.mock('~/composables/useAppNotifications', () => ({ useAppNotifications: () => ({ push }) }))

async function mountDialog() {
  const { default: Dialog } = await import('~/components/ReportProblemDialog.vue')
  return mount(Dialog, { global: { stubs: { Teleport: true } } })
}

// PIP-665: these checks read the Italian texts; the default would follow the system language.
setLocale('it')

describe('Segnala problema (PIP-661)', () => {
  afterEach(() => { delete (window as { electronAPI?: unknown }).electronAPI; vi.resetModules() })

  it('in a browser points to Discord and sends nothing', async () => {
    const w = await mountDialog()
    expect(w.text()).toContain('Discord')
    expect(w.find('textarea').exists()).toBe(false)
  })

  it('in the desktop program sends the description and shows the support code', async () => {
    const reportProblem = vi.fn(async () => ({ ok: true, code: 'report-20261027T180000-a1b2c3d4', delivered: true }))
    Object.assign(window, { electronAPI: { reportProblem } })
    const w = await mountDialog()
    await w.get('textarea').setValue('  Pressioni non applicate  ')
    await w.get('.rc-btn--primary').trigger('click')
    await flushPromises()
    expect(reportProblem).toHaveBeenCalledWith('Pressioni non applicate')
    expect(w.get('code').text()).toBe('report-20261027T180000-a1b2c3d4')
    expect(w.text()).toContain('Ricevuto')
  })

  it('shows the reason when the program cannot build the package', async () => {
    Object.assign(window, { electronAPI: { reportProblem: async () => ({ ok: false, reason: 'Hai già inviato molti pacchetti oggi: riprova domani.' }) } })
    const w = await mountDialog()
    await w.get('.rc-btn--primary').trigger('click')
    await flushPromises()
    expect(w.get('[role=alert]').text()).toContain('domani')
  })
})
