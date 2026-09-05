// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import Notification from '~/components/electron/DataMaintenanceNotification.vue'

describe('DataMaintenanceNotification', () => {
  it('mostra errore recuperabile senza percentuale o falsa riuscita', async () => {
    const wrapper = mount(Notification, { props: { visible: true, status: 'failed', progress: 100, message: '', error: 'Limite temporaneo', canRetry: true } })
    expect(wrapper.text()).toContain('Controllo dati non completato')
    expect(wrapper.text()).toContain('Limite temporaneo')
    expect(wrapper.find('.progress-label').exists()).toBe(false)
    await wrapper.get('.notification-retry').trigger('click')
    expect(wrapper.emitted('retry')).toHaveLength(1)
    expect(wrapper.emitted('close')).toBeUndefined()
    await wrapper.get('.notification-close').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
    wrapper.unmount()
  })

  it('non offre retry Electron di default e non chiude durante il controllo', async () => {
    const wrapper = mount(Notification, { props: { visible: true, status: 'checking', progress: 5, message: 'Controllo' } })
    expect(wrapper.text()).toContain('5%')
    await wrapper.get('.maintenance-notification').trigger('click')
    expect(wrapper.emitted('close')).toBeUndefined()
    await wrapper.setProps({ status: 'failed' })
    expect(wrapper.find('.notification-retry').exists()).toBe(false)
    await wrapper.setProps({ status: 'completed', progress: 100 })
    expect(wrapper.get('.maintenance-notification').classes()).toContain('success')
    expect(wrapper.text()).toContain('100%')
    wrapper.unmount()
  })
})
