// PIP-761 (Codex round 6): a live update never rebuilds the inputs of the
// generated engineer form. It writes in place only the "Adesso nel MFD" cells
// and the value of untouched, unfocused default fields. A structural rebuild
// keeps the field being typed (text, focus, selection). JSDOM, real form.
import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'
import { afterEach, expect, it, vi } from 'vitest'
const contextId = 'a'.repeat(64)
const opened: JSDOM[] = []
afterEach(() => { opened.splice(0).forEach(dom => dom.window.close()) })

function form() {
  const dom = new JSDOM(readFileSync(new URL('../../public/mfd-v4-online.html', import.meta.url), 'utf8'), { runScripts: 'outside-only', pretendToBeVisual: true })
  opened.push(dom)
  const w = dom.window as any
  w.setInterval = () => 0
  const post = vi.spyOn(w, 'postMessage').mockImplementation(() => {})
  for (const script of w.document.querySelectorAll('script')) w.eval(script.textContent)
  const live = (FL: number, value: Record<string, unknown> = {}) => w.dispatchEvent(new w.MessageEvent('message', {
    source: w.parent, data: { channel: 'mfd-v4-online', type: 'snapshot', value: {
      contextId, ready: true, busy: false, crew: [{ driverIndex: 0, name: 'Test Driver' }],
      strategy: { mfdV4: { ready: true, reason: null, contextId, maxFuel: 110 }, fuelToAdd: 5, fittedTyreSet: 3,
        pressures: { FL, FR: 25, RL: 25, RR: 25 } }, ...value } } }))
  const q = (selector: string) => w.document.querySelector(selector)
  const type = (input: any, value: string) => { input.value = value; input.dispatchEvent(new w.Event('input', { bubbles: true })) }
  const commit = (input: any) => input.dispatchEvent(new w.Event('change', { bubbles: true }))
  const submits = () => post.mock.calls.filter((c: any) => c[0].type === 'submit').map((c: any) => c[0].value)
  return { w, q, live, type, commit, submits }
}

it('type 1, select it, a live tick moves FL, type 8: 8 L is sent, never 81', () => {
  const f = form(); f.live(25)
  const fuel = f.q('input[data-f="fuel"]'); fuel.focus(); f.type(fuel, '1'); fuel.setSelectionRange(0, 1)
  f.live(26)
  expect(f.q('input[data-f="fuel"]')).toBe(fuel)           // no rebuild
  expect(f.w.document.activeElement).toBe(fuel)
  expect([fuel.selectionStart, fuel.selectionEnd]).toEqual([0, 1])
  expect(f.w.S.fl).toBe(26); expect(f.q('input[data-f="fl"]').value).toBe('26') // default written in place
  expect(f.q('td.v4-now[data-now="fl"]').textContent).toBe('26,0')
  // Typing over the selection replaces it.
  const start = fuel.selectionStart, end = fuel.selectionEnd
  f.type(fuel, fuel.value.slice(0, start) + '8' + fuel.value.slice(end)); f.commit(fuel)
  f.q('#apply').click()
  expect(f.submits()).toEqual([expect.objectContaining({ fuelLiters: 8 })])
})

it('typing during several live ticks: same input, same text, defaults keep following', () => {
  const f = form(); f.live(25)
  const fuel = f.q('input[data-f="fuel"]'); fuel.focus(); f.type(fuel, '4')
  for (const fl of [26, 27, 28]) {
    f.live(fl); f.type(fuel, fuel.value + '0')
    expect(f.q('input[data-f="fuel"]')).toBe(fuel); expect(f.w.document.activeElement).toBe(fuel)
  }
  expect(fuel.value).toBe('4000'); expect(f.w.S.fl).toBe(28); expect(f.q('input[data-f="fl"]').value).toBe('28')
})

it('caret in the middle of a number survives a live tick', () => {
  const f = form(); f.live(25)
  const fuel = f.q('input[data-f="fuel"]'); fuel.focus(); f.type(fuel, '120'); fuel.setSelectionRange(1, 1)
  f.live(26)
  expect(f.q('input[data-f="fuel"]')).toBe(fuel)
  expect([fuel.selectionStart, fuel.selectionEnd, fuel.value]).toEqual([1, 1, '120'])
})

it('a focused default field is never written by live data, not even its state', () => {
  const f = form(); f.live(25)
  const fl = f.q('input[data-f="fl"]'); fl.focus()
  f.live(27)
  expect(f.w.S.fl).toBe(25); expect(fl.value).toBe('25'); expect(f.q('input[data-f="fl"]')).toBe(fl)
  expect(f.q('td.v4-now[data-now="fl"]').textContent).toBe('27,0') // the right-hand column still updates
  fl.blur(); f.live(27)
  expect(f.w.S.fl).toBe(27); expect(fl.value).toBe('27')
})

// Codex round 7 (P2): never replace the element the user is composing in (IME).
it.each([
  ['availability', { ready: false }],
  ['crew', { crew: [{ driverIndex: 0, name: 'Test Driver' }, { driverIndex: 1, name: 'Second Driver' }] }],
])('a %s change during an IME composition waits for compositionend: 8 L is sent, never 88', async (_kind, change) => {
  const f = form(); f.live(25)
  const fuel = f.q('input[data-f="fuel"]'); fuel.focus()
  const ev = (type: string, data = '') => fuel.dispatchEvent(new f.w.CompositionEvent(type, { bubbles: true, data }))
  ev('compositionstart'); fuel.value = '8'; ev('compositionupdate', '8')
  fuel.dispatchEvent(new f.w.Event('input', { bubbles: true }))
  f.live(25, change)                                          // structural change mid-composition
  expect(f.q('input[data-f="fuel"]')).toBe(fuel)             // element not replaced
  expect(f.w.document.activeElement).toBe(fuel); expect(fuel.value).toBe('8')
  if ('ready' in change) expect(f.q('#apply').disabled).toBe(true) // the send follows availability meanwhile
  ev('compositionend', '8')
  await new Promise(resolve => f.w.setTimeout(resolve, 0)); await new Promise(resolve => setTimeout(resolve, 0))
  const now = f.q('input[data-f="fuel"]')
  expect(now).not.toBe(fuel)                                  // the postponed rebuild ran once, after the composition
  expect(now.value).toBe('8'); expect(f.w.document.activeElement).toBe(now)
  if ('crew' in change) expect(f.q('select[data-f="driverEntryIndex"]').textContent).toContain('Second Driver')
  f.commit(now); f.live(25)
  f.q('#apply').click()
  expect(f.submits()).toEqual([expect.objectContaining({ fuelLiters: 8 })])
})

it('a structural rebuild while another field is being typed keeps its text, focus and selection', () => {
  const f = form(); f.live(25)
  const fuel = f.q('input[data-f="fuel"]'); fuel.focus(); f.type(fuel, '27,5'); fuel.setSelectionRange(1, 3)
  f.live(25, { ready: false }); f.live(26)                    // readiness flips: two rebuilds
  const now = f.q('input[data-f="fuel"]')
  expect(now.value).toBe('27,5'); expect(f.w.document.activeElement).toBe(now)
  expect([now.selectionStart, now.selectionEnd]).toEqual([1, 3])
  // A structural toggle by the user (tyre change off) rebuilds the rows; the focused checkbox stays focused.
  const tyres = f.q('input[data-f="changeTyre"]'); tyres.focus(); tyres.checked = false
  tyres.dispatchEvent(new f.w.Event('change', { bubbles: true }))
  expect(f.q('input[data-f="fl"]').disabled).toBe(true)
  expect(f.w.document.activeElement).toBe(f.q('input[data-f="changeTyre"]'))
})
