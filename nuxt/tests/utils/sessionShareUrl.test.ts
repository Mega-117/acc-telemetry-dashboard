import { describe, expect, it } from 'vitest'
import { PUBLIC_SITE_URL, buildSessionShareUrl } from '~/utils/sessionShareUrl'

const at = (href: string) => {
  const url = new URL(href)
  return { protocol: url.protocol, hostname: url.hostname, origin: url.origin }
}

describe('session share url (PIP-591)', () => {
  it('on the published site keeps the site prefix', () => {
    expect(buildSessionShareUrl({ sessionId: 's1', userId: 'u1', location: at('https://racercore-develop.pages.dev/acc-telemetry-dashboard/docs/sessioni'), baseURL: '/acc-telemetry-dashboard/docs/' }))
      .toBe('https://racercore-develop.pages.dev/acc-telemetry-dashboard/docs/sessioni/s1?userId=u1')
    expect(buildSessionShareUrl({ sessionId: 's1', userId: 'u1', location: at('https://example.org/x'), baseURL: '/' }))
      .toBe('https://example.org/sessioni/s1?userId=u1')
  })

  it('from the desktop app or localhost points to the public site', () => {
    for (const href of ['http://localhost:3000/sessioni', 'http://127.0.0.1:3000/', 'file:///C:/app/index.html']) {
      expect(buildSessionShareUrl({ sessionId: 's1', userId: 'u1', location: at(href), baseURL: '/' }))
        .toBe(`${PUBLIC_SITE_URL}sessioni/s1?userId=u1`)
    }
    expect(buildSessionShareUrl({ sessionId: 's1', userId: 'u1', location: null, baseURL: '/' })).toBe(`${PUBLIC_SITE_URL}sessioni/s1?userId=u1`)
  })

  it('PIP-651: one link for the whole session, opening on the tab it was shared from', () => {
    expect(buildSessionShareUrl({ sessionId: 's1', userId: 'u1', location: null, baseURL: '/', tab: 'telemetria' })).toBe(`${PUBLIC_SITE_URL}sessioni/s1?userId=u1&tab=telemetria`)
    expect(buildSessionShareUrl({ sessionId: 's1', userId: 'u1', location: null, baseURL: '/', tab: 'sessione' })).toBe(`${PUBLIC_SITE_URL}sessioni/s1?userId=u1`)
  })

  it('escapes ids', () => {
    expect(buildSessionShareUrl({ sessionId: 'a b', userId: 'u&1', location: null, baseURL: '/' })).toBe(`${PUBLIC_SITE_URL}sessioni/a%20b?userId=u%261`)
  })
})
