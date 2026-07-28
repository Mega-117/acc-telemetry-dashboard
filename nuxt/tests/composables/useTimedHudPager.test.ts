import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTimedHudPager } from '~/composables/useTimedHudPager'

describe('useTimedHudPager', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-28T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  function makePager(initialPage: 'live' | 'setup' = 'live') {
    return useTimedHudPager({
      defaultPage: 'live' as const,
      initialPage,
      temporaryDurationMs: 30_000,
      progressTickMs: 100,
    })
  }

  it('parte dalla pagina principale senza timer', () => {
    const pager = makePager()
    pager.start()
    expect(pager.activePage.value).toBe('live')
    expect(pager.isTemporaryPage.value).toBe(false)
    expect(pager.progress.value).toBe(0)
  })

  it('mostra SETUP per 30 secondi e poi torna a LIVE', () => {
    const pager = makePager()
    pager.selectPage('setup')
    vi.advanceTimersByTime(15_000)
    expect(pager.activePage.value).toBe('setup')
    expect(pager.progress.value).toBeCloseTo(0.5, 1)
    vi.advanceTimersByTime(15_000)
    expect(pager.activePage.value).toBe('live')
    expect(pager.progress.value).toBe(0)
  })

  it('un secondo click SETUP riavvia l’intera finestra temporale', () => {
    const pager = makePager()
    pager.selectPage('setup')
    vi.advanceTimersByTime(20_000)
    pager.selectPage('setup')
    vi.advanceTimersByTime(20_000)
    expect(pager.activePage.value).toBe('setup')
    vi.advanceTimersByTime(10_000)
    expect(pager.activePage.value).toBe('live')
  })

  it('il click LIVE ritorna immediatamente e cancella il timer', () => {
    const pager = makePager()
    pager.selectPage('setup')
    vi.advanceTimersByTime(5_000)
    pager.selectPage('live')
    expect(pager.activePage.value).toBe('live')
    vi.advanceTimersByTime(30_000)
    expect(pager.activePage.value).toBe('live')
  })

  it('avvia il timer anche per una pagina temporanea iniziale di QA', () => {
    const pager = makePager('setup')
    pager.start()
    vi.advanceTimersByTime(30_000)
    expect(pager.activePage.value).toBe('live')
  })
  it('mantiene TARGET aperta senza timeout quando la pagina non e temporanea', () => {
    const pager = makePager()
    pager.selectPage('setup', false)
    vi.advanceTimersByTime(120_000)
    expect(pager.activePage.value).toBe('setup')
    expect(pager.isTemporaryPage.value).toBe(false)
    expect(pager.progress.value).toBe(0)
    pager.selectPage('live')
    expect(pager.activePage.value).toBe('live')
  })

  it('non avvia timer per una pagina iniziale dichiarata persistente', () => {
    const pager = useTimedHudPager({
      defaultPage: 'live' as const,
      initialPage: 'setup' as const,
      initialPageTemporary: false,
      temporaryDurationMs: 30_000,
    })
    pager.start()
    vi.advanceTimersByTime(120_000)
    expect(pager.activePage.value).toBe('setup')
    expect(pager.isTemporaryPage.value).toBe(false)
  })

})
