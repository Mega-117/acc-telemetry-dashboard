// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

// PIP-672: the page behind the links in the Firebase emails (public/azione).
const html = readFileSync(resolve(process.cwd(), 'public/azione/index.html'), 'utf8')
const script = readFileSync(resolve(process.cwd(), 'public/azione/azione.js'), 'utf8')
const SITE_KEY = 'AIzaSyCx092q7up_BXFgK2e13A-IQ3uDjwf6J5A'

type Reply = { ok?: boolean, status?: number, body: unknown }
function open(query: string, replies: Reply[]) {
  document.body.innerHTML = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>')).replace(/<script[^>]*><\/script>/, '')
  window.history.replaceState(null, '', `/azione/${query}`)
  const calls: { url: string, body: Record<string, unknown> }[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init.body)) })
    const reply = replies.shift() ?? { body: {} }
    return { ok: reply.ok ?? true, status: reply.status ?? 200, json: async () => reply.body }
  }))
  new Function(script)()
  const text = (id: string) => document.getElementById(id)!.textContent
  return { calls, text, settle: () => vi.waitFor(() => expect(text('title')).not.toMatch(/momento|moment/)) }
}
afterEach(() => { vi.unstubAllGlobals() })

describe('account action page (PIP-672)', () => {
  it('verifies the email with the site key, whatever key the link carries', async () => {
    const page = open('?mode=verifyEmail&oobCode=abc&apiKey=OTHER&lang=it', [{ body: { email: 'p@example.invalid' } }])
    await page.settle()
    expect(page.calls).toEqual([{ url: `https://identitytoolkit.googleapis.com/v1/accounts:update?key=${SITE_KEY}`, body: { oobCode: 'abc' } }])
    expect(page.text('title')).toBe('Email verificata')
    expect(page.text('next')).toContain("Ho confermato l'email")
  })

  it('resets the password in two steps and checks it before sending', async () => {
    const page = open('?mode=resetPassword&oobCode=r1&lang=en', [{ body: { email: 'p@example.invalid' } }, { body: {} }])
    await page.settle()
    expect(page.text('message')).toBe('Choose the new password for p@example.invalid.')
    const form = document.getElementById('reset') as HTMLFormElement
    expect(form.hidden).toBe(false)
    ;(document.getElementById('password') as HTMLInputElement).value = 'abcdef'
    ;(document.getElementById('confirm') as HTMLInputElement).value = 'abcdeX'
    form.dispatchEvent(new Event('submit', { cancelable: true }))
    expect(page.text('form-error')).toBe('The two passwords do not match.')
    expect(page.calls).toHaveLength(1)
    ;(document.getElementById('confirm') as HTMLInputElement).value = 'abcdef'
    form.dispatchEvent(new Event('submit', { cancelable: true }))
    await vi.waitFor(() => expect(page.text('title')).toBe('Password changed'))
    expect((document.getElementById('password') as HTMLInputElement).value).toBe('')
    expect(page.calls[1]!.body).toEqual({ oobCode: 'r1', newPassword: 'abcdef' })
  })

  it('says plainly when a link is expired, incomplete or unknown', async () => {
    const expired = open('?mode=verifyEmail&oobCode=old', [{ ok: false, status: 400, body: { error: { message: 'EXPIRED_OOB_CODE' } } }])
    await expired.settle()
    expect(expired.text('title')).toBe('Link non valido')
    expect(expired.text('message')).toContain('scaduto')
    for (const query of ['?mode=verifyEmail', '?mode=signIn&oobCode=x']) {
      const page = open(query, [])
      expect(page.text('title')).toBe('Link non valido')
      expect(page.calls).toHaveLength(0)
    }
  })

  it('confirms an address change and an undo with the address from Firebase', async () => {
    const changed = open('?mode=verifyAndChangeEmail&oobCode=c', [{ body: { email: 'new@example.invalid' } }])
    await changed.settle()
    expect(changed.text('message')).toBe('Da ora accedi con new@example.invalid.')
    const restored = open('?mode=recoverEmail&oobCode=r', [{ body: { email: 'old@example.invalid' } }])
    await restored.settle()
    expect(restored.text('title')).toBe('Indirizzo ripristinato')
  })
})

describe('account action page style (PIP-672)', () => {
  it('lets the hidden attribute win over the form layout', () => {
    const css = readFileSync(resolve(process.cwd(), 'public/azione/azione.css'), 'utf8')
    expect(css).toMatch(/\[hidden\]\s*\{\s*display:\s*none\s*!important;/)
  })
})
