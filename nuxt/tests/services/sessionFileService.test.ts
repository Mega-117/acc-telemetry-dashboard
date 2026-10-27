// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { setLocale } from '~/i18n'
import { mount } from '@vue/test-utils'
import { canShareOwnedSession } from '~/services/session-detail/sessionFileService'
import SessionFileActions from '~/components/session-detail/SessionFileActions.vue'

// PIP-665: these checks read the Italian texts; the default would follow the system language.
setLocale('it')

describe('session file actions', () => {
  it('allows sharing only the signed-in owner, including an explicit self link', () => {
    expect(canShareOwnedSession('a')).toBe(true)
    expect(canShareOwnedSession('a', 'a')).toBe(true)
    expect(canShareOwnedSession('a', 'b')).toBe(false)
    expect(canShareOwnedSession(undefined)).toBe(false)
  })
  it('offers sharing only to the owner, no export; the outcome is not shown beside the button', async () => {
    const wrapper = mount(SessionFileActions, { props: { canShare: false, sharing: false }, global: { stubs: { UiRacingIcon: { template: '<svg />' } } } })
    expect(wrapper.findAll('button')).toHaveLength(0)
    await wrapper.setProps({ canShare: true })
    expect(wrapper.get('button').text()).toBe('Condividi')
    expect(wrapper.find('svg').exists()).toBe(true)
    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('share')).toHaveLength(1)
    await wrapper.setProps({ sharing: true })
    expect(wrapper.get('button').attributes('disabled')).toBeDefined()
    expect(wrapper.get('button').text()).toBe('Condivisione…')
    // PIP-653: no inline status/alert: it moved Condividi and Confronta sideways.
    expect(wrapper.find('[role=status], [role=alert]').exists()).toBe(false)
  })
})
