import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// PIP-672: the site moved from mega-117.github.io/acc-telemetry-dashboard/docs/ to app.racercore.app.
// GitHub Pages drops the repository folder itself; public/404.html removes the old docs prefix.
const html = readFileSync(resolve(process.cwd(), 'public/404.html'), 'utf8')
const script = html.slice(html.indexOf('<script>') + 8, html.indexOf('</script>'))

function open(href: string) {
  const url = new URL(href)
  const replaced: string[] = []
  const stored = new Map<string, string>()
  const window = { location: { pathname: url.pathname, search: url.search, hash: url.hash, replace: (to: string) => replaced.push(to) } }
  const sessionStorage = { setItem: (k: string, v: string) => stored.set(k, v) }
  new Function('window', 'sessionStorage', 'console', script)(window, sessionStorage, { log() {} })
  return { to: replaced[0], stored }
}

describe('old address fallback (PIP-672)', () => {
  it('keeps the shared lap key in the fragment', () => {
    expect(open('https://app.racercore.app/docs/giro#aa.bb').to).toBe('/giro#aa.bb')
  })
  it('accepts the full old prefix and keeps the query', () => {
    expect(open('https://dev.racercore.app/acc-telemetry-dashboard/docs/sessioni/s1?userId=u1').to).toBe('/sessioni/s1?userId=u1')
    expect(open('https://app.racercore.app/docs/').to).toBe('/')
    expect(open('https://app.racercore.app/docs').to).toBe('/')
  })
  it('never sends a crafted old link to another site', () => {
    expect(open('https://app.racercore.app/docs//evil.example/x?a=1#k').to).toBe('/evil.example/x?a=1#k')
    expect(open('https://dev.racercore.app/acc-telemetry-dashboard/docs/%5C%5Cevil.example').to).toBe('/%5C%5Cevil.example')
    expect(open('https://app.racercore.app/docs/\\\\evil.example').to).toBe('/evil.example')
  })

  it('leaves other paths to the SPA fallback', () => {
    const { to, stored } = open('https://app.racercore.app/sessioni/s1?userId=u1')
    expect(to).toBe('/?spa-redirect-path=' + encodeURIComponent('/sessioni/s1?userId=u1'))
    expect(stored.get('spa-redirect-path')).toBe('/sessioni/s1?userId=u1')
    expect(open('https://app.racercore.app/docsx').to).toBe('/?spa-redirect-path=%2Fdocsx')
  })
})
