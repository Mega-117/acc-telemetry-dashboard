import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'
import { afterEach, expect, it, vi } from 'vitest'
const contextId = 'a'.repeat(64)
const opened: JSDOM[] = []

it('shows only matching visual outcomes and invalidates edited fields and their dependencies', () => {
  const { w, snapshot } = onlineForm()
  const fields = {
    changeTyres: { requested: true, observed: true, outcome: 'verified', source: 'visual' },
    compound: { requested: 'dry', observed: 'dry', outcome: 'verified', source: 'visual' },
    brakes: { requested: false, observed: false, outcome: 'verified', source: 'visual' },
    repairSuspension: { requested: false, observed: true, outcome: 'mismatch', source: 'visual' },
    repairBodywork: { requested: false, outcome: 'unknown', source: 'visual' },
    driverId: { requested: 0, observed: 0, outcome: 'verified', source: 'visual-name' },
  }
  const verification = { orderId: 'one', contextId, fields }
  const mark = (id: string) => w.document.querySelector(`tr[data-f="${id}"] .chk`).textContent
  snapshot({ draft: { changeTyre: true, compound: 'Dry', brakes: false, susp: false, body: false, driverEntryIndex: 0 }, verification })
  expect(mark('changeTyre')).toBe('✓'); expect(mark('compound')).toBe('✓')
  expect(mark('brakes')).toBe('✓'); expect(mark('driverIdx')).toBe('✓')
  expect(mark('susp')).toBe('✕'); expect(mark('body')).toBe('—'); expect(mark('brakeFront')).toBe('—')
  const input = w.document.querySelector('input[data-f="changeTyre"]')
  input.checked = false; input.dispatchEvent(new w.Event('change', { bubbles: true }))
  expect(mark('changeTyre')).toBe('—'); expect(mark('compound')).toBe('—')
  snapshot({ verification }); expect(mark('changeTyre')).toBe('—')
  snapshot({ verification: { ...verification, orderId: 'two', fields: { ...fields, changeTyres: { ...fields.changeTyres, requested: false, observed: false } } } })
  expect(mark('changeTyre')).toBe('✓')
  snapshot({ verification, busy: true }); expect(mark('brakes')).toBe('—')
  snapshot({ verification: { ...verification, contextId: 'other' } }); expect(mark('brakes')).toBe('—')
  snapshot({ verification: { ...verification, fields: { brakes: { ...fields.brakes, source: 'convergence' } } } }); expect(mark('brakes')).toBe('—')
  snapshot({ verification, draft: { verificationOrder: 'one', invalidatedChecks: ['brakes'] } }); expect(mark('brakes')).toBe('—')
  snapshot({ verification: { ...verification, orderId: 'three' } }); expect(mark('brakes')).toBe('✓')
})
afterEach(() => { opened.splice(0).forEach(dom => dom.window.close()) })
function onlineForm() {
  const dom = new JSDOM(readFileSync(new URL('../../public/mfd-v4-online.html', import.meta.url), 'utf8'), { runScripts: 'outside-only', pretendToBeVisual: true })
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
  expect(w.document.getElementById('apply').textContent).toBe('Invia strategia')
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

it('confirms replacing edited live fields, supports cancel and never submits on restore', () => {
  const { w, snapshot, edit, post } = onlineForm()
  snapshot({ strategy: { fuelToAdd: 15 } }); edit('fuel', '17')
  snapshot({ strategy: { fuelToAdd: 30, tyreSet: 2, compound: 'wet' } })
  const refresh = w.document.getElementById('refresh-draft')
  const confirmation = w.document.querySelector('.draft-confirm')
  refresh.click()
  expect(confirmation.hidden).toBe(false)
  expect(w.S.fuel).toBe(17)
  confirmation.querySelector('button').click()
  expect(confirmation.hidden).toBe(true)
  expect(w.S.fuel).toBe(17)
  refresh.click(); confirmation.querySelectorAll('button')[1].click()
  expect(w.S).toMatchObject({ fuel: 30, tyreSet: 3, compound: 'Wet' })
  expect(confirmation.hidden).toBe(true)
  expect(post.mock.calls.some((c: any) => c[0].type === 'submit')).toBe(false)
  snapshot({ strategy: { fuelToAdd: 35 } }); refresh.click()
  expect(w.S.fuel).toBe(35)
  expect(confirmation.hidden).toBe(true)
})

it('hides timing outside development and ignores a development draft timing', () => {
  const { w, snapshot } = onlineForm()
  snapshot({ development: false, draft: { stepMs: 150 }, recipientLabel: 'RICO117' })
  expect(w.document.querySelector('.v4-dev-tools').hidden).toBe(true)
  expect(w.document.getElementById('gap').value).toBe('60')
  expect(w.document.getElementById('apply').textContent).toBe('Invia strategia a RICO117')
  snapshot({ development: true })
  expect(w.document.querySelector('.v4-dev-tools').hidden).toBe(false)
  const developer = onlineForm()
  developer.snapshot({ development: true, draft: { stepMs: 150 } })
  expect(developer.w.document.getElementById('gap').value).toBe('150')
})

it('blocks restore while busy or without telemetry and preserves a restored edited draft', () => {
  const { w, snapshot, post } = onlineForm()
  snapshot({ draft: { fuel: 17, edited: true }, strategy: { fuelToAdd: 30 } })
  const refresh = w.document.getElementById('refresh-draft')
  refresh.click()
  expect(w.document.querySelector('.draft-confirm').hidden).toBe(false)
  snapshot({ busy: true, strategy: { fuelToAdd: 30 } })
  expect(refresh.disabled).toBe(true)
  w.document.querySelectorAll('.draft-confirm button')[1].click()
  expect(w.S.fuel).toBe(17)
  expect(w.document.querySelector('.draft-confirm').hidden).toBe(true)
  snapshot({ strategy: null })
  expect(refresh.disabled).toBe(true)
  expect(post.mock.calls.some((c: any) => c[0].type === 'submit')).toBe(false)
})
it('canonical generated form handles unknowns, dependencies, names, zero and preset separately', () => {
  const dom = new JSDOM(readFileSync(new URL('../../public/mfd-v4-online.html', import.meta.url), 'utf8'), { runScripts: 'outside-only', pretendToBeVisual: true })
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

it('keeps the operational console inside the closed development accordion', () => {
  const { w, snapshot } = onlineForm()
  const tools = w.document.querySelector('.v4-dev-tools')
  const consolePanel = w.document.querySelector('.v4-console')
  expect(tools.contains(consolePanel)).toBe(true)
  expect(tools.open).toBe(false)
  snapshot({ development: false, outcome: 'Ordine verificato' })
  expect(tools.hidden).toBe(true)
  expect(consolePanel.textContent).toContain('Ordine verificato')
  snapshot({ development: true, outcome: 'Ordine verificato' })
  expect(tools.hidden).toBe(false)
  expect(tools.open).toBe(false)
  tools.open = true
  expect(consolePanel.textContent).toContain('Ordine verificato')
})
it('exposes validation and remote failures outside developer console, without stale success during send', () => {
  const { w, snapshot, post } = onlineForm()
  snapshot()
  w.document.getElementById('apply').click()
  const result = w.document.getElementById('strategy-result')
  expect(result.hidden).toBe(false)
  expect(result.closest('details')).toBeNull()
  expect(result.textContent).toContain('Controlla la strategia')
  expect(post.mock.calls.some((c: any) => c[0].type === 'submit')).toBe(false)
  snapshot({ result: { label: 'Impostata e confermata', problem: false } })
  expect(result.textContent).toContain('Controlla la strategia')
  Object.assign(w.S, { fuel: 1, changeTyre: false, brakes: false, susp: false, body: false })
  w.renderForm(); w.document.getElementById('apply').click()
  snapshot({ result: { label: 'Rifiutata', reason: 'Barra MFD non riconosciuta', problem: true } })
  expect(result.textContent).toContain('Barra MFD non riconosciuta')
  snapshot({ busy: true, result: { label: 'Impostata e confermata', problem: false } })
  expect(result.textContent).toContain('Invio in corso')
  expect(result.textContent).not.toContain('confermata')
  snapshot({ result: { label: 'Impostata e confermata', problem: false } })
  expect(result.textContent).toContain('Impostata e confermata')
})
it('corrects a visually detected suspension mismatch and checks it again', async () => {
  const { w, snapshot } = onlineForm(); snapshot()
  w.L = { driver:false }
  const plan = { changeTyre:true, compound:'Wet', brakes:false, susp:true, body:true, driverIdx:null }
  const reading = (susp: boolean) => ({ tyreOn:true, dry:false, read:{tyreCheck:true, brakeCheck:false, susp, body:true} })
  w.leggiPannello = vi.fn().mockResolvedValueOnce(reading(false)).mockResolvedValueOnce(reading(true))
  w.correggi = vi.fn().mockResolvedValue(true)
  expect(await w.verificaVisiva(plan)).toBe(true)
  expect(w.correggi).toHaveBeenCalledWith([{campo:'susp',letto:false,voluto:true}],plan)
  expect(w.leggiPannello).toHaveBeenCalledTimes(2)
  w.leggiPannello = vi.fn().mockResolvedValue(null); w.correggi.mockClear()
  expect(await w.verificaVisiva(plan)).toBeNull()
  expect(w.correggi).not.toHaveBeenCalled()
})
