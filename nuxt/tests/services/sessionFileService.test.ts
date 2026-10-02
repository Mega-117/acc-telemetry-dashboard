// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { canShareOwnedSession, downloadSession, prepareSessionExport } from '~/services/session-detail/sessionFileService'
import SessionFileActions from '~/components/session-detail/SessionFileActions.vue'

describe('session file actions', () => {
  const raw = { schema: 'racercore.session', version: 1, game_id: 'evo', ownerId: 'owner',
    session_info: { track: 'Spa', track_variant: 'long' }, stints: [{ laps: [{ validity: 'unknown', lap_time_ms: null }] }],
    summary: { schema: 'common', version: 1 }, provenance: { adapter: 'fixture' } }
  it('roundtrips every recording field without reassignment or ACC conversion', () => {
    const exported = prepareSessionExport(raw, '../evo/session')
    expect(exported.fileName).toBe('session____evo_session.json')
    expect(JSON.parse(exported.text)).toEqual(raw)
    expect(() => prepareSessionExport({ ...raw, version: 99 }, 'x')).toThrow('non supportato')
  })
  it('allows sharing only the signed-in owner, including an explicit self link', () => {
    expect(canShareOwnedSession('a')).toBe(true)
    expect(canShareOwnedSession('a', 'a')).toBe(true)
    expect(canShareOwnedSession('a', 'b')).toBe(false)
    expect(canShareOwnedSession(undefined)).toBe(false)
  })
  it('downloads the recording and releases its temporary URL', () => {
    const create = vi.fn(() => 'blob:qa'), revoke = vi.fn()
    vi.stubGlobal('URL', { createObjectURL: create, revokeObjectURL: revoke })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    downloadSession(raw, 'qa')
    expect(create).toHaveBeenCalledWith(expect.any(Blob))
    expect(click).toHaveBeenCalledOnce()
    expect(revoke).not.toHaveBeenCalled()
    window.dispatchEvent(new Event('pagehide'))
    expect(revoke).toHaveBeenCalledWith('blob:qa')
    vi.unstubAllGlobals(); click.mockRestore()
  })
  it('exposes export to readers and sharing only to owner; shows errors and completion', async () => {
    const wrapper = mount(SessionFileActions, { props: { canShare: false, sharing: false, success: false, error: null } })
    expect(wrapper.findAll('button')).toHaveLength(1)
    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('export')).toHaveLength(1)
    await wrapper.setProps({ canShare: true })
    await wrapper.findAll('button')[1]!.trigger('click')
    expect(wrapper.emitted('share')).toHaveLength(1)
    await wrapper.setProps({ sharing: true, success: true, error: 'Non riuscita' })
    expect(wrapper.findAll('button')[1]!.attributes('disabled')).toBeDefined()
    expect(wrapper.get('[role=status]').text()).toContain('copiato')
    expect(wrapper.get('[role=alert]').text()).toBe('Non riuscita')
  })
})
