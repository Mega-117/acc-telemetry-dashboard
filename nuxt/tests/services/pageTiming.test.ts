import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createNavigationClock, createStartupMark, pageCode, pageShown, pageTimingNote, SLOW_PAGE_MS } from '~/services/monitoring/pageTiming'

describe('start-up page (PIP-755)', () => {
  it('the window first page is its start-up, every later page is a click', () => {
    // R2 08/11 (3e818519, 0.5.3): the Panoramica 1717 ms, the first page 7 s after the app opened.
    const isStartup = createStartupMark()
    const first = pageShown('/', 0, 1717)!
    expect(pageTimingNote(first, isStartup())).toEqual({ event: 'page.slow', page: 1, ms: 1717, startup: 1 })
    expect(pageTimingNote(pageShown('/sessioni/x', 0, 1381)!, isStartup())).toEqual({ event: 'page.slow', page: 3, ms: 1381, startup: 0 })
    expect(pageTimingNote(pageShown('/dati', 0, 20)!, isStartup())).toEqual({ event: 'page.shown', page: 8, ms: 20, startup: 0 })
    expect(createStartupMark()()).toBe(true) // one mark per window
  })

  it('the plugin marks only a page of the main window, after the paint', () => {
    const plugin = readFileSync(resolve(process.cwd(), 'app/plugins/page-timing.client.ts'), 'utf8')
    const guard = plugin.indexOf('if (!shown) return')
    expect(guard).toBeGreaterThan(-1)
    expect(plugin.indexOf('noteFeatureUse(pageTimingNote(shown, isStartup()))')).toBeGreaterThan(guard)
    expect(plugin.match(/isStartup\(\)/g)).toHaveLength(1)
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
