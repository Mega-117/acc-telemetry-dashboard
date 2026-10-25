// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { canShareOwnedSession } from '~/services/session-detail/sessionFileService'
import SessionFileActions from '~/components/session-detail/SessionFileActions.vue'

describe('session file actions', () => {
  it('allows sharing only the signed-in owner, including an explicit self link', () => {
    expect(canShareOwnedSession('a')).toBe(true)
    expect(canShareOwnedSession('a', 'a')).toBe(true)
    expect(canShareOwnedSession('a', 'b')).toBe(false)
    expect(canShareOwnedSession(undefined)).toBe(false)
  })
  it('offers sharing only to the owner, no export; shows errors and completion', async () => {
    const wrapper = mount(SessionFileActions, { props: { canShare: false, sharing: false, success: false, error: null } })
    expect(wrapper.findAll('button')).toHaveLength(0)
    await wrapper.setProps({ canShare: true })
    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('share')).toHaveLength(1)
    await wrapper.setProps({ sharing: true, success: true, error: 'Non riuscita' })
    expect(wrapper.get('button').attributes('disabled')).toBeDefined()
    expect(wrapper.get('[role=status]').text()).toContain('copiato')
    expect(wrapper.get('[role=alert]').text()).toBe('Non riuscita')
  })
})
