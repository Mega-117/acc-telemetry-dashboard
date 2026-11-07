import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// 07/11 (user): the standard window (1402x872) shows the whole Panoramica without scrolling, also with two races in the
// calendar. Prossima gara takes the spare height; Attività keeps its own size and its bars never grow past 280 px.
// Layout is checked in the real Suite (captures at 1416x908, 1920x1032, 2560x1440, 1416x790); this pins the rules.
const source = readFileSync(resolve(process.cwd(), 'app/components/pages/PanoramicaPage.vue'), 'utf8')

describe('Panoramica side column', () => {
  it('gives the spare height to the calendar, not to the activity chart', () => {
    const side = source.match(/\.racing-overview__side \{([^}]*)\}/)?.[1] ?? ''
    expect(side).toContain('grid-template-rows: 1fr auto')
    // The 1fr/2fr split made the column three times the calendar: two races pushed the page past the window.
    expect(source).not.toMatch(/grid-template-rows:\s*1fr 2fr/)
  })

  it('sizes the bars from the window, between their minimum and 280 px', () => {
    const chart = source.match(/\.racing-overview__side :deep\(\.activity-card--racing \.chart-area\) \{([^}]*)\}/)?.[1] ?? ''
    expect(chart).toMatch(/flex:\s*none/)
    expect(chart).toMatch(/height:\s*clamp\(var\(--overview-chart-min-height, 165px\), calc\(var\(--dashboard-viewport-height, 100dvh\) - 640px\), 280px\)/)
  })
})
