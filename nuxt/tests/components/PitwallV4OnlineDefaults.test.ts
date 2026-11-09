// PIP-761 (user 09/11): every field of the generated engineer form has a
// default (a fresh draft is sendable untouched) and checkboxes have two states
// only. Runs the real public/mfd-v4-online.html.
import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'
import { afterEach, expect, it, vi } from 'vitest'
const contextId = 'a'.repeat(64)
const opened: JSDOM[] = []
afterEach(() => { opened.splice(0).forEach(dom => dom.window.close()) })
const tank = { ready: true, reason: null, contextId, maxFuel: 110 }

function form() {
  const dom = new JSDOM(readFileSync(new URL('../../public/mfd-v4-online.html', import.meta.url), 'utf8'), { runScripts: 'outside-only', pretendToBeVisual: true })
  opened.push(dom)
  const w = dom.window as any
  w.setInterval = () => 0
  const post = vi.spyOn(w, 'postMessage').mockImplementation(() => {})
  for (const script of w.document.querySelectorAll('script')) w.eval(script.textContent)
  const snapshot = (value: Record<string, unknown> = {}, strategy: Record<string, unknown> = {}) => w.dispatchEvent(new w.MessageEvent('message', {
    source: w.parent, data: { channel: 'mfd-v4-online', type: 'snapshot', value: {
      contextId, ready: true, busy: false, crew: [{ driverIndex: 0, name: 'Test Driver' }], strategy: { mfdV4: tank, ...strategy }, ...value } } }))
  const q = (selector: string) => w.document.querySelector(selector)
  const submits = () => post.mock.calls.filter((c: any) => c[0].type === 'submit').map((c: any) => c[0].value)
  return { w, q, snapshot, submits }
}
const pressures = { FL: 26.4, FR: 26.5, RL: 25.8, RR: 25.9 }

it('a fresh draft is sendable untouched: every field has its default', () => {
  const f = form()
  f.snapshot({}, { fuelToAdd: 35, tyreSet: 7, compound: 'wet', fittedTyreSet: 3, pressures })
  expect(f.q('input[data-f="fuel"]').value).toBe('0')
  expect(f.q('select[data-f="compound"]').value).toBe('Dry')
  expect(f.q('input[data-f="pitStrategy"]').value).toBe('1')
  expect(f.q('select[data-f="driverEntryIndex"]').value).toBe('')
  expect(['changeTyre', 'susp', 'body'].map(k => f.q(`input[data-f="${k}"]`).checked)).toEqual([true, true, true])
  expect(['applyPitStrategy', 'brakes'].map(k => f.q(`input[data-f="${k}"]`).checked)).toEqual([false, false])
  expect(f.w.S).toMatchObject({ brakeFront: 1, brakeRear: 1 })
  f.q('#apply').click()
  expect(f.submits()).toEqual([{ version: 1, contextId, stepMs: 60, operation: 'strategy', fuelLiters: 0, changeTyres: true,
    brakes: false, repairBodywork: true, repairSuspension: true, compound: 'dry', pressures, tyreSet: 4 }])
})

it('tyre set default: the set after the mounted one, 50 -> 49, unknown -> 1, never the mounted set', () => {
  for (let mounted = 1; mounted <= 50; mounted++) {
    const f = form(); f.snapshot({}, { fittedTyreSet: mounted })
    expect(f.w.S.tyreSet).toBe(mounted === 50 ? 49 : mounted + 1)
    expect(f.w.S.tyreSet).not.toBe(mounted)
  }
  for (const unknown of [undefined, null, 0, 51, 2.5]) {
    const f = form(); f.snapshot({}, { fittedTyreSet: unknown }); expect(f.w.S.tyreSet).toBe(1)
  }
  const f = form(); f.snapshot()
  expect(f.q('tr[data-f="tyreSet"] .v4-hint').textContent).toContain('il set dopo quello montato')
})

it('pressure defaults: the driver current MFD values when valid, otherwise 26.0', () => {
  const f = form(); f.snapshot({}, { pressures: { FL: 26.44, FR: 0, RL: 35.1 } })
  expect(f.w.S).toMatchObject({ fl: 26.4, fr: 26, rl: 26, rr: 26 })
  const g = form(); g.snapshot({ ready: false, strategy: null })
  expect(g.w.S).toMatchObject({ fl: 26, fr: 26, rl: 26, rr: 26 })
  g.snapshot({}, { pressures }) // live arrives later: the 26.0 placeholders follow it once
  expect(g.w.S).toMatchObject({ fl: 26.4, fr: 26.5, rl: 25.8, rr: 25.9 })
})

it('a saved user value wins over every default; the rest is filled', () => {
  const f = form()
  f.snapshot({ draft: { fuel: 12, tyreSet: 9, fl: 28, compound: 'Wet', changeTyre: false, initializedFields: ['fuel', 'tyreSet', 'fl', 'compound', 'changeTyre'] } },
    { fittedTyreSet: 3, pressures })
  expect(f.w.S).toMatchObject({ fuel: 12, tyreSet: 9, fl: 28, compound: 'Wet', changeTyre: false, fr: 26.5, susp: true, body: true, brakes: false })
})

it('two states only, also after restoring an old draft with null values', () => {
  const f = form()
  f.snapshot({ draft: { changeTyre: null, susp: null, body: null, brakes: null, applyPitStrategy: null, compound: null, fuel: null, brakeFront: null } })
  expect(f.w.S).toMatchObject({ changeTyre: true, susp: true, body: true, brakes: false, applyPitStrategy: false, compound: 'Dry', fuel: 0, brakeFront: 1 })
  const boxes = [...f.w.document.querySelectorAll('input[type=checkbox]')]
  expect(boxes.length).toBeGreaterThanOrEqual(5)
  for (const box of boxes) {
    expect(box.indeterminate).toBe(false)
    expect(box.getAttribute('aria-label')).not.toContain('Da scegliere')
  }
  expect(f.w.document.body.textContent).not.toContain('Da scegliere')
  // Even a forced null never draws a third state (defence in depth).
  f.w.S.susp = null; f.w.renderForm()
  expect(f.q('input[data-f="susp"]').indeterminate).toBe(false)
  f.w.S.susp = true; f.w.renderForm()
  f.q('#apply').click()
  expect(f.submits()).toEqual([expect.objectContaining({ operation: 'strategy', changeTyres: true, repairSuspension: true, repairBodywork: true })])
})

it('«Ripristina dai dati live» works as before (live fuel, MFD set and compound)', () => {
  const f = form(); f.snapshot({}, { fuelToAdd: 35, tyreSet: 7, compound: 'wet', fittedTyreSet: 3, pressures })
  f.q('#refresh-draft').click()
  expect(f.w.S).toMatchObject({ fuel: 35, tyreSet: 8, compound: 'Wet', fl: 26.4 })
})
