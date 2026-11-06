import { describe, expect, it } from 'vitest'
import { pageCode, pageShown, SLOW_PAGE_MS } from '~/services/monitoring/pageTiming'

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
