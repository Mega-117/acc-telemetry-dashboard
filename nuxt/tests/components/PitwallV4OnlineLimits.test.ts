// PIP-761: the generated engineer form (real public/mfd-v4-online.html) with
// field limits, -/+ steps, the driver's current-MFD column and the one-shot
// preset. Each case is a row of the Codex break-it list.
import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'
import { afterEach, expect, it, vi } from 'vitest'
const contextId = 'a'.repeat(64)
const opened: JSDOM[] = []
afterEach(() => { opened.splice(0).forEach(dom => dom.window.close()) })
const car = (strategy: Record<string, unknown> = {}, maxFuel: number | null = 110) => ({ fuelToAdd: 30, tyreSet: 2, compound: 'dry',
  pressures: { FL: 26, FR: 26.1, RL: 25.5, RR: 25.6 }, mfdV4: { ready: true, reason: null, contextId, maxFuel }, ...strategy })

function form() {
  const dom = new JSDOM(readFileSync(new URL('../../public/mfd-v4-online.html', import.meta.url), 'utf8'), { runScripts: 'outside-only', pretendToBeVisual: true })
  opened.push(dom)
  const w = dom.window as any
  w.setInterval = () => 0
  const post = vi.spyOn(w, 'postMessage').mockImplementation(() => {})
  for (const script of w.document.querySelectorAll('script')) w.eval(script.textContent)
  const snapshot = (value: Record<string, unknown> = {}) => w.dispatchEvent(new w.MessageEvent('message', {
    source: w.parent, data: { channel: 'mfd-v4-online', type: 'snapshot', value: {
      contextId, ready: true, busy: false, crew: [{ driverIndex: 0, name: 'Test Driver' }], strategy: car(), ...value } } }))
  const q = (selector: string) => w.document.querySelector(selector)
  const field = (name: string) => q(`input[data-f="${name}"]`)
  const edit = (name: string, value: string) => {
    const input = field(name); input.value = value
    input.dispatchEvent(new w.Event('input', { bubbles: true }))
    input.dispatchEvent(new w.Event('change', { bubbles: true }))
  }
  const now = (name: string) => q(`td.v4-now[data-now="${name}"]`).textContent
  const issue = (name: string) => q(`tr[data-f="${name}"] .v4-issue`)?.textContent ?? null
  const submits = () => post.mock.calls.filter((c: any) => c[0].type === 'submit').map((c: any) => c[0].value)
  const drafts = () => post.mock.calls.filter((c: any) => c[0].type === 'draft').map((c: any) => c[0].value)
  const ready = () => { Object.assign(w.S, { changeTyre: false, brakes: false, susp: false, body: false }); w.renderForm() }
  return { w, q, snapshot, field, edit, now, issue, submits, drafts, ready, post }
}

it('shows the driver current MFD values: null as a dash, zero kept, never stale or of another context', () => {
  const f = form()
  f.snapshot({ strategy: car({ fuelToAdd: 0, tyreSet: null, pressures: { FL: 26, FR: 26.1, RL: 25.5, RR: 25.6 } }) })
  // Minimal layout (09/11): no header row; the current value sits next to each field.
  expect(f.q('tr.v4-head')).toBeNull()
  expect(f.now('fuel')).toBe('0 L'); expect(f.now('tyreSet')).toBe('—');
  expect(f.q('td.v4-now[data-now="tyreSet"]').classList.contains('v4-now-empty')).toBe(true)
  expect(f.q('td.v4-now[data-now="fuel"]').classList.contains('v4-now-empty')).toBe(false)
  expect(f.now('fr')).toBe('26,1'); expect(f.now('compound')).toBe('Dry')
  f.snapshot({ ready: false, strategy: car({ fuelToAdd: 12 }) })
  expect(f.now('fuel')).toBe('—'); expect(f.now('fl')).toBe('—')
  f.snapshot({ strategy: car({ fuelToAdd: 12, mfdV4: { ready: true, reason: null, contextId: 'b'.repeat(64), maxFuel: 110 } }) })
  expect(f.now('fuel')).toBe('—')
  f.snapshot({ strategy: null }); expect(f.now('fuel')).toBe('—')
  f.snapshot({ strategy: car({ fuelToAdd: 12 }) }); expect(f.now('fuel')).toBe('12 L')
})

it('unknown car with a valid live tank: limit shown, litres TO ADD sent as typed (110 tank, 30 in MFD, 40 -> 40)', () => {
  const f = form(); f.snapshot(); f.ready()
  expect(f.q('tr[data-f="fuel"] .v4-limit').textContent).toBe('0–110 L')
  // Litres TO ADD, under the "Benzina" heading (minimal layout 09/11).
  // The car-dependent range sits under the label, so the field column keeps one width.
  expect(f.q('tr[data-f="fuel"] td.lb').firstChild.textContent).toBe('Da aggiungere (L)')
  expect(f.q('tr[data-f="fuel"] td.lb .v4-limit').textContent).toBe('0–110 L')
  expect(f.q('tr[data-f="fuel"]').previousElementSibling.textContent).toBe('Benzina')
  f.edit('fuel', '40'); f.q('#apply').click()
  expect(f.submits()).toEqual([expect.objectContaining({ operation: 'strategy', fuelLiters: 40 })])
})

it('missing tank capacity (old driver program, zero, NaN): no default, strategy blocked with the reason, preset still possible', () => {
  for (const maxFuel of [null, 0]) {
    const f = form(); f.snapshot({ strategy: car({}, maxFuel) }); f.ready()
    expect(f.issue('fuel')).toMatch(/Capacità del serbatoio non disponibile/)
    expect(f.q('tr[data-f="fuel"] .v4-limit').textContent).toBe('max ?')
    expect(f.q('tr[data-f="fuel"] button.v4-step').disabled).toBe(true)
    f.q('#apply').click()
    expect(f.submits()).toEqual([])
    expect(f.q('#strategy-result').textContent).toMatch(/Capacità del serbatoio non disponibile/)
    Object.assign(f.w.S, { applyPitStrategy: true, pitStrategy: 2 }); f.w.renderForm(); f.q('#apply').click()
    expect(f.submits()).toEqual([{ version: 1, contextId, stepMs: 60, operation: 'preset', pitStrategy: 2 }])
  }
})

it('a draft saved at 140 L reopened on a 110 L car: visible error, send blocked, never clamped', () => {
  const f = form()
  f.snapshot({ draft: { fuel: 140, changeTyre: false, brakes: false, susp: false, body: false, initializedFields: ['fuel'], edited: true } })
  expect(f.w.S.fuel).toBe(140); expect(f.field('fuel').value).toBe('140')
  expect(f.issue('fuel')).toBe('Fuori limite: 0–110 L.')
  f.q('#apply').click()
  expect(f.submits()).toEqual([]); expect(f.w.S.fuel).toBe(140)
})

it('pressures: 20.3 and 35 sent, 20.2/35.1/27.55 refused visibly, Italian comma read as a decimal', () => {
  const f = form(); f.snapshot(); f.ready()
  Object.assign(f.w.S, { changeTyre: true, compound: 'Wet', fl: 26, fr: 26, rl: 26, rr: 26, tyreSet: 12 }); f.w.renderForm()
  for (const bad of ['20,2', '35.1', '27,55']) {
    f.edit('fl', bad); expect(f.issue('fl')).toMatch(/Fuori limite|Passo 0,1/)
    f.q('#apply').click(); expect(f.submits()).toEqual([])
  }
  f.edit('fl', '27,5'); expect(f.w.S.fl).toBe(27.5); expect(f.issue('fl')).toBeNull()
  f.edit('fl', '27,5,1'); expect(f.issue('fl')).toBe('Valore non numerico: 27,5,1'); expect(f.w.S.fl).toBe(27.5)
  f.q('#apply').click(); expect(f.submits()).toEqual([])
  f.edit('fl', '20,3'); f.edit('fr', '35'); f.q('#apply').click()
  const sent = f.submits()[0]
  expect(sent.pressures).toEqual({ FL: 20.3, FR: 35, RL: 26, RR: 26 })
  // Wet never carries a tyre set, even with one left in the draft.
  expect(sent.compound).toBe('wet'); expect(sent.tyreSet).toBeUndefined()
})

it('-/+ buttons: one step per click, clamped to the limits, disabled with the field', () => {
  const f = form(); f.snapshot(); f.ready()
  const stepButton = (name: string, dir: number) => f.q(`button[data-step-field="${name}"][data-dir="${dir}"]`)
  f.edit('fuel', '109'); stepButton('fuel', 1).click(); expect(f.w.S.fuel).toBe(110)
  stepButton('fuel', 1).click(); expect(f.w.S.fuel).toBe(110)
  stepButton('fuel', -1).click(); expect(f.w.S.fuel).toBe(109)
  expect(stepButton('fl', 1).disabled).toBe(true)
  Object.assign(f.w.S, { changeTyre: true, compound: 'Dry', fl: 34.9, tyreSet: 50 }); f.w.renderForm()
  stepButton('fl', 1).click(); expect(f.w.S.fl).toBe(35); stepButton('fl', 1).click(); expect(f.w.S.fl).toBe(35)
  stepButton('fl', -1).click(); expect(f.w.S.fl).toBe(34.9)
  stepButton('tyreSet', 1).click(); expect(f.w.S.tyreSet).toBe(50)
  f.w.S.fr = null; f.w.renderForm(); stepButton('fr', 1).click(); expect(f.w.S.fr).toBe(26.2) // from the live 26.1
  expect(f.q('tr[data-f="fl"] .v4-limit').textContent).toBe('20,3–35,0')
})

it('preset: other fields visibly off with "Invii solo il preset"; tick cleared and saved as it leaves; draft kept', () => {
  const f = form(); f.snapshot(); f.ready(); f.edit('fuel', '60')
  const tick = f.field('applyPitStrategy'); tick.checked = true; tick.dispatchEvent(new f.w.Event('change', { bubbles: true }))
  expect(f.q('tr.v4-preset-note').textContent).toContain('Invii solo il preset')
  expect(f.q('#form').classList.contains('preset-only')).toBe(true)
  expect(f.field('fuel').disabled).toBe(true)
  expect(f.q('button[data-step-field="fuel"]').disabled).toBe(true)
  expect(f.drafts().at(-1).applyPitStrategy).toBe(false) // never persisted ticked
  expect(f.q('#apply').textContent).toBe('Invia solo il preset 1')
  f.post.mockClear(); f.q('#apply').click()
  const order = f.post.mock.calls.map((c: any) => c[0])
  expect(order.map((m: any) => m.type)).toEqual(['draft', 'submit'])
  expect(order[0].value).toMatchObject({ applyPitStrategy: false, fuel: 60 })
  expect(order[1].value).toEqual({ version: 1, contextId, stepMs: 60, operation: 'preset', pitStrategy: 1 })
  expect(f.w.S.applyPitStrategy).toBe(false); expect(f.w.S.fuel).toBe(60)
  // Outcome (already selected, refusal, transport error) does not resend.
  f.snapshot({ busy: true }); f.snapshot({ result: { label: 'Preset 1 già selezionato', reason: 'Nessun altro valore inviato', problem: false } })
  expect(f.submits()).toHaveLength(1)
  expect(f.field('fuel').disabled).toBe(false)
})

it('a draft saved ticked by the old form reopens unticked (reload never restores a preset-only send)', () => {
  const f = form()
  f.snapshot({ draft: { applyPitStrategy: true, pitStrategy: 2, fuel: 60, changeTyre: false, brakes: false, susp: false, body: false, edited: true } })
  expect(f.w.S.applyPitStrategy).toBe(false); expect(f.w.S.pitStrategy).toBe(2)
  expect(f.field('fuel').disabled).toBe(false)
  f.q('#apply').click()
  expect(f.submits()).toEqual([expect.objectContaining({ operation: 'strategy', fuelLiters: 60 })])
})

// Codex review P2 (1): no silent clamp anywhere (pads 5 -> 4, preset 31 -> 30 before).
it('out-of-limit pads and preset stay as typed with the reason, and block the send', () => {
  const f = form(); f.snapshot(); f.ready()
  Object.assign(f.w.S, { brakes: true, brakeFront: 2, brakeRear: 2 }); f.w.renderForm()
  f.edit('brakeFront', '5')
  expect(f.w.S.brakeFront).toBe(2); expect(f.field('brakeFront').value).toBe('5')
  expect(f.issue('brakeFront')).toBe('5: Fuori limite: 1–4.')
  f.q('#apply').click(); expect(f.submits()).toEqual([])
  const tick = f.field('applyPitStrategy'); tick.checked = true; tick.dispatchEvent(new f.w.Event('change', { bubbles: true }))
  f.edit('pitStrategy', '31')
  expect(f.w.S.pitStrategy).toBe(1); expect(f.field('pitStrategy').value).toBe('31')
  expect(f.issue('pitStrategy')).toBe('31: Fuori limite: 1–30.')
  f.q('#apply').click(); expect(f.submits()).toEqual([])
  f.edit('pitStrategy', '2,5'); expect(f.issue('pitStrategy')).toBe('2,5: Numero intero.')
  f.edit('pitStrategy', '30'); f.q('#apply').click()
  expect(f.submits()).toEqual([{ version: 1, contextId, stepMs: 60, operation: 'preset', pitStrategy: 30 }])
})

// Codex review P2 (2): a preset send passes the same validation.
it('a non-numeric preset never sends the previous preset', () => {
  const f = form(); f.snapshot(); f.ready()
  const tick = f.field('applyPitStrategy'); tick.checked = true; tick.dispatchEvent(new f.w.Event('change', { bubbles: true }))
  f.edit('pitStrategy', '2'); f.edit('pitStrategy', 'abc')
  expect(f.w.S.pitStrategy).toBe(2); expect(f.issue('pitStrategy')).toBe('Valore non numerico: abc')
  f.q('#apply').click()
  expect(f.submits()).toEqual([])
  expect(f.q('#strategy-result').textContent).toContain('Valore non numerico: abc')
  // A typo in a strategy field does not block the preset: it is not part of it.
  const g = form(); g.snapshot(); g.ready(); g.edit('fuel', 'xx')
  const tick2 = g.field('applyPitStrategy'); tick2.checked = true; tick2.dispatchEvent(new g.w.Event('change', { bubbles: true }))
  g.q('#apply').click(); expect(g.submits()).toEqual([expect.objectContaining({ operation: 'preset' })])
})

// Codex review P2 (3): only fields that are part of the order block it.
it('a typo in a field excluded from the order does not block it, and returns when the field applies again', () => {
  const f = form(); f.snapshot(); f.ready()
  Object.assign(f.w.S, { changeTyre: true, compound: 'Dry', tyreSet: 3, fl: 26, fr: 26, rl: 26, rr: 26 }); f.w.renderForm()
  f.edit('fl', 'abc'); expect(f.issue('fl')).toBe('Valore non numerico: abc')
  f.q('#apply').click(); expect(f.submits()).toEqual([])
  const tyres = f.field('changeTyre'); tyres.checked = false; tyres.dispatchEvent(new f.w.Event('change', { bubbles: true }))
  expect(f.issue('fl')).toBeNull()
  f.q('#apply').click()
  expect(f.submits()).toEqual([expect.objectContaining({ operation: 'strategy', changeTyres: false })])
  expect(f.submits()[0].pressures).toBeUndefined()
  f.snapshot({ busy: false })
  tyres.checked = true; f.field('changeTyre').checked = true
  f.field('changeTyre').dispatchEvent(new f.w.Event('change', { bubbles: true }))
  expect(f.issue('fl')).toBe('Valore non numerico: abc'); expect(f.field('fl').value).toBe('abc')
})

// Codex review round 2 (P2): a confirmed live restore replaces value AND typed/error state.
it('a confirmed live restore clears the kept text and error of restored fields only', () => {
  const f = form(); f.snapshot(); f.ready()
  Object.assign(f.w.S, { changeTyre: true, compound: 'Dry', tyreSet: 3, fl: 27, fr: 26, rl: 26, rr: 26, brakes: true, brakeFront: 2, brakeRear: 2 }); f.w.renderForm()
  f.edit('fl', 'abc'); f.edit('brakeFront', '5')
  expect(f.issue('fl')).toBe('Valore non numerico: abc')
  f.q('#refresh-draft').click(); f.q('.draft-confirm').querySelectorAll('button')[1].click()
  expect(f.w.S.fl).toBe(26); expect(f.field('fl').value).toBe('26'); expect(f.issue('fl')).toBeNull()
  // Pads are not restored from live data: their typed value and error stay.
  expect(f.field('brakeFront').value).toBe('5'); expect(f.issue('brakeFront')).toBe('5: Fuori limite: 1–4.')
  f.edit('brakeFront', '3'); f.q('#apply').click()
  expect(f.submits()).toEqual([expect.objectContaining({ operation: 'strategy', pressures: { FL: 26, FR: 26.1, RL: 25.5, RR: 25.6 }, brakeFront: 3 })])
})

it('one source of limits: the form, the receiver and the RTDB order rules agree', () => {
  const html = readFileSync(new URL('../../public/mfd-v4-online.html', import.meta.url), 'utf8')
  const limits = JSON.parse(html.match(/globalThis\.MfdV4Limits = (\{.*?\});\r?\n/)![1])
  const rules = readFileSync(new URL('../../../database.rules.json', import.meta.url), 'utf8')
  // Every occurrence (standard plan, V4 plan, room variants) carries the same bounds.
  const agree = (field: string, bounds: string) => {
    const found = [...rules.matchAll(new RegExp(`"${field}": \\{\\s*"\\.validate": "([^"]+)"`, 'g'))].map(m => m[1])
    expect(found.length).toBeGreaterThan(0)
    for (const validate of found) expect(validate).toContain(bounds)
  }
  agree('fuelLiters', `newData.val() >= ${limits.fuelLiters.min} && newData.val() <= ${limits.fuelLiters.transportMax}`)
  agree('tyreSet', `newData.val() >= ${limits.tyreSet.min} && newData.val() <= ${limits.tyreSet.max}`)
  agree('pitStrategy', `newData.val() >= ${limits.pitStrategy.min} && newData.val() <= ${limits.pitStrategy.max}`)
  agree('brakeFront', `newData.val() >= ${limits.brakePads.min} && newData.val() <= ${limits.brakePads.max}`)
  agree('FL', `newData.val() >= ${limits.pressure.min} && newData.val() <= ${limits.pressure.max}`)
})

it('minimal layout (09/11): groups in reading order, preset last, short labels, no technical source tags shown', () => {
  const f = form()
  f.snapshot({ strategy: car() })
  const rows = [...f.w.document.querySelectorAll('#form tr')].map((tr: any) => tr.classList.contains('v4-group') ? `#${tr.textContent}` : tr.dataset.f)
  expect(rows).toEqual(['#Benzina', 'fuel', '#Gomme', 'changeTyre', 'compound', 'tyreSet', 'fl', 'fr', 'rl', 'rr',
    '#Freni', 'brakes', 'brakeFront', 'brakeRear', '#Riparazioni', 'susp', 'body', '#Pilota', 'driverIdx',
    '#Preset', 'applyPitStrategy', 'pitStrategy'])
  expect(f.q('tr[data-f="fl"] td.lb').textContent).toBe('FL')
  expect(f.q('tr[data-f="fl"]').classList.contains('v4-half')).toBe(true)
  // Fixed ranges are not repeated on screen; the fuel range (it depends on the car) is.
  expect(f.q('tr[data-f="fl"] .v4-limit').classList.contains('v4-quiet')).toBe(true)
  expect(f.q('tr[data-f="fuel"] .v4-limit').classList.contains('v4-quiet')).toBe(false)
  // The canonical source-tag cell still exists (canonical code writes it) but the theme hides it.
  const css = [...f.w.document.querySelectorAll('style')].map((s: any) => s.textContent).join('\n')
  expect(css).toContain('#form tr[data-f] > td:nth-child(3)')
  expect(f.q('#refresh-draft').textContent).toBe('Usa valori attuali')
  // A crew with names needs no explanatory note under the driver select.
  f.snapshot({ strategy: car(), crew: [{ driverIndex: 0, name: 'Test Driver' }] })
  expect(f.q('tr[data-f="driverIdx"] div')).toBeNull()
})
