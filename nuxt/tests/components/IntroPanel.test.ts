// @vitest-environment jsdom
import { setLocale } from '~/i18n'
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import IntroPanel from '~/components/settings/IntroPanel.vue'

const mock = vi.hoisted(() => ({ open: vi.fn() }))
vi.mock('~/composables/useOnboardingIntro', () => ({ useOnboardingIntro: () => ({ open: mock.open }) }))

// PIP-665: these checks read the Italian texts; the default would follow the system language.
setLocale('it')

describe('IntroPanel (PIP-571)', () => {
  it('reopens the introduction on demand', async () => {
    const wrapper = mount(IntroPanel)
    expect(wrapper.text()).toContain('Introduzione')
    await wrapper.get('button').trigger('click')
    expect(mock.open).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })
})
