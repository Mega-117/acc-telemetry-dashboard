import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'
import { afterEach, expect, it, vi } from 'vitest'
const contextId = 'a'.repeat(64)
const opened: JSDOM[] = []
afterEach(() => { opened.splice(0).forEach(dom => dom.window.close()) })
function onlineForm() {
  const dom = new JSDOM(readFileSync(new URL('../../public/mfd-v4-online.html', import.meta.url), 'utf8'), { runScripts: 'outside-only' })
  opened.push(dom)
  const w = dom.window as any
  w.setInterval = () => 0
  const post = vi.spyOn(w, 'postMessage').mockImplementation(() => {})
  for (const script of w.document.querySelectorAll('script')) w.eval(script.textContent)
  const snapshot = (value: Record<string, unknown> = {}) => w.dispatchEvent(new w.MessageEvent('message', {
    source: w.parent, data: { channel: 'mfd-v4-online', type: 'snapshot', value: {
      contextId, ready: true, busy: false, crew: [{ driverIndex: 0, name: 'Test Driver' }], ...value,
    } },
  }))
  const field = (name: string) => w.document.querySelector(`[data-f="${name}"] input, input[data-f="${name}"]`)
  const edit = (name: string, value: string) => {
    const input = field(name); input.value = value
    input.dispatchEvent(new w.Event('input', { bubbles: true }))
    input.dispatchEvent(new w.Event('change', { bubbles: true }))
  }
  return { w, post, snapshot, field, edit }
}

it('initializes delayed and partial telemetry once, including zero, without following later car changes', () => {
  const { w, snapshot, field } = onlineForm()
  snapshot({ ready: false, strategy: null })
  snapshot({ strategy: { fuelToAdd: 0 } })
  expect(w.S.fuel).toBe(0)
  expect(field('fuel').value).toBe('0')
  snapshot({ strategy: { fuelToAdd: 30, tyreSet: 2, compound: 'dry', pressures: { FL: 25.15 } } })
  expect(w.S).toMatchObject({ fuel: 0, tyreSet: 3, compound: 'Dry', fl: 25.2, fr: null })
  snapshot({ strategy: { fuelToAdd: 40, pressures: { FL: 27, FR: 26 } } })
  expect(w.S).toMatchObject({ fuel: 0, fl: 25.2, fr: 26 })
})

it('preserves edited and deliberately cleared fields when delayed telemetry arrives', () => {
  const { w, snapshot, edit } = onlineForm()
  snapshot({ ready: false, strategy: null })
  edit('fuel', '12'); edit('fuel', '')
  snapshot({ strategy: { fuelToAdd: 30, tyreSet: 2 } })
  expect(w.S.fuel).toBeNull()
  expect(w.S.tyreSet).toBe(3)
  edit('fuel', '17')
  snapshot({ strategy: { fuelToAdd: 40 } })
  expect(w.S.fuel).toBe(17)
})

it('preserves unfinished typing and focus when readiness and initial telemetry arrive', () => {
  const { w, snapshot, field } = onlineForm()
  snapshot({ ready: false, strategy: null })
  const fuel = field('fuel'); fuel.focus(); fuel.value = '18'
  fuel.dispatchEvent(new w.Event('input', { bubbles: true }))
  snapshot({ strategy: { fuelToAdd: 30, tyreSet: 2 } })
  expect(field('fuel').value).toBe('18')
  expect(w.document.activeElement).toBe(field('fuel'))
  field('fuel').dispatchEvent(new w.Event('change', { bubbles: true }))
  expect(w.S.fuel).toBe(18)
})

it('restores draft choices including explicit blanks while filling remaining unknown fields', () => {
  const first = onlineForm()
  first.snapshot({ ready: false, strategy: null })
  first.edit('fuel', '12'); first.edit('fuel', '')
  const draft = (first.post.mock.calls.filter((c: any) => c[0].type === 'draft').at(-1)![0] as any).value
  const second = onlineForm()
  second.snapshot({ draft, strategy: { fuelToAdd: 30, tyreSet: 2 } })
  expect(second.w.S.fuel).toBeNull()
  expect(second.w.S.tyreSet).toBe(3)
})

it('updates LIVE indicators in place while preserving input identity, typing and outgoing intent', () => {
  const { w, snapshot, field, post } = onlineForm()
  snapshot({ strategy: { fuelToAdd: 15, tyreSet: 1, pressures: { FL: 25, FR: 25, RL: 25, RR: 25 } } })
  Object.assign(w.S, { changeTyre: true, compound: 'Dry', brakes: false, susp: false, body: false })
  w.renderForm()
  const indicator = (name: string) => w.document.querySelector(`tr[data-f="${name}"] .chk`).textContent
  expect(indicator('fuel')).toBe('✓'); expect(indicator('fl')).toBe('✓'); expect(indicator('tyreSet')).toBe('✓')
  const fuel = field('fuel'); fuel.focus(); fuel.value = '18'
  fuel.dispatchEvent(new w.Event('input', { bubbles: true }))
  snapshot({ strategy: { fuelToAdd: 30, tyreSet: 2, pressures: { FL: 26, FR: 25, RL: 25, RR: 25 } } })
  expect(indicator('fuel')).toBe('✗'); expect(indicator('fl')).toBe('✗'); expect(indicator('tyreSet')).toBe('✗')
  expect(field('fuel')).toBe(fuel); expect(w.document.activeElement).toBe(fuel); expect(fuel.value).toBe('18')
  fuel.dispatchEvent(new w.Event('change', { bubbles: true }))
  snapshot({ strategy: { fuelToAdd: 18, tyreSet: 1, pressures: { FL: 25, FR: 25, RL: 25, RR: 25 } } })
  expect(indicator('fuel')).toBe('✓'); expect(indicator('fl')).toBe('✓')
  expect(w.document.getElementById('apply').textContent).toBe('INVIA STRATEGIA AL PILOTA')
  w.document.getElementById('apply').click()
  const submit = (post.mock.calls.find((c: any) => c[0].type === 'submit')![0] as any).value
  expect(submit).toMatchObject({ operation: 'strategy', fuelLiters: 18, tyreSet: 2, changeTyres: true, pressures: { FL: 25, FR: 25, RL: 25, RR: 25 } })
})

it('keeps canonical numeric clamping visible after committing a focused edit', () => {
  const { w, snapshot, field, edit } = onlineForm()
  snapshot({ strategy: { fuelToAdd: 15 } })
  w.S.brakes = true; w.renderForm()
  field('brakeFront').focus(); edit('brakeFront', '8')
  expect(w.S.brakeFront).toBe(4)
  expect(field('brakeFront').value).toBe('4')
})

it('defers initial values during an order and seeds them as soon as it finishes', () => {
  const { w, snapshot } = onlineForm()
  snapshot({ busy: true, strategy: { fuelToAdd: 15 } })
  expect(w.S.fuel).toBeNull()
  snapshot({ busy: false, strategy: { fuelToAdd: 15 } })
  expect(w.S.fuel).toBe(15)
})

it('still allows an explicit refresh to replace a draft with the latest machine values', () => {
  const { w, snapshot, edit } = onlineForm()
  snapshot({ strategy: { fuelToAdd: 15 } }); edit('fuel', '17')
  snapshot({ strategy: { fuelToAdd: 30, tyreSet: 2, compound: 'wet' } })
  expect(w.S.fuel).toBe(17)
  ;(Array.from(w.document.querySelectorAll('button')) as HTMLButtonElement[]).find(button => button.textContent === 'Aggiorna bozza dai dati disponibili')!.click()
  expect(w.S).toMatchObject({ fuel: 30, tyreSet: 3, compound: 'Wet' })
})
it('canonical generated form handles unknowns, dependencies, names, zero and preset separately', () => {
  const dom = new JSDOM(readFileSync(new URL('../../public/mfd-v4-online.html', import.meta.url), 'utf8'), { runScripts: 'outside-only' })
  const w = dom.window as any
  w.setInterval = () => 0
  const post = vi.spyOn(w, 'postMessage').mockImplementation(() => {})
  for (const script of w.document.querySelectorAll('script')) w.eval(script.textContent)
  function snapshot(value: Record<string, unknown> = {}) {
    w.dispatchEvent(new w.MessageEvent('message', { source: w.parent, data: { channel: 'mfd-v4-online', type: 'snapshot', value: {
      contextId, ready: true, busy: false, crew: [{ driverIndex: 0, name: 'Enrico Saiani' }],
      strategy: { fuelToAdd: 0 }, ...value,
    } } }))
  }
  snapshot()
  expect(w.S.fuel).toBe(0); expect(w.S.changeTyre).toBe(null)
  expect(w.document.querySelector('input[data-f=changeTyre]').indeterminate).toBe(true)
  expect(w.document.querySelector('select[data-f=driverEntryIndex]').textContent).toContain('Enrico Saiani')
  expect(w.document.querySelector('select[data-f=driverEntryIndex]').disabled).toBe(false)
  snapshot({ ready: false })
  expect(w.document.querySelector('select[data-f=driverEntryIndex]').disabled).toBe(true)
  snapshot({ outcome: 'Esito precedente' })
  expect(w.document.querySelector('select[data-f=driverEntryIndex]').disabled).toBe(false)
  Object.assign(w.S, { changeTyre: false, brakes: false, susp: false, body: false })
  w.renderForm(); expect(w.document.querySelector('input[data-f=fl]').disabled).toBe(true)
  w.document.getElementById('apply').click()
  expect(w.document.body.textContent).not.toContain('Esito precedente')
  snapshot({ busy: true, outcome: 'Esito precedente' })
  expect(w.document.body.textContent).not.toContain('Esito precedente')
  let submit = post.mock.calls.find((c: any) => c[0].type === 'submit')?.[0] as any
  expect(submit.value).toMatchObject({ operation: 'strategy', fuelLiters: 0, changeTyres: false })
  expect(submit.value.pressures).toBeUndefined()
  snapshot(); post.mockClear(); w.S.applyPitStrategy = true; w.S.pitStrategy = 10; w.renderForm()
  w.document.getElementById('apply').click()
  submit = post.mock.calls.find((c: any) => c[0].type === 'submit')?.[0] as any
  expect(submit.value).toEqual({ version: 1, contextId, stepMs: 60, operation: 'preset', pitStrategy: 10 })
  snapshot({ outcome: 'Preset non disponibile' });
  expect(w.S.applyPitStrategy).toBe(false)
  expect(w.document.querySelector('input[data-f=fuel]').disabled).toBe(false)
  snapshot({ crew: [{ driverIndex: 0, name: 'Pilota arrivato dopo' }] })
  expect(w.document.querySelector('select[data-f=driverEntryIndex]').textContent).toContain('Pilota arrivato dopo')
  snapshot(); Object.assign(w.S, { applyPitStrategy: false, changeTyre: true, compound: 'Wet', brakes: true }); w.renderForm()
  expect(w.document.querySelector('input[data-f=tyreSet]').disabled).toBe(true)
  expect(w.document.querySelector('input[data-f=fl]').disabled).toBe(false)
  expect(w.document.querySelector('input[data-f=brakeFront]').disabled).toBe(false)
  const input = w.document.querySelector('input[data-f=fuel]'); input.value = ''; input.dispatchEvent(new w.Event('change', { bubbles: true }))
  expect(w.S.fuel).toBe(null)
  dom.window.close()
})
