import { describe, expect, it, vi } from 'vitest'
import { installWindowOpeningProbe } from '../app/services/monitoring/windowOpeningProbe'
import { windowOpeningDiagnosticExplanation } from '../app/utils/diagnosticsPresentation'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
import { readFileSync } from 'node:fs'

describe('opening diagnostics', () => {
  it('announces support early but replies only after app mount, with no polling', () => {
    let listener: (p: { id?: unknown }) => void = () => {}
    const publish = vi.fn()
    const remove = vi.fn()
    const probe = installWindowOpeningProbe({
      onOpeningDiagnosticProbe: callback => { listener = callback; return remove },
      publishOpeningDiagnostic: publish,
    })
    expect(publish).toHaveBeenCalledWith({ version: 1, phase: 'capability' })
    listener({ id: 'early' }); expect(publish).toHaveBeenCalledTimes(1)
    probe.mounted(); listener({ id: 'challenge' })
    expect(publish).toHaveBeenLastCalledWith({ version: 1, phase: 'reply', id: 'challenge' })
    listener({ id: {} }); listener({ id: 'bad\n' }); expect(publish).toHaveBeenCalledTimes(3)
    probe.dispose(); listener({ id: 'late' }); probe.mounted()
    expect(publish).toHaveBeenCalledTimes(3); expect(remove).toHaveBeenCalledOnce()
  })
  it('old preload/browser and unavailable bridge do not break UI startup', () => {
    for (const api of [undefined, {}, { onOpeningDiagnosticProbe: () => { throw Error('closed') }, publishOpeningDiagnostic: () => { throw Error('closed') } }]) {
      expect(() => { const p = installWindowOpeningProbe(api); p.mounted(); p.dispose() }).not.toThrow()
    }
  })
  it('explains real outcomes without classifying every event as a window failure', () => {
    expect(windowOpeningDiagnosticExplanation('window_open_window_offscreen')).toContain('monitor')
    expect(windowOpeningDiagnosticExplanation('window_open_gpu_process_gone')).toContain('non dimostra')
    expect(windowOpeningDiagnosticExplanation('other_error')).toBeNull()
    expect(windowOpeningDiagnosticExplanation('window_open_future_code')).toBeNull()
  })
  it('the actual admin page compiles script and template, including the new detail', () => {
    const source = readFileSync(new URL('../app/pages/admin-diagnostics.vue', import.meta.url), 'utf8')
    const { descriptor, errors } = parse(source)
    expect(errors).toEqual([])
    expect(() => compileScript(descriptor, { id: 'admin-diagnostics-test' })).not.toThrow()
    expect(compileTemplate({ source: descriptor.template!.content, filename: 'admin-diagnostics.vue', id: 'admin-diagnostics-test' }).errors).toEqual([])
  })
})
