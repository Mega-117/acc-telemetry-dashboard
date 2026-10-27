// @vitest-environment jsdom
import { setLocale } from '~/i18n'
import { afterEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import UserDropdown from '../../app/components/ui/UserDropdown.vue'

// PIP-665: these checks read the Italian texts; the default would follow the system language.
setLocale('it')

describe('UserDropdown settings entry', () => {
  afterEach(() => {
    delete (window as any).electronAPI
  })

  it('shows and emits settings only in the primary desktop renderer', async () => {
    ;(window as any).electronAPI = { localIdentityRole: 'primary', controlsGetState: () => Promise.resolve({}) }
    const wrapper = mount(UserDropdown, {
      props: { userName: 'Pilota' },
      global: { directives: { clickOutside: () => {} } },
    })
    await wrapper.get('.dropdown-trigger').trigger('click')
    const settings = wrapper.findAll('.dropdown-item').find(button => button.text().includes('Impostazioni'))
    expect(settings?.exists()).toBe(true)
    await settings?.trigger('click')
    expect(wrapper.emitted('goToSettings')).toHaveLength(1)
  })

  it('does not expose settings in the browser', async () => {
    const wrapper = mount(UserDropdown, {
      props: { userName: 'Pilota' },
      global: { directives: { clickOutside: () => {} } },
    })
    await wrapper.get('.dropdown-trigger').trigger('click')
    expect(wrapper.text()).not.toContain('Impostazioni')
  })
})
