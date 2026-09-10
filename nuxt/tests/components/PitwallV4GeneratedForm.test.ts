import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'
import { expect, it, vi } from 'vitest'
const contextId = 'a'.repeat(64)
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
  Object.assign(w.S, { changeTyre: false, brakes: false, susp: false, body: false })
  w.renderForm(); expect(w.document.querySelector('input[data-f=fl]').disabled).toBe(true)
  w.document.getElementById('apply').click()
  let submit = post.mock.calls.find((c: any) => c[0].type === 'submit')?.[0] as any
  expect(submit.value).toMatchObject({ operation: 'strategy', fuelLiters: 0, changeTyres: false })
  expect(submit.value.pressures).toBeUndefined()
  snapshot(); post.mockClear(); w.S.applyPitStrategy = true; w.S.pitStrategy = 10; w.renderForm()
  w.document.getElementById('apply').click()
  submit = post.mock.calls.find((c: any) => c[0].type === 'submit')?.[0] as any
  expect(submit.value).toEqual({ version: 1, contextId, stepMs: 60, operation: 'preset', pitStrategy: 10 })
  snapshot(); Object.assign(w.S, { applyPitStrategy: false, changeTyre: true, compound: 'Wet', brakes: true }); w.renderForm()
  expect(w.document.querySelector('input[data-f=tyreSet]').disabled).toBe(true)
  expect(w.document.querySelector('input[data-f=fl]').disabled).toBe(false)
  expect(w.document.querySelector('input[data-f=brakeFront]').disabled).toBe(false)
  const input = w.document.querySelector('input[data-f=fuel]'); input.value = ''; input.dispatchEvent(new w.Event('change', { bubbles: true }))
  expect(w.S.fuel).toBe(null)
  dom.window.close()
})
