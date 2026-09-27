// @vitest-environment jsdom
import { createApp, h, nextTick, ref } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ControlKFriendRequests from '~/components/overlay/ControlKFriendRequests.vue'
import { useOverlayActionSelection } from '~/composables/useOverlayActionSelection'
import type { FriendRequestSnapshot } from '~/services/pitwall/friendRequestQueue'

let app: ReturnType<typeof createApp>
afterEach(() => { app?.unmount(); document.body.innerHTML = ''; vi.restoreAllMocks() })
const snapshot = (id = 'A', revision = 1): FriendRequestSnapshot & { revision: number } => ({ session: 'session',
  requests: [id, 'B'].map(personId => ({ id: personId, personId, nickname: `@${personId}` })), busy: false, error: null, revision })
function mount() {
  let receive!: (state: ReturnType<typeof snapshot>) => void
  const stop = vi.fn(); const respond = vi.fn(async () => ({ accepted: true }))
  let resolveGet!: (value: ReturnType<typeof snapshot>) => void
  const api = { friendRequestsRespond: respond, onFriendRequestsState: (callback: typeof receive) => { receive = callback; return stop },
    friendRequestsGet: () => new Promise<ReturnType<typeof snapshot>>(resolve => { resolveGet = resolve }) }
  let nav!: ReturnType<typeof useOverlayActionSelection>
  const host = document.createElement('main'); document.body.append(host)
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList)
  app = createApp({ setup() {
    const root = ref<HTMLElement | null>(null)
    nav = useOverlayActionSelection(root, () => true)
    return () => h('div', { ref: root }, [h('button', { 'data-overlay-wheel-action': 'pitwall' }, 'Pitwall'), h(ControlKFriendRequests, { api })])
  } }); app.mount(host)
  return { host, stop, respond, nav, receive: (state: ReturnType<typeof snapshot>) => receive(state), resolveGet: (value: ReturnType<typeof snapshot>) => resolveGet(value) }
}
const settle = async () => { await nextTick(); await Promise.resolve(); await nextTick() }
describe('Control K inline request', () => {
  it('is absent when empty, shows only one request/count, and ignores older initial snapshots', async () => {
    const s = mount(); expect(s.host.querySelector('section')).toBeNull()
    s.receive(snapshot()); await settle()
    expect(s.host.textContent).toContain('@A'); expect(s.host.textContent).not.toContain('@B')
    expect(s.host.textContent).toContain('+1 in attesa')
    s.resolveGet({ ...snapshot('old', 0), requests: [] }); await settle()
    expect(s.host.textContent).toContain('@A')
    s.receive({ ...snapshot('A', 2), requests: [] }); await settle()
    expect(s.host.querySelector('section')).toBeNull()
  })
  it('does not steal wheel selection and activates accept/reject through existing navigation', async () => {
    const s = mount(); await settle(); s.nav.select('pitwall')
    s.receive(snapshot()); await settle(); expect(s.nav.selectedId.value).toBe('pitwall')
    s.nav.next(); expect(s.nav.selectedId.value).toBe('friend-accept:A')
    s.nav.activate(); await settle()
    expect(s.respond).toHaveBeenCalledWith({ session: 'session', id: 'A', accept: true })
    s.nav.select('friend-reject:A'); s.nav.activate(); await settle()
    expect(s.respond).toHaveBeenLastCalledWith({ session: 'session', id: 'A', accept: false })
    s.receive({ ...snapshot('C', 2), requests: [snapshot('C').requests[0]!] }); await settle()
    expect(s.nav.selectedId.value).toBe('pitwall')
  })
  it('disables both actions while processing, displays failures and unsubscribes', async () => {
    const s = mount(); s.receive({ ...snapshot(), busy: true }); await settle()
    expect([...s.host.querySelectorAll('section button')].every(b => (b as HTMLButtonElement).disabled)).toBe(true)
    s.receive({ ...snapshot('A', 2), error: 'Connessione assente' }); await settle()
    expect(s.host.querySelector('[role="alert"]')?.textContent).toContain('Connessione assente')
    s.respond.mockRejectedValueOnce(new Error('offline'))
    s.host.querySelector<HTMLButtonElement>('section button')!.click(); await settle()
    expect(s.host.textContent).toContain('Invio non riuscito')
    app.unmount(); expect(s.stop).toHaveBeenCalledOnce()
  })
})
