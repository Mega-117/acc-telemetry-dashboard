import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createNavigationClock, createPageTimingRecorder, pageCode, pageShown, pageTimingNote, SLOW_PAGE_MS } from '~/services/monitoring/pageTiming'

describe('start-up page (PIP-755)', () => {
  const START = { path: '/', matched: [] }
  const route = (path: string) => ({ path, matched: [{}] })

  function run(recorder: ReturnType<typeof createPageTimingRecorder>, to: ReturnType<typeof route>, from: { path: string, matched: unknown[] }, paintedAt: number) {
    recorder.start(to, from)
    const timed = recorder.take(to)
    if (!timed) return null
    return pageTimingNote(pageShown(to.path, timed.startedAt, paintedAt)!, timed.startup)
  }

  it('the root page sending to the Panoramica before any input is the start-up', () => {
    // R2 08/11 (3e818519, 0.5.3): the Panoramica 1717 ms, 7 s after the app opened.
    const recorder = createPageTimingRecorder(() => 0)
    const root = route('/')
    expect(run(recorder, root, START, 0)).toBeNull() // the initial navigation is never timed
    expect(run(recorder, route('/panoramica'), root, 1717)).toEqual({ event: 'page.slow', page: 1, ms: 1717, startup: 1 })
    recorder.noteUserInput()
    expect(run(recorder, route('/sessioni/x'), route('/panoramica'), 1381)).toEqual({ event: 'page.slow', page: 3, ms: 1381, startup: 0 })
  })

  it('after a direct load of a page the first click is a click (Codex review 09/11)', () => {
    const recorder = createPageTimingRecorder(() => 0)
    const panoramica = route('/panoramica')
    expect(run(recorder, panoramica, START, 0)).toBeNull()
    recorder.noteUserInput()
    expect(run(recorder, route('/sessioni'), panoramica, 1800)).toEqual({ event: 'page.slow', page: 2, ms: 1800, startup: 0 })
  })

  it('the plugin feeds clicks and keys, and marks after the paint', () => {
    const plugin = readFileSync(resolve(process.cwd(), 'app/plugins/page-timing.client.ts'), 'utf8')
    expect(plugin).toContain("for (const type of ['pointerdown', 'keydown'] as const)")
    expect(plugin).toContain('recorder.noteUserInput()')
    expect(plugin).toContain('recorder.start(to, from)')
    const guard = plugin.indexOf('if (!shown) return')
    expect(guard).toBeGreaterThan(-1)
    expect(plugin.indexOf('noteFeatureUse(pageTimingNote(shown, timed.startup))')).toBeGreaterThan(guard)
  })
})

describe('page timing spy (PIP-742)', () => {
  it('main-window pages get their code, never the path; other windows are not pages', () => {
    expect(pageCode('/')).toBe(1)
    expect(pageCode('/panoramica')).toBe(1)
    expect(pageCode('/sessioni')).toBe(2)
    expect(pageCode('/sessioni/abc123')).toBe(3)
    expect(pageCode('/dati')).toBe(8)
    expect(pageCode('/qualcosa-di-nuovo')).toBe(0)
    for (const path of ['/standings-overlay', '/overlay-surface', '/training-overlay', '/runtime-bootstrap', '/dev-upload', '/admin/x']) {
      expect(pageCode(path)).toBeNull()
    }
  })

  it('a second or more is slow', () => {
    expect(pageShown('/dati', 100, 100 + SLOW_PAGE_MS - 1)).toEqual({ page: 8, ms: SLOW_PAGE_MS - 1, slow: 0 })
    expect(pageShown('/sessioni/x', 100, 100 + SLOW_PAGE_MS)).toEqual({ page: 3, ms: SLOW_PAGE_MS, slow: 1 })
    expect(pageShown('/standings-overlay', 0, 5000)).toBeNull()
    expect(pageShown('/dati', 200, 100)).toBeNull()
  })
})

describe('navigation clock (Codex 06/11)', () => {
  it('a cancelled navigation does not clear the next one', () => {
    let t = 0
    const clock = createNavigationClock(() => t)
    const a = { path: '/sessioni' }, b = { path: '/dati' }
    clock.start(a); t = 10
    clock.start(b); t = 20
    expect(clock.take(a)).toBe(0)       // A cancelled: only its own clock
    expect(clock.take(b)).toBe(10)      // B still timed
    expect(clock.take(b)).toBeNull()    // taken once
  })
})
